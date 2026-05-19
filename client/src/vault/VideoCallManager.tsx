import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMediaStream } from '../hooks/useMediaStream';
import { useWebRTC } from '../hooks/useWebRTC';
import { useCallSounds } from '../hooks/useCallSounds';
import VideoCallInterface from '../components/video/VideoCallInterface';
import VideoCallModal from '../components/video/VideoCallModal';
import { AnimatePresence } from 'framer-motion';

export interface VideoCallManagerHandle {
  startCall: (receiverId: string, receiverAlias: string) => Promise<void>;
}

const VideoCallManager = forwardRef<VideoCallManagerHandle, { socket: any }>((props, ref) => {
  const { user } = useAuth();
  const { localStream, startStream, stopStream, toggleAudio, toggleVideo, error: mediaError, cameraDenied, microphoneDenied } = useMediaStream();
  const { 
    callState, 
    callerInfo, 
    remoteStream, 
    initiateCall, 
    acceptCall, 
    rejectCall, 
    endCall
  } = useWebRTC(props.socket, user?.id);

  // Initialize call sounds
  useCallSounds(callState);

  const [receiverAlias, setReceiverAlias] = useState('');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [pendingMediaRetry, setPendingMediaRetry] = useState(false);
  const pendingCallRef = useRef<
    | { type: 'outgoing'; receiverId: string; alias: string }
    | { type: 'incoming'; callerId: string; alias: string; offer: RTCSessionDescriptionInit }
    | null
  >(null);

  const startMediaForPendingCall = async () => {
    const pendingCall = pendingCallRef.current;
    if (!pendingCall) return;

    const stream = await startStream();
    if (!stream) {
      setPendingMediaRetry(true);
      return;
    }

    setPendingMediaRetry(false);
    setIsMicEnabled(true);
    setIsVideoEnabled(true);

    if (pendingCall.type === 'outgoing') {
      await initiateCall(pendingCall.receiverId, stream);
    } else {
      await acceptCall(pendingCall.callerId, pendingCall.offer, stream);
    }
  };

  useImperativeHandle(ref, () => ({
    startCall: async (receiverId: string, alias: string) => {
      setReceiverAlias(alias);
      pendingCallRef.current = { type: 'outgoing', receiverId, alias };
      await startMediaForPendingCall();
    }
  }));

  const handleAccept = async () => {
    if (callerInfo && callerInfo.offer) {
      setReceiverAlias(callerInfo.alias);
      pendingCallRef.current = { type: 'incoming', callerId: callerInfo.id, alias: callerInfo.alias, offer: callerInfo.offer };
      await startMediaForPendingCall();
    }
  };

  const handleReject = () => {
    if (callerInfo) {
      rejectCall(callerInfo.id);
    }
  };

  const handleEnd = () => {
    endCall();
    stopStream();
    pendingCallRef.current = null;
    setPendingMediaRetry(false);
  };

  const handleToggleMic = (enabled: boolean) => {
    setIsMicEnabled(enabled);
    toggleAudio(enabled);
  };

  const handleToggleVideo = (enabled: boolean) => {
    setIsVideoEnabled(enabled);
    toggleVideo(enabled);
  };

  // Cleanup on ended state
  useEffect(() => {
    if (callState === 'ended' || callState === 'idle') {
      stopStream();
      if (callState === 'idle') {
        pendingCallRef.current = null;
      }
    }
  }, [callState, stopStream]);

  return (
    <>
      <AnimatePresence>
        {callState === 'ringing' && callerInfo && (
          <VideoCallModal
            callerAlias={callerInfo.alias}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(callState === 'calling' || callState === 'connecting' || callState === 'connected' || callState === 'failed' || pendingMediaRetry) && (
          <VideoCallInterface
            localStream={localStream}
            remoteStream={remoteStream}
            callState={callState}
            onEndCall={handleEnd}
            onToggleMic={handleToggleMic}
            onToggleVideo={handleToggleVideo}
            receiverAlias={receiverAlias}
            isMicEnabled={isMicEnabled}
            isVideoEnabled={isVideoEnabled}
            mediaError={mediaError}
            cameraDenied={cameraDenied}
            microphoneDenied={microphoneDenied}
            onRetryMedia={startMediaForPendingCall}
          />
        )}
      </AnimatePresence>
    </>
  );
});

export default VideoCallManager;
