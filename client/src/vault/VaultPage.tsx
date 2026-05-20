import React, { useState, useEffect, useRef } from 'react';
import SearchNode from './SearchNode';
import ChatRoom from './ChatRoom';
import { MessageSquare, Loader2, Trash2, AlertTriangle, X, Settings, ShieldCheck, KeyRound, Save } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl, getVaultSocket, releaseVaultSocket } from '../runtimeConfig';
import { motion, AnimatePresence } from 'framer-motion';
import VideoCallManager from './VideoCallManager';
import type { VideoCallManagerHandle } from './VideoCallManager';

interface Node {
  _id: string;
  alias: string;
  nickname?: string | null;
  fitId: string;
  isOnline: boolean;
  unreadCount: number;
  lastInteraction: string;
}

const VaultPage: React.FC = () => {
  const { vaultToken } = useAuth();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<{ id: string, alias: string, nickname?: string | null } | null>(null);
  const [view, setView] = useState<'nodes' | 'search' | 'settings'>('nodes');
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [socket, setSocket] = useState<any>(null);
  
  // Settings state
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const longPressTimer = useRef<any>(null);
  const videoCallRef = useRef<VideoCallManagerHandle>(null);
  const selectedNodeRef = useRef<typeof selectedNode>(null);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  const fetchNodes = async () => {
    try {
      const res = await axios.get(buildApiUrl('/api/sync-center/nodes'), {
        headers: { 'x-vault-token': vaultToken }
      });
      setNodes(res.data);
    } catch (err) {
      console.error('Fetch Nodes Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedNode && view === 'nodes') {
      fetchNodes();
    }
  }, [selectedNode, view, vaultToken]);

  // Real-time status updates and socket management
  useEffect(() => {
    if (vaultToken) {
      const newSocket = getVaultSocket(vaultToken);
      setSocket(newSocket);

      const handleUserStatus = ({ userId, isOnline }: { userId: string, isOnline: boolean }) => {
        setNodes(prev => prev.map(node => node._id === userId ? { ...node, isOnline } : node));
      };

      const handleMessage = (msg: any) => {
        // If not in a chat, update the node list
        if (!selectedNodeRef.current) {
          setNodes(prev => {
            const senderId = msg.senderId;
            const existingNodeIndex = prev.findIndex(n => n._id === senderId);
            
            const updatedNodes = [...prev];
            
            if (existingNodeIndex > -1) {
              const existingNode = updatedNodes[existingNodeIndex];
              const newNode = {
                ...existingNode,
                unreadCount: existingNode.unreadCount + 1,
                lastInteraction: msg.createdAt
              };
              updatedNodes.splice(existingNodeIndex, 1);
              updatedNodes.unshift(newNode);
            } else {
              fetchNodes();
            }
            return updatedNodes;
          });
        }
      };

      const handleConnect = () => {
        console.log('[VaultSocket] Connected shared vault socket', newSocket.id);
      };

      const handleDisconnect = (reason: string) => {
        console.warn('[VaultSocket] Shared vault socket disconnected', reason);
      };

      newSocket.off('userStatus', handleUserStatus);
      newSocket.off('message', handleMessage);
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);

      newSocket.on('userStatus', handleUserStatus);
      newSocket.on('message', handleMessage);
      newSocket.on('connect', handleConnect);
      newSocket.on('disconnect', handleDisconnect);

      return () => {
        newSocket.off('userStatus', handleUserStatus);
        newSocket.off('message', handleMessage);
        newSocket.off('connect', handleConnect);
        newSocket.off('disconnect', handleDisconnect);
        releaseVaultSocket(newSocket);
        setSocket(null);
      };
    }
  }, [vaultToken]); // Only depend on vaultToken to keep socket stable

  const handleLongPress = (node: Node) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setNodeToDelete(node);
  };

  const startPress = (node: Node) => {
    longPressTimer.current = setTimeout(() => handleLongPress(node), 600);
  };

  const endPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const deleteNode = async () => {
    if (!nodeToDelete) return;
    try {
      await axios.delete(buildApiUrl(`/api/sync-center/contacts/${nodeToDelete._id}`), {
        headers: { 'x-vault-token': vaultToken }
      });
      setNodes(prev => prev.filter(n => n._id !== nodeToDelete._id));
      setNodeToDelete(null);
    } catch (err) {
      console.error('Delete Node Error:', err);
      window.alert('Failed to delete DM. Please try again.');
    }
  };

  const handleUpdatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPasscode || !newPasscode) {
      return window.alert('Both current and new passcodes are required.');
    }
    if (newPasscode.length < 4) {
      return window.alert('New passcode must be at least 4 characters.');
    }

    setSavingSettings(true);
    try {
      await axios.patch(buildApiUrl('/api/auth/vault-passcode'), 
        { currentPasscode, newPasscode },
        { headers: { 'x-vault-token': vaultToken } }
      );
      window.alert('Vault access key updated successfully.');
      setCurrentPasscode('');
      setNewPasscode('');
      setView('nodes');
    } catch (err: any) {
      window.alert(err.response?.data?.msg || 'Failed to update access key.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="relative">
      <VideoCallManager ref={videoCallRef} socket={socket} />

      {selectedNode ? (
        <div className="fixed inset-0 bg-vault-bg z-[60] flex flex-col">
          <ChatRoom
            receiverId={selectedNode.id}
            receiverAlias={selectedNode.alias}
            receiverNickname={selectedNode.nickname}
            onBack={() => setSelectedNode(null)}
            onStartVideoCall={() => {
              videoCallRef.current?.startCall(selectedNode.id, selectedNode.nickname || selectedNode.alias);
            }}
            onNicknameSaved={(nickname) => {
              setSelectedNode((prev) => prev ? { ...prev, nickname } : prev);
              setNodes((prev) => prev.map((node) => (
                node._id === selectedNode.id ? { ...node, nickname } : node
              )));
            }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex gap-4 border-b border-white/5">
            <button 
              onClick={() => setView('nodes')}
              className={`pb-3 text-xs uppercase tracking-widest font-bold transition-colors ${view === 'nodes' ? 'text-white border-b border-white' : 'text-white/20'}`}
            >
              Active Links
            </button>
            <button 
              onClick={() => setView('search')}
              className={`pb-3 text-xs uppercase tracking-widest font-bold transition-colors ${view === 'search' ? 'text-white border-b border-white' : 'text-white/20'}`}
            >
              Discovery
            </button>
            <button 
              onClick={() => setView('settings')}
              className={`pb-3 text-xs uppercase tracking-widest font-bold transition-colors ${view === 'settings' ? 'text-white border-b border-white' : 'text-white/20'}`}
            >
              Settings
            </button>
          </div>

          {view === 'nodes' ? (
            <div className="space-y-4">
              <p className="text-[10px] text-white/20 uppercase tracking-[0.2em]">Secure communication channels</p>
              
              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-white/20" /></div>
              ) : nodes.length > 0 ? (
                <div className="space-y-3">
                  {nodes.map(node => (
                    <div 
                      key={node._id} 
                      onClick={() => setSelectedNode({ id: node._id, alias: node.alias, nickname: node.nickname })}
                      onMouseDown={() => startPress(node)}
                      onMouseUp={endPress}
                      onMouseLeave={endPress}
                      onTouchStart={() => startPress(node)}
                      onTouchEnd={endPress}
                      className="glass p-4 rounded-xl flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 font-mono text-xs">
                            {(node.nickname || node.alias).substring(0, 2)}
                          </div>
                          {node.isOnline && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-vault-bg shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                          )}
                        </div>
                        <div>
                          <div className="font-mono text-sm">{node.nickname || node.alias}</div>
                          <div className="text-[10px] text-white/40 uppercase tracking-tighter">
                            {node.nickname ? `Alias: ${node.alias}` : (node.isOnline ? 'Active Link' : 'Standby Mode')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {node.unreadCount > 0 && (
                          <div className="bg-fitness-primary text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-fitness-primary/20">
                            {node.unreadCount}
                          </div>
                        )}
                        <MessageSquare size={18} className="text-white/20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 text-center py-12">
                  <p className="text-white/10 text-xs italic">No active encrypted channels identified.</p>
                  <button 
                    onClick={() => setView('search')}
                    className="text-[10px] text-fitness-secondary uppercase font-bold tracking-widest mt-2"
                  >
                    Initiate Discovery
                  </button>
                </div>
              )}
            </div>
          ) : view === 'search' ? (
            <SearchNode onSelect={(node) => setSelectedNode({ id: node._id, alias: node.alias, nickname: null })} />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-white/40 mb-2">
                <Settings size={20} />
                <h3 className="font-mono text-sm uppercase tracking-[0.2em]">Security Protocol</h3>
              </div>
              
              <div className="glass p-6 rounded-3xl space-y-6 border-white/5">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-fitness-secondary">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Vault Access Key</h4>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Update your secure unlock credential</p>
                  </div>
                </div>

                <form onSubmit={handleUpdatePasscode} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/30 uppercase font-bold tracking-widest px-1">Current Key</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                      <input
                        type="password"
                        value={currentPasscode}
                        onChange={(e) => setCurrentPasscode(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-mono placeholder:text-white/10 focus:outline-none focus:border-fitness-secondary/50 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-white/30 uppercase font-bold tracking-widest px-1">New Key</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                      <input
                        type="password"
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-mono placeholder:text-white/10 focus:outline-none focus:border-fitness-secondary/50 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSettings || newPasscode.length < 4 || !currentPasscode}
                    className="w-full py-4 mt-4 rounded-2xl bg-fitness-secondary text-black font-black uppercase tracking-[0.2em] text-xs active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale disabled:scale-100"
                  >
                    {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Update Security Key
                  </button>
                </form>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-white/40 leading-relaxed italic">
                    Note: Your access key can now contain letters, numbers, and special characters. Minimum length is 4 characters.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {nodeToDelete && (
          <motion.div 
            key="delete-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-sm glass border-red-500/20 p-6 rounded-3xl"
            >
              <div className="flex items-center gap-3 mb-4 text-red-400">
                <AlertTriangle size={24} />
                <h3 className="font-mono text-lg uppercase tracking-wider">Delete Channel?</h3>
              </div>
              <p className="text-sm text-white/60 mb-8">
                This will remove <span className="text-white font-mono">{nodeToDelete.nickname || nodeToDelete.alias}</span> from your active links and hide your message history locally.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={deleteNode}
                  className="w-full py-4 rounded-2xl bg-red-500 text-white font-bold uppercase tracking-[0.2em] text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  Terminate Connection
                </button>
                <button 
                  onClick={() => setNodeToDelete(null)}
                  className="w-full py-4 rounded-2xl bg-white/5 text-white/60 font-bold uppercase tracking-[0.2em] text-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <X size={16} />
                  Abort
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultPage;
