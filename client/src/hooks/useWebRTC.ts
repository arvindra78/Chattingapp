import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const parseTurnUrls = (value: string | undefined) =>
  value?.split(',').map((url) => url.trim()).filter(Boolean) || [];

const TURN_URLS = parseTurnUrls(import.meta.env.VITE_TURN_URLS);
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME?.trim();
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL?.trim();
const ICE_TRANSPORT_POLICY = import.meta.env.VITE_ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all';

const RTC_CONFIG: RTCConfiguration = {
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
const VIDEO_MAX_FRAMERATE = 24;

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'rejected' | 'failed';

export const useWebRTC = (socket: Socket | null, _userId: string | undefined) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callerInfo, setCallerId] = useState<{ id: string, alias: string, offer: any } | null>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const targetUserId = useRef<string | null>(null);
  const candidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callStateRef = useRef<CallState>('idle');

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const logSelectedCandidatePair = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          const localCandidate = stats.get(report.localCandidateId);
          const remoteCandidate = stats.get(report.remoteCandidateId);
          console.log('[WebRTC] Selected candidate pair', {
            localType: localCandidate?.candidateType,
            localProtocol: localCandidate?.protocol,
            remoteType: remoteCandidate?.candidateType,
            remoteProtocol: remoteCandidate?.protocol,
            usingTurnRelay: localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay'
          });
        }
      });
    } catch (err) {
      console.warn('[WebRTC] Failed to inspect selected candidate pair:', err);
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Initiating full cleanup');
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.onconnectionstatechange = null;
      peerConnection.current.oniceconnectionstatechange = null;
      peerConnection.current.onsignalingstatechange = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setRemoteStream(null);
    remoteStreamRef.current = null;
    setCallState('idle');
    setCallerId(null);
    targetUserId.current = null;
    candidateQueue.current = [];
    localStreamRef.current = null;
  }, []);

  const processCandidateQueue = useCallback(async () => {
    if (!peerConnection.current || !peerConnection.current.remoteDescription) {
      console.log('[WebRTC] Queue process deferred: Remote description not yet set');
      return;
    }
    
    console.log(`[WebRTC] Processing ${candidateQueue.current.length} queued candidates`);
    while (candidateQueue.current.length > 0) {
      const candidate = candidateQueue.current.shift();
      if (candidate) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[WebRTC] Successfully added queued ICE candidate');
        } catch (e) {
          console.error('[WebRTC] Failed to add queued candidate:', e);
        }
      }
    }
  }, []);

  const applyVideoSenderParameters = useCallback(async (pc: RTCPeerConnection) => {
    const videoSender = pc.getSenders().find(sender => sender.track?.kind === 'video');
    if (!videoSender) return;

    try {
      const params = videoSender.getParameters();
      params.encodings = [{
        ...(params.encodings?.[0] || {}),
        maxBitrate: VIDEO_MAX_BITRATE,
        maxFramerate: VIDEO_MAX_FRAMERATE
      }];
      await videoSender.setParameters(params);
      console.log('[WebRTC] Applied video sender parameters', params.encodings[0]);
    } catch (err) {
      console.warn('[WebRTC] Could not apply video sender parameters:', err);
    }
  }, []);

  const createPeerConnection = useCallback((remotePeerId: string, stream: MediaStream) => {
    console.log(`[WebRTC] Creating RTCPeerConnection for peer: ${remotePeerId}`);
    console.log('[WebRTC] ICE config', {
      hasTurn: TURN_URLS.length > 0,
      iceTransportPolicy: RTC_CONFIG.iceTransportPolicy,
      iceCandidatePoolSize: RTC_CONFIG.iceCandidatePoolSize
    });
    const pc = new RTCPeerConnection(RTC_CONFIG);
    
    stream.getTracks().forEach(track => {
      console.log(`[WebRTC] Adding local track to PC: ${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}`);
      pc.addTrack(track, stream);
    });
    void applyVideoSenderParameters(pc);

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received: ${event.track.kind}, streams=${event.streams.length}, muted=${event.track.muted}`);
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      const inboundStream = event.streams[0];
      const nextTracks = inboundStream?.getTracks() || [event.track];
      nextTracks.forEach((track) => {
        const alreadyAdded = remoteStreamRef.current?.getTracks().some(existing => existing.id === track.id);
        if (!alreadyAdded) {
          remoteStreamRef.current?.addTrack(track);
        }
      });

      console.log(`[WebRTC] Updating remote stream with ${remoteStreamRef.current.getTracks().length} tracks`);
      setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('[WebRTC] Sending ICE candidate', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port
        });
        socket.emit('ice-candidate', {
          receiverId: remotePeerId,
          candidate: event.candidate
        });
      } else if (!event.candidate) {
        console.log('[WebRTC] ICE candidate gathering complete');
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] Connection state change: ${state}`);
      if (state === 'connected') {
        setCallState('connected');
        void logSelectedCandidatePair(pc);
      }
      if (state === 'connecting') setCallState('connecting');
      if (state === 'disconnected') {
        console.warn('[WebRTC] Peer connection temporarily disconnected; waiting for ICE recovery');
      }
      if (state === 'failed' || state === 'closed') {
        console.error(`[WebRTC] Connection ${state}. Triggering cleanup.`);
        setCallState('failed');
        setTimeout(cleanup, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state change: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        void logSelectedCandidatePair(pc);
      }
      if (pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] ICE temporarily disconnected; keeping call alive for mobile network recovery');
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        setCallState('failed');
        setTimeout(cleanup, 3000);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state change: ${pc.signalingState}`);
    };

    peerConnection.current = pc;
    return pc;
  }, [socket, cleanup, applyVideoSenderParameters, logSelectedCandidatePair]);

  // Actions
  const initiateCall = useCallback(async (receiverId: string, stream: MediaStream) => {
    if (!socket) return;
    console.log(`[WebRTC] Starting call initiation sequence to: ${receiverId}`);
    localStreamRef.current = stream;
    targetUserId.current = receiverId;
    setCallState('calling');

    try {
      const pc = createPeerConnection(receiverId, stream);
      const offer = await pc.createOffer();
      console.log('[WebRTC] Created local SDP offer');
      await pc.setLocalDescription(offer);
      socket.emit('call-user', { receiverId, offer });
    } catch (err) {
      console.error('[WebRTC] Error during initiateCall:', err);
      setCallState('failed');
    }
  }, [socket, createPeerConnection]);

  const acceptCall = useCallback(async (callerId: string, offer: RTCSessionDescriptionInit, stream: MediaStream) => {
    if (!socket) return;
    console.log(`[WebRTC] Acceptance sequence started for caller: ${callerId}`);
    localStreamRef.current = stream;
    targetUserId.current = callerId;
    
    setCallState('connecting');

    try {
      const pc = createPeerConnection(callerId, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC] Set remote description from incoming offer');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WebRTC] Created and set local SDP answer');
      socket.emit('answer-call', { callerId, answer });
      
      await processCandidateQueue();
    } catch (err) {
      console.error('[WebRTC] Error during acceptCall:', err);
      setCallState('failed');
    }
  }, [socket, createPeerConnection, processCandidateQueue]);

  const rejectCall = useCallback((callerId: string) => {
    if (!socket) return;
    console.log(`[WebRTC] Rejecting call request from: ${callerId}`);
    socket.emit('reject-call', { callerId });
    cleanup();
  }, [socket, cleanup]);

  const endCall = useCallback(() => {
    if (socket && targetUserId.current) {
      console.log(`[WebRTC] Explicitly ending call with: ${targetUserId.current}`);
      socket.emit('end-call', { receiverId: targetUserId.current });
    }
    cleanup();
  }, [socket, cleanup]);

  // Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = ({ callerId, callerAlias, offer }: { callerId: string; callerAlias: string; offer: RTCSessionDescriptionInit }) => {
      console.log(`[Signaling] Received incoming call from ${callerAlias} (${callerId})`);
      setCallerId({ id: callerId, alias: callerAlias, offer });
      setCallState('ringing');
    };

    const handleCallAnswered = async ({ answer, answererId }: { answer: RTCSessionDescriptionInit; answererId: string }) => {
      console.log(`[Signaling] Call answered by ${answererId}`);
      if (peerConnection.current) {
        try {
          setCallState('connecting');
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[WebRTC] Set remote description from answer');
          await processCandidateQueue();
        } catch (e) {
          console.error('[WebRTC] Error applying remote answer:', e);
        }
      }
    };

    const handleCallRejected = () => {
      console.log('[Signaling] Peer rejected the call');
      setCallState('rejected');
      setTimeout(cleanup, 2000);
    };

    const handleIceCandidate = async ({ candidate, senderId }: { candidate: RTCIceCandidateInit; senderId: string }) => {
      // Validate candidate origin
      if (targetUserId.current && senderId !== targetUserId.current) {
        console.warn('[Signaling] Received ICE candidate from unexpected sender. Ignoring.');
        return;
      }

      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[WebRTC] Added remote ICE candidate', {
            senderId,
            candidateType: candidate.candidate?.match(/ typ (\w+)/)?.[1]
          });
        } catch (e) {
          console.error('[WebRTC] Error adding remote candidate:', e);
        }
      } else {
        console.log('[WebRTC] Queuing remote ICE candidate (remoteDescription not ready)');
        candidateQueue.current.push(candidate);
      }
    };

    const handleCallEnded = () => {
      console.log('[Signaling] Received call-ended event');
      setCallState('ended');
      setTimeout(cleanup, 2000);
    };

    const handleSocketReconnect = () => {
      console.log('[Signaling] Socket reconnected during call state:', callStateRef.current);
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-answered', handleCallAnswered);
    socket.on('call-rejected', handleCallRejected);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', handleCallEnded);
    socket.on('connect', handleSocketReconnect);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-answered', handleCallAnswered);
      socket.off('call-rejected', handleCallRejected);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended', handleCallEnded);
      socket.off('connect', handleSocketReconnect);
    };
  }, [socket, cleanup, processCandidateQueue]);

  return {
    callState,
    callerInfo,
    remoteStream,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    setCallState
  };
};
