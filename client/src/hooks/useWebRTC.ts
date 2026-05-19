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

  const cleanup = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setRemoteStream(null);
    setCallState('idle');
    setCallerId(null);
    targetUserId.current = null;
  }, []);

  const createPeerConnection = useCallback((receiverId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          receiverId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected');
      if (pc.connectionState === 'failed') setCallState('failed');
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        cleanup();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [socket, cleanup]);

  // Actions
  const initiateCall = useCallback(async (receiverId: string, stream: MediaStream) => {
    if (!socket) return;
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
    localStreamRef.current = stream;
    targetUserId.current = callerId;

    const pc = createPeerConnection(callerId, stream);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer-call', { callerId, answer });
    setCallState('connected');
  }, [socket, createPeerConnection]);

  const rejectCall = useCallback((callerId: string) => {
    if (!socket) return;
    socket.emit('reject-call', { callerId });
    cleanup();
  }, [socket, cleanup]);

  const endCall = useCallback(() => {
    if (socket && targetUserId.current) {
      socket.emit('end-call', { receiverId: targetUserId.current });
    }
    cleanup();
  }, [socket, cleanup]);

  // Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('incoming-call', ({ callerId, callerAlias, offer }) => {
      setCallerId({ id: callerId, alias: callerAlias, offer });
      setCallState('ringing');
    });

    socket.on('call-answered', async ({ answer }) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('connected');
      }
    });

    socket.on('call-rejected', () => {
      setCallState('rejected');
      setTimeout(cleanup, 2000);
    });

    socket.on('webrtc-offer', async (_data) => {
      // In case of mid-call re-negotiation (advanced)
    });

    socket.on('webrtc-answer', async ({ answer }) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ice candidate', e);
        }
      }
    });

    socket.on('call-ended', () => {
      setCallState('ended');
      setTimeout(cleanup, 2000);
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-answered');
      socket.off('call-rejected');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('ice-candidate');
      socket.off('call-ended');
    };
  }, [socket, cleanup]);

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
