import React from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneOff, User } from 'lucide-react';

interface VideoCallModalProps {
  callerAlias: string;
  onAccept: () => void;
  onReject: () => void;
}

const VideoCallModal: React.FC<VideoCallModalProps> = ({ callerAlias, onAccept, onReject }) => {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-sm glass border-fitness-primary/20 p-8 rounded-[2rem] text-center space-y-6 shadow-2xl"
      >
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-fitness-primary/20 rounded-full animate-ping" />
          <div className="relative w-full h-full rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <User size={40} className="text-white/40" />
          </div>
        </div>

        <div>
          <h3 className="text-fitness-primary font-mono text-xs uppercase tracking-[0.3em] mb-1">Incoming Transmission</h3>
          <div className="text-white text-xl font-bold tracking-tight uppercase">{callerAlias}</div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onReject}
            className="flex-1 py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-red-500/20"
          >
            <PhoneOff size={14} />
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-4 rounded-2xl bg-fitness-primary text-black font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-fitness-primary/20"
          >
            <Phone size={14} />
            Accept
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default VideoCallModal;
