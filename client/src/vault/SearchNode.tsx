import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Loader2, MessageSquare, Send } from 'lucide-react';
import { buildApiUrl } from '../runtimeConfig';

interface Node {
  _id: string;
  alias: string;
  fitId: string;
  avatarSeed: string;
  isOnline: boolean;
  isDiscoverable: boolean;
}

const SearchNode: React.FC<{ onSelect: (node: Node) => void }> = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const { vaultToken } = useAuth();
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const loadPublicIds = async (searchQuery = '') => {
    const requestId = ++searchRequestId.current;
    setLoading(true);

    try {
      const res = await axios.get(buildApiUrl(`/api/sync-center/search?q=${encodeURIComponent(searchQuery)}`), {
        headers: { 'x-vault-token': vaultToken }
      });
      if (requestId === searchRequestId.current) setResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery && normalizedQuery.length < 2) {
      searchRequestId.current += 1;
      setLoading(false);
      setResults([]);
      return;
    }
    const delay = normalizedQuery ? 250 : 0;
    const searchTimer = window.setTimeout(() => loadPublicIds(normalizedQuery), delay);
    return () => window.clearTimeout(searchTimer);
  }, [query, vaultToken]);

  const requestPrivateDm = async (node: Node) => {
    setSendingId(node._id);
    try {
      await axios.post(buildApiUrl(`/api/sync-center/requests/${node._id}`), {}, {
        headers: { 'x-vault-token': vaultToken }
      });
      setPendingIds((previous) => [...previous, node._id]);
    } catch (err: any) {
      window.alert(err.response?.data?.msg || 'Failed to send DM request');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-mono uppercase tracking-widest text-white/60">Node Discovery</h2>
      
      <div className="relative">
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search public FitID (e.g. john_doe or john.doe)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
        />
        <div className="absolute right-3 top-3 text-white/20">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
        </div>
      </div>

      <div className="space-y-3">
        {results.map(node => (
          <div key={node._id} className="glass p-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5" />
              </div>
              <div>
                <div className="font-mono text-sm">{node.alias}</div>
                <div className="text-[10px] text-white/40 tracking-tighter">@{node.fitId}</div>
              </div>
            </div>
            {node.isDiscoverable ? (
              <button
                onClick={() => onSelect(node)}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white transition-all"
                aria-label={`Message ${node.alias}`}
              >
                <MessageSquare size={18} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {pendingIds.includes(node._id) && <span className="text-[10px] text-white/40 uppercase">Requested</span>}
                <button
                  onClick={() => requestPrivateDm(node)}
                  disabled={sendingId === node._id || pendingIds.includes(node._id)}
                  className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white transition-all disabled:opacity-40"
                  aria-label={`Request a DM with ${node.alias}`}
                >
                  {sendingId === node._id ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
            )}
          </div>
        ))}
        {results.length === 0 && !loading && (
          <p className="text-center text-white/20 text-xs uppercase tracking-widest mt-8">{query.trim().length === 1 ? 'Type one more character to search private IDs' : 'No IDs found'}</p>
        )}
      </div>
    </div>
  );
};

export default SearchNode;
