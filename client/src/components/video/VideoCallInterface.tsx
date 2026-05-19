import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, User, Phone } from 'lucide-react';

interface VideoCallInterfaceProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callState: string;
  onEndCall: () => void;
  onToggleMic: (enabled: boolean) => void;
  onToggleVideo: (enabled: boolean) => void;
  receiverAlias: string;
  isMicEnabled: boolean;
  isVideoEnabled: boolean;
}

const VideoCallInterface: React.FC<VideoCallInterfaceProps> = ({
  localStream,
  remoteStream,
  callState,
  onEndCall,
  onToggleMic,
  onToggleVideo,
  receiverAlias,
  isMicEnabled,
  isVideoEnabled
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden font-sans">
      {/* Remote Video (Background) */}
      <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
        {remoteStream && callState === 'connected' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 animate-pulse">
              <User size={48} className="text-white/20" />
            </div>
            <div className="text-white/40 font-mono text-sm uppercase tracking-widest">
              {callState === 'calling' ? 'Transmitting...' : 'Encrypted Link'}
            </div>
          </div>
        )}
      </div>

      {/* Header Info */}
      <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-fitness-primary/20 border border-fitness-primary/40 flex items-center justify-center">
            <Phone size={18} className="text-fitness-primary" />
          </div>
          <div>
            <div className="text-white font-mono text-sm uppercase tracking-wider">{receiverAlias}</div>
            <div className="text-[10px] text-fitness-primary uppercase tracking-[0.2em] font-bold">
              {callState === 'connected' ? 'Secure Stream Active' : 'Establishing Link...'}
            </div>
          </div>
        </div>
      </div>

      {/* Local Video Overlay */}
      <motion.div 
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        className="absolute top-24 right-6 w-32 h-44 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/40 backdrop-blur-md cursor-grab active:cursor-grabbing z-10"
      >
        {localStream && isVideoEnabled ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-neutral-800">
            <User size={24} className="text-white/10" />
          </div>
        )}
      </motion.div>

      {/* Controls */}
      <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-6 z-20">
        <button
          onClick={() => onToggleMic(!isMicEnabled)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-xl ${
            isMicEnabled ? 'bg-white/10 text-white border border-white/10 hover:bg-white/20' : 'bg-red-500 text-white'
          }`}
        >
          {isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button
          onClick={onEndCall}
          className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center transition-all active:scale-90 hover:bg-red-700 shadow-2xl shadow-red-500/20"
        >
          <PhoneOff size={28} />
        </button>

        <button
          onClick={() => onToggleVideo(!isVideoEnabled)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-xl ${
            isVideoEnabled ? 'bg-white/10 text-white border border-white/10 hover:bg-white/20' : 'bg-red-500 text-white'
          }`}
        >
          {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>
      </div>

      {/* Connection Failure Overlay */}
      {callState === 'failed' && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <div className="max-w-xs space-y-4">
            <div className="text-red-500 text-lg font-mono uppercase tracking-widest">Link Failure</div>
            <p className="text-white/60 text-sm">Communication channel could not be established. Ensure network stability.</p>
            <button 
              onClick={onEndCall}
              className="w-full py-4 rounded-2xl bg-white/10 text-white font-bold uppercase tracking-[0.2em] text-xs border border-white/10"
            >
              Terminate
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCallInterface;
