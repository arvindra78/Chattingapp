import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'rejected' | 'failed';

type IncomingCall = {
  id: string;
  alias: string;
  offer: RTCSessionDescriptionInit;
  callId: string;
};

type ResetReason = 'manual' | 'ended' | 'rejected' | 'failed' | 'unmount';

const parseTurnUrls = (value: string | undefined) =>
  value?.split(',').map((url) => url.trim()).filter(Boolean) || [];

const TURN_URLS = parseTurnUrls(import.meta.env.VITE_TURN_URLS);
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME?.trim();
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL?.trim();
const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  import.meta.env.VITE_ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all';

const rtcConfig: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ]
    },
    ...(TURN_URLS.length && TURN_USERNAME && TURN_CREDENTIAL
      ? [{
          urls: TURN_URLS,
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL
        }]
      : [])
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: ICE_TRANSPORT_POLICY
};

const VIDEO_MAX_BITRATE = 500_000;
const DEGRADED_VIDEO_BITRATE = 280_000;
const VIDEO_MAX_FRAMERATE = 24;
const DEGRADED_VIDEO_FRAMERATE = 15;
const DISCONNECT_GRACE_MS = 12_000;
const DELAYED_IDLE_MS = 1_200;
const STATS_INTERVAL_MS = 5_000;
const MAX_ICE_RESTARTS = 1;

const createCallId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getCandidateKey = (candidate: RTCIceCandidateInit) =>
  candidate.candidate || `${candidate.sdpMid || ''}:${candidate.sdpMLineIndex ?? ''}`;

