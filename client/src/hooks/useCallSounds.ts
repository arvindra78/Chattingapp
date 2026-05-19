import { useEffect, useRef, useCallback } from 'react';
import type { CallState } from './useWebRTC';

const OUTGOING_RING_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-waiting-ring-tone-1354.mp3';
const INCOMING_RING_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-outgoing-call-signal-alert-2198.mp3';

export const useCallSounds = (callState: CallState) => {
  const outgoingAudio = useRef<HTMLAudioElement | null>(null);
  const incomingAudio = useRef<HTMLAudioElement | null>(null);

  const stopAll = useCallback(() => {
    if (outgoingAudio.current) {
      outgoingAudio.current.pause();
      outgoingAudio.current.currentTime = 0;
    }
    if (incomingAudio.current) {
      incomingAudio.current.pause();
      incomingAudio.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    // Initialize audio objects
    if (!outgoingAudio.current) {
      outgoingAudio.current = new Audio(OUTGOING_RING_URL);
      outgoingAudio.current.loop = true;
    }
    if (!incomingAudio.current) {
      incomingAudio.current = new Audio(INCOMING_RING_URL);
      incomingAudio.current.loop = true;
    }

    // Play/Stop based on state
    switch (callState) {
      case 'calling':
        stopAll();
        outgoingAudio.current.play().catch(e => console.warn('[CallSounds] Outgoing playback blocked:', e));
        break;
      case 'ringing':
        stopAll();
        incomingAudio.current.play().catch(e => console.warn('[CallSounds] Incoming playback blocked:', e));
        break;
      case 'connected':
      case 'ended':
      case 'rejected':
      case 'failed':
      case 'idle':
        stopAll();
        break;
      default:
        break;
    }

    return () => {
      stopAll();
    };
  }, [callState, stopAll]);

  return { stopAll };
};
