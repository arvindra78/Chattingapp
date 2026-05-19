import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'failed';

export const useWebRTC = (socket: Socket | null, _userId: string | undefined) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callerInfo, setCallerId] = useState<{ id: string, alias: string, offer: any } | null>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const targetUserId = useRef<string | null>(null);
  const candidateQueue = useRef<RTCIceCandidateInit[]>([]);

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

  const createPeerConnection = useCallback((remotePeerId: string, stream: MediaStream) => {
    console.log(`[WebRTC] Creating RTCPeerConnection for peer: ${remotePeerId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    stream.getTracks().forEach(track => {
      console.log(`[WebRTC] Adding local track to PC: ${track.kind}`);
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received: ${event.track.kind}`);
      // Force a new MediaStream instance to trigger React re-render
      setRemoteStream(prev => {
        const streamToUse = event.streams[0] || new MediaStream();
        if (!event.streams[0]) {
          streamToUse.addTrack(event.track);
        }
        console.log(`[WebRTC] Updating remote stream with ${streamToUse.getTracks().length} tracks`);
        return new MediaStream(streamToUse.getTracks());
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('[WebRTC] Generated local ICE candidate');
        socket.emit('ice-candidate', {
          receiverId: remotePeerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] Connection state change: ${state}`);
      if (state === 'connected') setCallState('connected');
      if (state === 'failed') {
        console.error('[WebRTC] Connection failed. Triggering recovery/cleanup.');
        setCallState('failed');
        setTimeout(cleanup, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state change: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        setCallState('failed');
        setTimeout(cleanup, 3000);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state change: ${pc.signalingState}`);
    };

    peerConnection.current = pc;
    return pc;
  }, [socket, cleanup]);

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
    
    // Switch to connected (or connecting) immediately to mount the video UI
    setCallState('connected');

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

    socket.on('incoming-call', ({ callerId, callerAlias, offer }) => {
      console.log(`[Signaling] Received incoming call from ${callerAlias} (${callerId})`);
      setCallerId({ id: callerId, alias: callerAlias, offer });
      setCallState('ringing');
    });

    socket.on('call-answered', async ({ answer, answererId }) => {
      console.log(`[Signaling] Call answered by ${answererId}`);
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[WebRTC] Set remote description from answer');
          await processCandidateQueue();
        } catch (e) {
          console.error('[WebRTC] Error applying remote answer:', e);
        }
      }
    });

    socket.on('call-rejected', () => {
      console.log('[Signaling] Peer rejected the call');
      setCallState('rejected');
      setTimeout(cleanup, 2000);
    });

    socket.on('ice-candidate', async ({ candidate, senderId }) => {
      // Validate candidate origin
      if (targetUserId.current && senderId !== targetUserId.current) {
        console.warn('[Signaling] Received ICE candidate from unexpected sender. Ignoring.');
        return;
      }

      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[WebRTC] Added remote ICE candidate');
        } catch (e) {
          console.error('[WebRTC] Error adding remote candidate:', e);
        }
      } else {
        console.log('[WebRTC] Queuing remote ICE candidate (remoteDescription not ready)');
        candidateQueue.current.push(candidate);
      }
    });

    socket.on('call-ended', () => {
      console.log('[Signaling] Received call-ended event');
      setCallState('ended');
      setTimeout(cleanup, 2000);
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-answered');
      socket.off('call-rejected');
      socket.off('ice-candidate');
      socket.off('call-ended');
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
