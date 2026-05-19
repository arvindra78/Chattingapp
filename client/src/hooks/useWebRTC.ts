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
    console.log('[WebRTC] Cleaning up call resources');
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.onconnectionstatechange = null;
      peerConnection.current.oniceconnectionstatechange = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setRemoteStream(null);
    setCallState('idle');
    setCallerId(null);
    targetUserId.current = null;
    candidateQueue.current = [];
  }, []);

  const processCandidateQueue = useCallback(async () => {
    if (!peerConnection.current || !peerConnection.current.remoteDescription) return;
    
    console.log(`[WebRTC] Processing ${candidateQueue.current.length} queued candidates`);
    while (candidateQueue.current.length > 0) {
      const candidate = candidateQueue.current.shift();
      if (candidate) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[WebRTC] Error adding queued candidate', e);
        }
      }
    }
  }, []);

  const createPeerConnection = useCallback((receiverId: string, stream: MediaStream) => {
    console.log('[WebRTC] Creating RTCPeerConnection');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    stream.getTracks().forEach(track => {
      console.log(`[WebRTC] Adding local track: ${track.kind}`);
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track: ${event.track.kind}`);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        // Fallback for browsers that don't provide streams in the event
        setRemoteStream(prev => {
          if (prev) {
            prev.addTrack(event.track);
            return prev;
          }
          const newStream = new MediaStream();
          newStream.addTrack(event.track);
          return newStream;
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          receiverId,
          candidate: event.candidate
        });
      }
    };

    const handleStateChange = () => {
      const state = pc.connectionState || pc.iceConnectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      
      if (state === 'connected') setCallState('connected');
      if (state === 'failed') {
        setCallState('failed');
        setTimeout(cleanup, 3000);
      }
      if (state === 'closed') cleanup();
    };

    pc.onconnectionstatechange = handleStateChange;
    pc.oniceconnectionstatechange = handleStateChange;

    peerConnection.current = pc;
    return pc;
  }, [socket, cleanup]);

  // Actions
  const initiateCall = useCallback(async (receiverId: string, stream: MediaStream) => {
    if (!socket) return;
    console.log(`[WebRTC] Initiating call to ${receiverId}`);
    localStreamRef.current = stream;
    targetUserId.current = receiverId;
    setCallState('calling');

    const pc = createPeerConnection(receiverId, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call-user', { receiverId, offer });
  }, [socket, createPeerConnection]);

  const acceptCall = useCallback(async (callerId: string, offer: RTCSessionDescriptionInit, stream: MediaStream) => {
    if (!socket) return;
    console.log(`[WebRTC] Accepting call from ${callerId}`);
    localStreamRef.current = stream;
    targetUserId.current = callerId;

    const pc = createPeerConnection(callerId, stream);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer-call', { callerId, answer });
    
    // Process any candidates that arrived while we were setting up
    await processCandidateQueue();
  }, [socket, createPeerConnection, processCandidateQueue]);

  const rejectCall = useCallback((callerId: string) => {
    if (!socket) return;
    console.log(`[WebRTC] Rejecting call from ${callerId}`);
    socket.emit('reject-call', { callerId });
    cleanup();
  }, [socket, cleanup]);

  const endCall = useCallback(() => {
    if (socket && targetUserId.current) {
      console.log(`[WebRTC] Ending call with ${targetUserId.current}`);
      socket.emit('end-call', { receiverId: targetUserId.current });
    }
    cleanup();
  }, [socket, cleanup]);

  // Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('incoming-call', ({ callerId, callerAlias, offer }) => {
      console.log(`[WebRTC] Incoming call event from ${callerAlias}`);
      setCallerId({ id: callerId, alias: callerAlias, offer });
      setCallState('ringing');
    });

    socket.on('call-answered', async ({ answer }) => {
      console.log('[WebRTC] Call answered event received');
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
          await processCandidateQueue();
        } catch (e) {
          console.error('[WebRTC] Error setting remote description from answer', e);
        }
      }
    });

    socket.on('call-rejected', () => {
      console.log('[WebRTC] Call rejected by peer');
      setCallState('rejected');
      setTimeout(cleanup, 2000);
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[WebRTC] Error adding ice candidate', e);
        }
      } else {
        console.log('[WebRTC] Queuing incoming ICE candidate');
        candidateQueue.current.push(candidate);
      }
    });

    socket.on('call-ended', () => {
      console.log('[WebRTC] Call ended by peer');
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
