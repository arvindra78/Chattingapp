import { useState, useCallback, useRef } from 'react';

export const useMediaStream = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [microphoneDenied, setMicrophoneDenied] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const setTrackedStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
  }, []);

  const startStream = useCallback(async () => {
    try {
      setError(null);
      setCameraDenied(false);
      setMicrophoneDenied(false);

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setTrackedStream(stream);
      return stream;
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      const message = err.message || 'Could not access camera/microphone';
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setCameraDenied(isPermissionDenied || err.name === 'NotFoundError');
      setMicrophoneDenied(isPermissionDenied || err.name === 'NotFoundError');
      setError(message);
      return null;
    }
  }, [setTrackedStream]);

  const stopStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      setTrackedStream(null);
    }
  }, [setTrackedStream]);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, []);

  return {
    localStream,
    startStream,
    stopStream,
    toggleVideo,
    toggleAudio,
    error,
    cameraDenied,
    microphoneDenied
  };
};