export const useWebRTC = (socket: Socket | null, _userId: string | undefined) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callerInfo, setCallerInfo] = useState<IncomingCall | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const targetUserIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const stateRef = useRef<CallState>('idle');
  const remoteCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const localCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const seenRemoteCandidateKeysRef = useRef<Set<string>>(new Set());
  const seenLocalCandidateKeysRef = useRef<Set<string>>(new Set());
  const disconnectTimerRef = useRef<number | null>(null);
  const delayedResetTimerRef = useRef<number | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const offerInFlightRef = useRef(false);
  const iceRestartCountRef = useRef(0);
  const iceRestartInFlightRef = useRef(false);
  const degradedVideoRef = useRef(false);
  const lastStatsRef = useRef<{
    timestamp: number;
    bytesSent: number;
    framesEncoded: number;
    packetsLost: number;
    packetsReceived: number;
  } | null>(null);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    stateRef.current = callState;
  }, [callState]);

  const log = useCallback((scope: 'WebRTC' | 'Signaling' | 'ICE' | 'Media' | 'Recovery', message: string, details: Record<string, unknown> = {}) => {
    const pc = peerRef.current;
    console.log(`[${scope}] ${message}`, {
      callId: callIdRef.current,
      callState: stateRef.current,
      signalingState: pc?.signalingState,
      connectionState: pc?.connectionState,
      iceConnectionState: pc?.iceConnectionState,
      ...details
    });
  }, []);

  const clearDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  }, []);

  const clearDelayedResetTimer = useCallback(() => {
    if (delayedResetTimerRef.current) {
      window.clearTimeout(delayedResetTimerRef.current);
      delayedResetTimerRef.current = null;
    }
  }, []);

  const stopStatsMonitor = useCallback(() => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    lastStatsRef.current = null;
  }, []);

  const stopStreamTracks = useCallback((stream: MediaStream | null, label: 'local' | 'remote') => {
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      if (track.readyState !== 'ended') {
        log('Media', `Stopping ${label} ${track.kind} track`, { trackId: track.id });
        track.stop();
      }
    });
  }, [log]);

  const closePeer = useCallback(() => {
    const pc = peerRef.current;
    if (!pc) return;

    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.onsignalingstatechange = null;
    pc.onicegatheringstatechange = null;
    pc.onnegotiationneeded = null;
    pc.close();
    peerRef.current = null;
  }, []);

  const resetCall = useCallback((nextState: CallState = 'idle', reason: ResetReason = 'manual') => {
    const endingCallId = callIdRef.current;
    log('WebRTC', 'Resetting call', { nextState, reason, endingCallId });
    clearDisconnectTimer();
    clearDelayedResetTimer();
    stopStatsMonitor();
    closePeer();
    stopStreamTracks(localStreamRef.current, 'local');
    stopStreamTracks(remoteStreamRef.current, 'remote');
    setRemoteStream(null);
    setCallerInfo(null);
    remoteStreamRef.current = null;
    targetUserIdRef.current = null;
    callIdRef.current = null;
    localStreamRef.current = null;
    remoteCandidateQueueRef.current = [];
    localCandidateQueueRef.current = [];
    seenRemoteCandidateKeysRef.current.clear();
    seenLocalCandidateKeysRef.current.clear();
    offerInFlightRef.current = false;
    iceRestartCountRef.current = 0;
    iceRestartInFlightRef.current = false;
    degradedVideoRef.current = false;
    setCallState(nextState);
  }, [clearDelayedResetTimer, clearDisconnectTimer, closePeer, log, stopStatsMonitor, stopStreamTracks]);

  const scheduleIdleReset = useCallback((expectedCallId: string | null, delayMs = DELAYED_IDLE_MS) => {
    clearDelayedResetTimer();
    delayedResetTimerRef.current = window.setTimeout(() => {
      if (callIdRef.current === expectedCallId || !expectedCallId) {
        resetCall('idle', 'manual');
      } else {
        log('WebRTC', 'Skipped stale delayed reset', { expectedCallId, activeCallId: callIdRef.current });
      }
    }, delayMs);
  }, [clearDelayedResetTimer, log, resetCall]);

  const emitSignal = useCallback((event: string, payload: Record<string, unknown>) => {
    const activeSocket = socketRef.current;
    if (!activeSocket?.connected) {
      log('Signaling', 'Socket unavailable for signal', { event });
      return false;
    }

    activeSocket.emit(event, payload);
    return true;
  }, [log]);

  const tuneVideoSender = useCallback(async (
    pc: RTCPeerConnection,
    maxBitrate = VIDEO_MAX_BITRATE,
    maxFramerate = VIDEO_MAX_FRAMERATE
  ) => {
    const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender) return;

    try {
      const params = sender.getParameters();
      params.encodings = [{
        ...(params.encodings?.[0] || {}),
        maxBitrate,
        maxFramerate
      }];
      await sender.setParameters(params);
      log('Media', 'Applied video sender limits', { maxBitrate, maxFramerate });
    } catch (err) {
      log('Media', 'Video sender tuning skipped', { err });
    }
  }, [log]);

  const degradeVideoQuality = useCallback(async (reason: string) => {
    const pc = peerRef.current;
    if (!pc || degradedVideoRef.current) return;
    degradedVideoRef.current = true;
    log('Recovery', 'Degrading video quality for mobile/weak network', { reason });
    await tuneVideoSender(pc, DEGRADED_VIDEO_BITRATE, DEGRADED_VIDEO_FRAMERATE);
  }, [log, tuneVideoSender]);

  const flushLocalCandidates = useCallback(() => {
    const receiverId = targetUserIdRef.current;
    if (!receiverId || !socketRef.current?.connected || !localCandidateQueueRef.current.length) return;

    log('ICE', 'Flushing local ICE candidates', { count: localCandidateQueueRef.current.length });
    while (localCandidateQueueRef.current.length) {
      const candidate = localCandidateQueueRef.current.shift();
      if (candidate) {
        emitSignal('ice-candidate', {
          receiverId,
          candidate,
          callId: callIdRef.current
        });
      }
    }
  }, [emitSignal, log]);

  const flushRemoteCandidates = useCallback(async () => {
    const pc = peerRef.current;
    if (!pc?.remoteDescription) return;

    log('ICE', 'Flushing remote ICE candidates', { count: remoteCandidateQueueRef.current.length });
    while (remoteCandidateQueueRef.current.length) {
      const candidate = remoteCandidateQueueRef.current.shift();
      if (!candidate) continue;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        log('ICE', 'Added queued remote ICE candidate');
      } catch (err) {
        log('ICE', 'Failed to add queued ICE candidate', { err });
      }
    }
  }, [log]);

  const restartIce = useCallback(async () => {
    const pc = peerRef.current;
    const receiverId = targetUserIdRef.current;
    if (!pc || !receiverId || iceRestartInFlightRef.current) return;

    if (iceRestartCountRef.current >= MAX_ICE_RESTARTS) {
      log('Recovery', 'ICE restart limit reached');
      setCallState('failed');
      return;
    }

    if (pc.signalingState !== 'stable') {
      log('Recovery', 'ICE restart deferred because signaling is not stable');
      return;
    }

    try {
      iceRestartInFlightRef.current = true;
      iceRestartCountRef.current += 1;
      log('Recovery', 'Attempting ICE restart', { attempt: iceRestartCountRef.current });
      pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      emitSignal('call-user', {
        receiverId,
        offer,
        callId: callIdRef.current,
        iceRestart: true
      });
    } catch (err) {
      log('Recovery', 'ICE restart failed', { err });
      setCallState('failed');
    } finally {
      iceRestartInFlightRef.current = false;
    }
  }, [emitSignal, log]);

  const startStatsMonitor = useCallback(() => {
    stopStatsMonitor();
    statsTimerRef.current = window.setInterval(async () => {
      const pc = peerRef.current;
      if (!pc || pc.connectionState === 'closed') return;

      try {
        const stats = await pc.getStats();
        let bytesSent = 0;
        let framesEncoded = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let selectedLocalType: string | undefined;
        let selectedRemoteType: string | undefined;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent += report.bytesSent || 0;
            framesEncoded += report.framesEncoded || 0;
          }
          if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
            const local = stats.get(report.localCandidateId);
            const remote = stats.get(report.remoteCandidateId);
            selectedLocalType = local?.candidateType;
            selectedRemoteType = remote?.candidateType;
          }
        });

        const now = Date.now();
        const previous = lastStatsRef.current;
        if (previous) {
          const seconds = Math.max((now - previous.timestamp) / 1000, 1);
          const bitrate = ((bytesSent - previous.bytesSent) * 8) / seconds;
          const encodedFrames = framesEncoded - previous.framesEncoded;
          const lostDelta = packetsLost - previous.packetsLost;
          const receivedDelta = packetsReceived - previous.packetsReceived;
          const lossRatio = lostDelta > 0 ? lostDelta / Math.max(lostDelta + receivedDelta, 1) : 0;

          if (stateRef.current === 'connected' && bitrate <= 1_000) {
            log('Recovery', 'Possible frozen outbound video or zero bitrate', { bitrate, encodedFrames });
            void degradeVideoQuality('zero-bitrate');
          }

          if (stateRef.current === 'connected' && encodedFrames <= 0) {
            log('Recovery', 'Possible frozen encoder', { encodedFrames });
          }

          if (lossRatio > 0.08) {
            log('Recovery', 'Packet loss spike detected', { lossRatio, lostDelta, receivedDelta });
            void degradeVideoQuality('packet-loss');
          }
        }

        if (pc.iceConnectionState === 'disconnected') {
          log('Recovery', 'Stats monitor sees disconnected ICE transport');
        }

        log('WebRTC', 'Connection stats sample', {
          selectedLocalType,
          selectedRemoteType
        });

        lastStatsRef.current = {
          timestamp: now,
          bytesSent,
          framesEncoded,
          packetsLost,
          packetsReceived
        };
      } catch (err) {
        log('WebRTC', 'getStats failed', { err });
      }
    }, STATS_INTERVAL_MS);
  }, [degradeVideoQuality, log, stopStatsMonitor]);

  const attachTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    stream.getTracks().forEach((track) => {
      log('Media', 'addTrack', {
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState
      });
      pc.addTrack(track, stream);
    });

    void tuneVideoSender(pc);
  }, [log, tuneVideoSender]);

  const createPeerConnection = useCallback((remoteUserId: string, stream: MediaStream) => {
    if (peerRef.current && peerRef.current.connectionState !== 'closed') {
      throw new Error('A video call is already active');
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;
    targetUserIdRef.current = remoteUserId;
    localStreamRef.current = stream;

    log('WebRTC', 'Created peer connection', {
      remoteUserId,
      hasTurn: TURN_URLS.length > 0,
      iceTransportPolicy: rtcConfig.iceTransportPolicy
    });

    attachTracks(pc, stream);

    pc.ontrack = (event) => {
      log('Media', 'ontrack', {
        kind: event.track.kind,
        streams: event.streams.length,
        muted: event.track.muted,
        readyState: event.track.readyState
      });

      const inboundStream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamRef.current = inboundStream;
      setRemoteStream(inboundStream);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        log('ICE', 'ICE gathering complete');
        return;
      }

      const candidate = event.candidate.toJSON();
      const key = getCandidateKey(candidate);
      if (seenLocalCandidateKeysRef.current.has(key)) {
        log('ICE', 'Skipping duplicate local candidate');
        return;
      }
      seenLocalCandidateKeysRef.current.add(key);

      log('ICE', 'Local ICE candidate', {
        type: event.candidate.type,
        protocol: event.candidate.protocol
      });

      const payload = {
        receiverId: remoteUserId,
        candidate,
        callId: callIdRef.current
      };

      if (!emitSignal('ice-candidate', payload)) {
        localCandidateQueueRef.current.push(candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      log('WebRTC', 'connectionstatechange');

      if (pc.connectionState === 'connected') {
        clearDisconnectTimer();
        iceRestartCountRef.current = 0;
        setCallState('connected');
        startStatsMonitor();
      }

      if (pc.connectionState === 'disconnected') {
        clearDisconnectTimer();
        disconnectTimerRef.current = window.setTimeout(() => {
          if (peerRef.current?.connectionState === 'disconnected') {
            log('Recovery', 'Peer stayed disconnected past grace period');
            void restartIce();
          }
        }, DISCONNECT_GRACE_MS);
      }

      if (pc.connectionState === 'failed') {
        clearDisconnectTimer();
        void restartIce();
      }

      if (pc.connectionState === 'closed') {
        clearDisconnectTimer();
        stopStatsMonitor();
      }
    };

    pc.oniceconnectionstatechange = () => {
      log('ICE', 'iceconnectionstatechange');
      if (pc.iceConnectionState === 'failed') {
        void restartIce();
      }
    };

    pc.onsignalingstatechange = () => {
      log('Signaling', 'signalingstatechange');
    };

    pc.onicegatheringstatechange = () => {
      log('ICE', 'icegatheringstatechange');
    };

    pc.onnegotiationneeded = () => {
      log('Signaling', 'negotiationneeded ignored; explicit call flow controls SDP');
    };

    return pc;
  }, [
    attachTracks,
    clearDisconnectTimer,
    emitSignal,
    log,
    restartIce,
    startStatsMonitor,
    stopStatsMonitor
  ]);

  const handleRestartOffer = useCallback(async (callerId: string, offer: RTCSessionDescriptionInit, callId: string) => {
    const pc = peerRef.current;
    if (!pc || callIdRef.current !== callId || targetUserIdRef.current !== callerId) return false;
    if (pc.signalingState !== 'stable') {
      log('Recovery', 'Ignoring ICE restart offer while signaling is unstable');
      return true;
    }

    try {
      log('Recovery', 'Applying ICE restart offer');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushRemoteCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitSignal('answer-call', { callerId, answer, callId });
    } catch (err) {
      log('Recovery', 'Failed to answer ICE restart offer', { err });
      setCallState('failed');
    }
    return true;
  }, [emitSignal, flushRemoteCandidates, log]);

  const initiateCall = useCallback(async (receiverId: string, stream: MediaStream) => {
    clearDelayedResetTimer();
    if (offerInFlightRef.current || stateRef.current !== 'idle') {
      log('WebRTC', 'Ignoring duplicate outgoing call request', {
        offerInFlight: offerInFlightRef.current
      });
      return;
    }

    try {
      offerInFlightRef.current = true;
      callIdRef.current = createCallId();
      setCallState('calling');

      const pc = createPeerConnection(receiverId, stream);
      if (pc.signalingState !== 'stable') {
        throw new Error(`Cannot create offer in ${pc.signalingState} state`);
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      log('Signaling', 'createOffer complete');
      await pc.setLocalDescription(offer);
      log('Signaling', 'setLocalDescription offer complete');

      emitSignal('call-user', {
        receiverId,
        offer,
        callId: callIdRef.current
      });
    } catch (err) {
      log('WebRTC', 'Outgoing call failed', { err });
      resetCall('failed', 'failed');
    } finally {
      offerInFlightRef.current = false;
    }
  }, [clearDelayedResetTimer, createPeerConnection, emitSignal, log, resetCall]);

  const acceptCall = useCallback(async (callerId: string, offer: RTCSessionDescriptionInit, stream: MediaStream) => {
    clearDelayedResetTimer();
    const activeCallId = callerInfo?.callId || createCallId();

    try {
      callIdRef.current = activeCallId;
      setCallState('connecting');

      const pc = createPeerConnection(callerId, stream);
      if (pc.signalingState !== 'stable') {
        throw new Error(`Cannot accept offer in ${pc.signalingState} state`);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      log('Signaling', 'setRemoteDescription offer complete');
      await flushRemoteCandidates();

      const answer = await pc.createAnswer();
      log('Signaling', 'createAnswer complete');
      await pc.setLocalDescription(answer);
      log('Signaling', 'setLocalDescription answer complete');

      emitSignal('answer-call', {
        callerId,
        answer,
        callId: activeCallId
      });
    } catch (err) {
      log('WebRTC', 'Accept call failed', { err });
      resetCall('failed', 'failed');
    }
  }, [
    callerInfo?.callId,
    clearDelayedResetTimer,
    createPeerConnection,
    emitSignal,
    flushRemoteCandidates,
    log,
    resetCall
  ]);

  const rejectCall = useCallback((callerId: string) => {
    const activeCallId = callIdRef.current || callerInfo?.callId || null;
    emitSignal('reject-call', { callerId, callId: activeCallId });
    resetCall('rejected', 'rejected');
    scheduleIdleReset(activeCallId);
  }, [callerInfo?.callId, emitSignal, resetCall, scheduleIdleReset]);

  const endCall = useCallback(() => {
    const activeCallId = callIdRef.current || callerInfo?.callId || null;
    const receiverId = targetUserIdRef.current || callerInfo?.id;
    if (receiverId) {
      emitSignal('end-call', { receiverId, callId: activeCallId });
    }
    resetCall('idle', 'manual');
  }, [callerInfo?.callId, callerInfo?.id, emitSignal, resetCall]);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = async ({ callerId, callerAlias, offer, callId, iceRestart }: {
      callerId: string;
      callerAlias: string;
      offer: RTCSessionDescriptionInit;
      callId?: string;
      iceRestart?: boolean;
    }) => {
      const activeCallId = callId || createCallId();
      log('Signaling', 'incoming-call', { callerId, callerAlias, callId: activeCallId, iceRestart });

      if (iceRestart || callIdRef.current === activeCallId) {
        const handled = await handleRestartOffer(callerId, offer, activeCallId);
        if (handled) return;
      }

      if (stateRef.current !== 'idle') {
        log('Signaling', 'Busy; rejecting incoming call', { callerId });
        socket.emit('reject-call', { callerId, callId: activeCallId });
        return;
      }

      targetUserIdRef.current = callerId;
      callIdRef.current = activeCallId;
      setCallerInfo({
        id: callerId,
        alias: callerAlias || 'User',
        offer,
        callId: activeCallId
      });
      setCallState('ringing');
    };

    const handleCallAnswered = async ({ answer, answererId, callId }: {
      answer: RTCSessionDescriptionInit;
      answererId: string;
      callId?: string;
    }) => {
      log('Signaling', 'call-answered', { answererId, callId });
      const pc = peerRef.current;
      if (!pc) return;
      if (callIdRef.current && callId && callIdRef.current !== callId) return;

      if (pc.signalingState !== 'have-local-offer') {
        log('Signaling', 'Ignoring answer in wrong signaling state');
        return;
      }

      try {
        setCallState('connecting');
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log('Signaling', 'setRemoteDescription answer complete');
        await flushRemoteCandidates();
      } catch (err) {
        log('Signaling', 'Failed to apply answer', { err });
        resetCall('failed', 'failed');
      }
    };

    const handleIceCandidate = async ({ candidate, senderId, callId }: {
      candidate: RTCIceCandidateInit;
      senderId: string;
      callId?: string;
    }) => {
      if (!candidate) return;
      if (targetUserIdRef.current && targetUserIdRef.current !== senderId) {
        log('ICE', 'Ignoring ICE from unexpected sender', { senderId });
        return;
      }

      if (callIdRef.current && callId && callIdRef.current !== callId) {
        log('ICE', 'Ignoring ICE for stale call', { staleCallId: callId });
        return;
      }

      const key = getCandidateKey(candidate);
      if (seenRemoteCandidateKeysRef.current.has(key)) {
        log('ICE', 'Skipping duplicate remote candidate');
        return;
      }
      seenRemoteCandidateKeysRef.current.add(key);

      const pc = peerRef.current;
      if (!pc?.remoteDescription) {
        log('ICE', 'Queueing remote ICE candidate');
        remoteCandidateQueueRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        log('ICE', 'addIceCandidate complete');
      } catch (err) {
        log('ICE', 'addIceCandidate failed', { err });
      }
    };

    const handleCallRejected = ({ callId }: { callId?: string } = {}) => {
      if (callIdRef.current && callId && callIdRef.current !== callId) return;
      const activeCallId = callIdRef.current;
      log('Signaling', 'call-rejected');
      resetCall('rejected', 'rejected');
      scheduleIdleReset(activeCallId, 1_500);
    };

    const handleCallEnded = ({ callId }: { callId?: string } = {}) => {
      if (callIdRef.current && callId && callIdRef.current !== callId) return;
      const activeCallId = callIdRef.current;
      log('Signaling', 'call-ended');
      resetCall('ended', 'ended');
      scheduleIdleReset(activeCallId, 1_000);
    };

    const handleConnect = () => {
      log('Signaling', 'socket connected');
      flushLocalCandidates();
    };

    const handleDisconnect = (reason: string) => {
      log('Signaling', 'socket disconnected; keeping peer connection alive', { reason });
    };

    socket.off('incoming-call', handleIncomingCall);
    socket.off('call-answered', handleCallAnswered);
    socket.off('ice-candidate', handleIceCandidate);
    socket.off('call-rejected', handleCallRejected);
    socket.off('call-ended', handleCallEnded);
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-answered', handleCallAnswered);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-answered', handleCallAnswered);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [
    flushLocalCandidates,
    flushRemoteCandidates,
    handleRestartOffer,
    log,
    resetCall,
    scheduleIdleReset,
    socket
  ]);

  useEffect(() => {
    return () => {
      resetCall('idle', 'unmount');
    };
  }, [resetCall]);

  return {
    callState,
    callerInfo,
    remoteStream,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall
  };
};
