import React, { useState, useEffect } from 'react';
import SearchNode from './SearchNode';
import ChatRoom from './ChatRoom';
import { ChevronLeft, MessageSquare, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

interface Node {
  _id: string;
  alias: string;
  fitId: string;
  isOnline: boolean;
}

const VaultPage: React.FC = () => {
  const { vaultToken } = useAuth();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<{ id: string, alias: string } | null>(null);
  const [view, setView] = useState<'nodes' | 'search'>('nodes');

  const fetchNodes = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/sync-center/nodes`, {
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

  // Real-time status updates for nodes list
  useEffect(() => {
    if (vaultToken) {
      const socket = io(import.meta.env.VITE_SOCKET_URL, {
        auth: { token: vaultToken }
      });

      socket.on('userStatus', ({ userId, isOnline }: { userId: string, isOnline: boolean }) => {
        setNodes(prev => prev.map(node => node._id === userId ? { ...node, isOnline } : node));
      });

      socket.on('message', () => {
        // If not in a chat, refresh nodes to show latest conversation
        if (!selectedNode) fetchNodes();
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [vaultToken, selectedNode]);

  if (selectedNode) {
    return (
      <div className="fixed inset-0 bg-vault-bg z-[60] flex flex-col">
        <div className="absolute top-4 left-4 z-[70]">
          <button 
            onClick={() => setSelectedNode(null)}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
        <ChatRoom receiverId={selectedNode.id} receiverAlias={selectedNode.alias} />
      </div>
    );
  }

  return (
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
                  onClick={() => setSelectedNode({ id: node._id, alias: node.alias })}
                  className="glass p-4 rounded-xl flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 font-mono text-xs">
                        {node.alias.substring(0, 2)}
                      </div>
                      {node.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-vault-bg shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono text-sm">{node.alias}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-tighter">
                        {node.isOnline ? 'Active Link' : 'Standby Mode'}
                      </div>
                    </div>
                  </div>
                  <MessageSquare size={18} className="text-white/20" />
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
      ) : (
        <SearchNode onSelect={(node) => setSelectedNode({ id: node._id, alias: node.alias })} />
      )}
    </div>
  );
};

export default VaultPage;
