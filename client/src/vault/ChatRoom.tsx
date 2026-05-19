import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Send, Loader2, User, Check, CheckCheck, CornerUpLeft, X, Trash2, ChevronLeft, Pencil, Download, Paperclip, Video } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { buildApiUrl, connectSocket } from '../runtimeConfig';

interface Message {
  _id: string;
  senderId: string;
  receiverId: string;
  message?: string;
  messageType?: 'text' | 'image';
  fileData?: string;
  fileName?: string;
  expiresAt?: string;
  createdAt: string;
  seen: boolean;
  replyTo?: {
    _id: string;
    message: string;
    senderId: string;
  };
  reactions: Array<{ userId: string; emoji: string }>;
}

const ChatRoom: React.FC<{
  receiverId: string,
  receiverAlias: string,
  receiverNickname?: string | null,
  onBack: () => void,
  onNicknameSaved?: (nickname: string | null) => void,
  onStartVideoCall?: () => void
}> = ({ receiverId, receiverAlias, receiverNickname, onBack, onNicknameSaved, onStartVideoCall }) => {
  const { vaultToken, user, clearUnread, refreshUnreadCount } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [isPeerOnline, setIsPeerOnline] = useState(false);
  const [replyingTo, setReplyTo] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [nickname, setNickname] = useState(receiverNickname || '');
  const [nicknameDraft, setNicknameDraft] = useState(receiverNickname || '');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const reactionTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    clearUnread();

    const socket = connectSocket({ auth: { token: vaultToken } });
    socketRef.current = socket;

    const fetchHistory = async () => {
      try {
        const res = await axios.get(buildApiUrl(`/api/sync-center/history/${receiverId}`), {
          headers: { 'x-vault-token': vaultToken }
        });
        setMessages(res.data);
        socket.emit('markSeen', { senderId: receiverId });
        await refreshUnreadCount();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    socket.on('message', (msg: Message) => {
      if ((msg.senderId === receiverId && msg.receiverId === user?.id) || 
          (msg.senderId === user?.id && msg.receiverId === receiverId)) {
        setMessages(prev => [...prev, msg]);
        if (msg.senderId === receiverId) {
          socket.emit('markSeen', { senderId: receiverId });
          clearUnread();
          refreshUnreadCount();
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

  useEffect(() => {
    setNickname(receiverNickname || '');
    setNicknameDraft(receiverNickname || '');
    setIsEditingNickname(false);
    setIsConfirmingClear(false);
  }, [receiverNickname, receiverId]);

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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      window.alert('File size too large. Maximum 8MB.');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await sendMessage({
        messageType: 'image',
        fileData: base64,
        fileName: file.name
      });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setIsUploading(false);
      window.alert('Failed to read file.');
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (payloadOverride?: Partial<any>) => {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage && !payloadOverride) return;

    const payload = {
      receiverId,
      message: trimmedMessage,
      replyTo: replyingTo?._id,
      ...payloadOverride
    };

    const sendViaHttp = async () => {
      await axios.post(buildApiUrl('/api/sync-center/message'), payload, {
        headers: { 'x-vault-token': vaultToken }
      });
    };

    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      await sendViaHttp();
    } else {
      const ack = await new Promise<{ ok: boolean; msg?: string }>((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve({ ok: false, msg: 'Socket timeout' });
          }
        }, 8000); // Higher timeout for images

        socket.emit('sendMessage', payload, (response: { ok: boolean; msg?: string }) => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve(response);
          }
        });
      });

      if (!ack.ok) {
        await sendViaHttp();
      }
    }

    if (!payloadOverride) setNewMessage('');
    setReplyTo(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage().catch((err) => {
      console.error('Send Message Error:', err);
      window.alert('Failed to send message. Please check your connection and try again.');
    });
  };

  const handleDownload = (fileData: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName || 'fitmask_image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const handleClearChat = async () => {
    setIsClearingChat(true);

    try {
      await axios.delete(buildApiUrl(`/api/sync-center/history/${receiverId}`), {
        headers: { 'x-vault-token': vaultToken }
      });
      setMessages([]);
      setReplyTo(null);
      setShowReactions(null);
      setIsConfirmingClear(false);
      await refreshUnreadCount();
    } catch (err) {
      console.error('Clear Chat Error:', err);
      window.alert('Failed to clear chat history. Please try again.');
    } finally {
      setIsClearingChat(false);
    }
  };

  const saveNickname = async (nextNickname: string) => {
    setIsSavingNickname(true);

    try {
      const res = await axios.patch(
        buildApiUrl(`/api/sync-center/contacts/${receiverId}/nickname`),
        { nickname: nextNickname },
        { headers: { 'x-vault-token': vaultToken } }
      );
      const savedNickname = res.data.nickname || '';
      setNickname(savedNickname);
      setNicknameDraft(savedNickname);
      setIsEditingNickname(false);
      onNicknameSaved?.(savedNickname || null);
    } catch (err) {
      console.error('Nickname Update Error:', err);
      window.alert('Failed to save nickname. Please try again.');
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleNicknameSave = async () => {
    await saveNickname(nicknameDraft);
  };

  const handleNicknameDelete = async () => {
    await saveNickname('');
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-white/20" /></div>;

  const displayName = nickname || receiverAlias;

  return (
    <div className="flex flex-col h-full bg-vault-bg text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/40 transition-colors hover:text-white"
          aria-label="Back to chats"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
            <User size={20} className="text-white/40" />
          </div>
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-vault-bg ${isPeerOnline ? 'bg-green-500' : 'bg-white/20'}`} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-mono text-sm">{displayName}</div>
          <div className="text-[10px] uppercase tracking-tighter">
            {isPeerTyping ? (
              <span className="text-fitness-primary animate-pulse">Typing...</span>
            ) : nickname ? (
              <span className="truncate text-white/30">Alias: {receiverAlias}</span>
            ) : (
              <span className={isPeerOnline ? 'text-green-500' : 'text-white/20'}>{isPeerOnline ? 'Online' : 'Offline'}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onStartVideoCall}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:text-fitness-primary"
          aria-label="Start video call"
        >
          <Video size={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            setIsConfirmingClear(false);
            setIsEditingNickname((prev) => !prev);
          }}
          disabled={isSavingNickname}
          className="ml-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Edit chat nickname"
        >
          {isSavingNickname ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditingNickname(false);
            setIsConfirmingClear((prev) => !prev);
          }}
          disabled={isClearingChat}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Clear chat history"
        >
          {isClearingChat ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
        </div>

        <AnimatePresence initial={false}>
          {isEditingNickname && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5 px-4 pb-4"
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/30">
                  Custom chat name
                </div>
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value.slice(0, 40))}
                  placeholder={receiverAlias}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
                />
                <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-white/20">
                  <span>{nicknameDraft.length}/40</span>
                  {nickname ? <span>Original: {receiverAlias}</span> : <span>Visible only to you</span>}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleNicknameSave}
                    disabled={isSavingNickname}
                    className="flex-1 rounded-xl bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-black disabled:opacity-40"
                  >
                    {isSavingNickname ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNicknameDelete}
                    disabled={isSavingNickname || !nickname}
                    className="rounded-xl border border-red-400/30 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-red-300 disabled:opacity-30"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNicknameDraft(nickname);
                      setIsEditingNickname(false);
                    }}
                    disabled={isSavingNickname}
                    className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50 disabled:opacity-30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {isConfirmingClear && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5 px-4 pb-4"
            >
              <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-red-300/80">
                  Clear chat history
                </div>
                <p className="text-sm text-white/70">
                  Delete all messages with <span className="font-mono text-white">{displayName}</span>. The DM contact will stay in your list.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleClearChat}
                    disabled={isClearingChat}
                    className="flex-1 rounded-xl bg-red-400 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-black disabled:opacity-40"
                  >
                    {isClearingChat ? 'Deleting...' : 'Delete chat'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClear(false)}
                    disabled={isClearingChat}
                    className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50 disabled:opacity-30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
                className={`max-w-[85vw] p-1 rounded-2xl text-sm relative z-10 cursor-grab active:cursor-grabbing ${
                  msg.senderId === user?.id 
                    ? 'bg-white text-black rounded-tr-none self-end' 
                    : 'bg-white/5 border border-white/10 rounded-tl-none self-start'
                }`}
              >
                {msg.messageType === 'image' ? (
                  <div className="relative group/img overflow-hidden rounded-xl">
                    <img 
                      src={msg.fileData} 
                      alt="Uploaded data" 
                      className="max-w-full max-h-[300px] object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <button 
                        onClick={() => handleDownload(msg.fileData!, msg.fileName || 'image.png')}
                        className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-colors"
                        title="Download"
                      >
                        <Download size={20} />
                      </button>
                    </div>
                    {msg.expiresAt && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-[8px] uppercase tracking-widest text-white/80 border border-white/10">
                        Self-destruct active
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2 px-3">{msg.message}</div>
                )}
                
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
        {!messages.length && !isPeerTyping && (
          <div className="py-12 text-center text-xs uppercase tracking-[0.2em] text-white/20">
            No messages in this channel
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
              <div className="truncate text-xs text-white/40 italic">Replying to: {replyingTo.messageType === 'image' ? '[Image]' : replyingTo.message}</div>
              <button onClick={() => setReplyTo(null)}><X size={14} className="text-white/40" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-2">
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors active:scale-90 disabled:opacity-40"
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
          </button>
          <input 
            type="text"
            value={newMessage}
            onChange={handleTyping}
            placeholder="Transmit encrypted data..."
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
          />
          <button 
            type="submit" 
            disabled={!newMessage.trim()}
            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-white/5 disabled:opacity-40"
          >
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
