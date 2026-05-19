import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMediaStream } from '../hooks/useMediaStream';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoCallInterface from '../components/video/VideoCallInterface';
import VideoCallModal from '../components/video/VideoCallModal';
import { AnimatePresence } from 'framer-motion';

export interface VideoCallManagerHandle {
  startCall: (receiverId: string, receiverAlias: string) => Promise<void>;
}

const VideoCallManager = forwardRef<VideoCallManagerHandle, { socket: any }>((props, ref) => {
  const { user } = useAuth();
  const { localStream, startStream, stopStream, toggleAudio, toggleVideo } = useMediaStream();
  const { 
    callState, 
    callerInfo, 
    remoteStream, 
    initiateCall, 
    acceptCall, 
    rejectCall, 
    endCall
  } = useWebRTC(props.socket, user?.id);

  const [receiverAlias, setReceiverAlias] = useState('');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  useImperativeHandle(ref, () => ({
    startCall: async (receiverId: string, alias: string) => {
      setReceiverAlias(alias);
      const stream = await startStream();
      if (stream) {
        await initiateCall(receiverId, stream);
      }
    }
  }));

  const handleAccept = async () => {
    if (callerInfo && callerInfo.offer) {
      setReceiverAlias(callerInfo.alias);
      const stream = await startStream();
      if (stream) {
        await acceptCall(callerInfo.id, callerInfo.offer, stream);
      }
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
        {(callState === 'calling' || callState === 'connected' || callState === 'failed') && (
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
          />
        )}
      </AnimatePresence>
    </>
  );
});

export default VideoCallManager;
