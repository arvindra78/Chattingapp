import { useEffect, useRef, useCallback } from 'react';
import type { CallState } from './useWebRTC';

export const useCallSounds = (callState: CallState) => {
  const audioContext = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stopAll = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const playTone = useCallback((frequency: number, durationMs: number) => {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!audioContext.current) {
        audioContext.current = new AudioContextCtor();
      }

      const context = audioContext.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.025;

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + durationMs / 1000);
    } catch (err) {
      console.warn('[CallSounds] Tone playback unavailable:', err);
    }
  }, []);

  const startToneLoop = useCallback((frequency: number, intervalMs: number) => {
    stopAll();
    playTone(frequency, 180);
    intervalRef.current = window.setInterval(() => playTone(frequency, 180), intervalMs);
  }, [playTone, stopAll]);

  useEffect(() => {
    switch (callState) {
      case 'calling':
        startToneLoop(440, 1600);
        break;
      case 'ringing':
        startToneLoop(660, 1100);
        break;
      case 'connecting':
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
  }, [callState, startToneLoop, stopAll]);

  return { stopAll };
};
