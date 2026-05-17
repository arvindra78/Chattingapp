import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Send, Loader2, User, Check, CheckCheck, CornerUpLeft, X } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { buildApiUrl, connectSocket } from '../runtimeConfig';

interface Message {
  _id: string;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt: string;
  seen: boolean;
  replyTo?: {
    _id: string;
    message: string;
    senderId: string;
  };
  reactions: Array<{ userId: string; emoji: string }>;
}

const ChatRoom: React.FC<{ receiverId: string, receiverAlias: string }> = ({ receiverId, receiverAlias }) => {
  const { vaultToken, user, clearUnread } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [isPeerOnline, setIsPeerOnline] = useState(false);
  const [replyingTo, setReplyTo] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const reactionTimerRef = useRef<any>(null);

  useEffect(() => {
    clearUnread();

    const fetchHistory = async () => {
      try {
        const res = await axios.get(buildApiUrl(`/api/sync-center/history/${receiverId}`), {
          headers: { 'x-vault-token': vaultToken }
        });
        setMessages(res.data);
        if (socketRef.current) socketRef.current.emit('markSeen', { senderId: receiverId });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    const socket = connectSocket({ auth: { token: vaultToken } });
    socketRef.current = socket;

    socket.on('message', (msg: Message) => {
      if ((msg.senderId === receiverId && msg.receiverId === user?.id) || 
          (msg.senderId === user?.id && msg.receiverId === receiverId)) {
        setMessages(prev => [...prev, msg]);
        if (msg.senderId === receiverId) {
          socket.emit('markSeen', { senderId: receiverId });
          clearUnread();
        }
      }
    });

    socket.on('reactionUpdate', ({ messageId, reactions }: { messageId: string, reactions: any[] }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    });

    socket.on('messagesSeen', ({ seenBy }: { seenBy: string }) => {
      if (seenBy === receiverId) {
        setMessages(prev => prev.map(m => m.senderId === user?.id ? { ...m, seen: true } : m));
      }
    });

    socket.on('typing', ({ senderId, isTyping }: { senderId: string, isTyping: boolean }) => {
      if (senderId === receiverId) setIsPeerTyping(isTyping);
    });

    socket.on('userStatus', ({ userId, isOnline }: { userId: string, isOnline: boolean }) => {
      if (userId === receiverId) setIsPeerOnline(isOnline);
    });

    return () => {
      socket.disconnect();
    };
  }, [receiverId, vaultToken, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (socketRef.current) {
      socketRef.current.emit('typing', { receiverId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing', { receiverId, isTyping: false });
      }, 2000);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;

    socketRef.current.emit('sendMessage', {
      receiverId,
      message: newMessage,
      replyTo: replyingTo?._id
    });
    setNewMessage('');
    setReplyTo(null);
  };

  const handleLongPressStart = (msgId: string) => {
    reactionTimerRef.current = setTimeout(() => {
      setShowReactions(msgId);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
  };

  const react = (messageId: string, emoji: string) => {
    socketRef.current?.emit('reactToMessage', { messageId, emoji, receiverId });
    setShowReactions(null);
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-white/20" /></div>;

  return (
    <div className="flex flex-col h-full bg-vault-bg text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-black/20 backdrop-blur-md">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
            <User size={20} className="text-white/40" />
          </div>
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-vault-bg ${isPeerOnline ? 'bg-green-500' : 'bg-white/20'}`} />
        </div>
        <div>
          <div className="font-mono text-sm">{receiverAlias}</div>
          <div className="text-[10px] uppercase tracking-tighter">
            {isPeerTyping ? <span className="text-fitness-primary animate-pulse">Typing...</span> : <span className={isPeerOnline ? 'text-green-500' : 'text-white/20'}>{isPeerOnline ? 'Online' : 'Offline'}</span>}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div 
            key={msg._id} 
            className={`flex flex-col ${msg.senderId === user?.id ? 'items-end' : 'items-start'}`}
            onMouseDown={() => handleLongPressStart(msg._id)}
            onMouseUp={handleLongPressEnd}
            onTouchStart={() => handleLongPressStart(msg._id)}
            onTouchEnd={handleLongPressEnd}
          >
            {/* Reply Preview */}
            {msg.replyTo && (
              <div className="mb-[-8px] max-w-[70%] opacity-50 text-[10px] bg-white/5 p-2 rounded-t-xl border-x border-t border-white/10 italic truncate">
                {msg.replyTo.message}
              </div>
            )}

            <div className="relative group w-full flex flex-col items-inherit">
              <motion.div 
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: msg.senderId === user?.id ? 0.5 : 0, right: msg.senderId === user?.id ? 0 : 0.5 }}
                onDrag={(_, info) => {
                  const threshold = 60;
                  const drag = info.offset.x;
                  // If sent by me, swipe left. If sent by peer, swipe right.
                  if (msg.senderId === user?.id && drag < -threshold) {
                    if (navigator.vibrate) navigator.vibrate(10);
                  } else if (msg.senderId !== user?.id && drag > threshold) {
                    if (navigator.vibrate) navigator.vibrate(10);
                  }
                }}
                onDragEnd={(_, info) => {
                  const threshold = 80;
                  const drag = info.offset.x;
                  if ((msg.senderId === user?.id && drag < -threshold) || 
                      (msg.senderId !== user?.id && drag > threshold)) {
                    setReplyTo(msg);
                  }
                }}
                className={`max-w-[85vw] p-3 rounded-2xl text-sm relative z-10 cursor-grab active:cursor-grabbing ${
                  msg.senderId === user?.id 
                    ? 'bg-white text-black rounded-tr-none self-end' 
                    : 'bg-white/5 border border-white/10 rounded-tl-none self-start'
                }`}
              >
                {msg.message}
                
                {/* Reactions Display */}
                {msg.reactions?.length > 0 && (
                  <div className={`absolute -bottom-4 ${msg.senderId === user?.id ? 'right-0' : 'left-0'} flex gap-1 bg-vault-card border border-white/10 rounded-full px-2 py-0.5 scale-75 origin-top`}>
                    {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => (
                      <span key={emoji}>{emoji}</span>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Swipe Reply Icon Indicator */}
              <div className={`absolute top-1/2 -translate-y-1/2 ${msg.senderId === user?.id ? '-right-10' : '-left-10'} text-white/20`}>
                <CornerUpLeft size={20} />
              </div>

              {/* Quick Actions overlay (desktop style fallback) */}
              <button 
                onClick={() => setReplyTo(msg)}
                className={`absolute top-0 ${msg.senderId === user?.id ? '-left-8' : '-right-8'} p-1 opacity-0 group-hover:opacity-100 text-white/20 hover:text-white transition-all`}
              >
                <CornerUpLeft size={16} />
              </button>

              {/* Reactions Popup */}
              <AnimatePresence>
                {showReactions === msg._id && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className={`absolute z-50 -top-12 ${msg.senderId === user?.id ? 'right-0' : 'left-0'} bg-vault-card border border-white/20 p-2 rounded-full flex gap-3 shadow-2xl backdrop-blur-xl`}
                  >
                    {['👍', '❤️', '🔥', '😂', '😮', '😢'].map(emoji => (
                      <button key={emoji} onClick={() => react(msg._id, emoji)} className="hover:scale-125 transition-transform">{emoji}</button>
                    ))}
                    <button onClick={() => setReplyTo(msg)} className="text-white/40 hover:text-white border-l border-white/10 pl-2"><CornerUpLeft size={16} /></button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-white/20">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {msg.senderId === user?.id && (msg.seen ? <CheckCheck size={10} className="text-fitness-secondary" /> : <Check size={10} className="text-white/10" />)}
            </div>
          </div>
        ))}
        {isPeerTyping && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 p-2 px-3 rounded-2xl rounded-tl-none flex gap-1">
              <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce" />
              <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={scrollRef} className="h-4" />
      </div>

      {/* Input */}
      <div className="p-4 bg-black/40 backdrop-blur-xl border-t border-white/5 space-y-2">
        <AnimatePresence>
          {replyingTo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center justify-between bg-white/5 p-2 px-4 rounded-xl border border-white/10"
            >
              <div className="truncate text-xs text-white/40 italic">Replying to: {replyingTo.message}</div>
              <button onClick={() => setReplyTo(null)}><X size={14} className="text-white/40" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-2">
          <input 
            type="text"
            value={newMessage}
            onChange={handleTyping}
            placeholder="Transmit encrypted data..."
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
          />
          <button type="submit" className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-white/5">
            <Send size={20} />
          </button>
        </form>
      </div>

      {/* Click outside to close reactions */}
      {showReactions && <div className="fixed inset-0 z-40" onClick={() => setShowReactions(null)} />}
    </div>
  );
};

export default ChatRoom;
