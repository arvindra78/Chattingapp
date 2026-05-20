import { useState, useCallback, useRef } from 'react';

export type MediaErrorType = 'permission-denied' | 'no-device' | 'device-busy' | 'unsupported-browser' | 'unknown-media-error';

const classifyMediaError = (err: any): MediaErrorType => {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported-browser';
  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') return 'permission-denied';
  if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') return 'no-device';
  if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') return 'device-busy';
  return 'unknown-media-error';
};

export const useMediaStream = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<MediaErrorType | null>(null);
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
      setErrorType(null);
      setCameraDenied(false);
      setMicrophoneDenied(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorType('unsupported-browser');
        setError('This browser does not support camera and microphone access.');
        return null;
      }

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
      console.error('[Media] Error accessing media devices:', err);
      const message = err.message || 'Could not access camera/microphone';
      const nextErrorType = classifyMediaError(err);
      setErrorType(nextErrorType);
      setCameraDenied(nextErrorType === 'permission-denied' || nextErrorType === 'no-device');
      setMicrophoneDenied(nextErrorType === 'permission-denied' || nextErrorType === 'no-device');
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
    errorType,
    cameraDenied,
    microphoneDenied
  };
};
