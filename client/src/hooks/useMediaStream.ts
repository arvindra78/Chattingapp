import { useState, useCallback } from 'react';

export const useMediaStream = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      setError(err.message || 'Could not access camera/microphone');
      return null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  }, [localStream]);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [localStream]);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [localStream]);

  return {
    localStream,
    startStream,
    stopStream,
    toggleVideo,
    toggleAudio,
    error
  };
};
