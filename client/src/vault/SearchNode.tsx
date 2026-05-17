import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, Loader2, MessageSquare } from 'lucide-react';

interface Node {
  _id: string;
  alias: string;
  fitId: string;
  avatarSeed: string;
  isOnline: boolean;
}

const SearchNode: React.FC<{ onSelect: (node: Node) => void }> = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const { vaultToken, clearUnread } = useAuth();

  const handleSelect = (node: Node) => {
    clearUnread();
    onSelect(node);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);

    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/sync-center/search?q=${query}`, {
        headers: { 'x-vault-token': vaultToken }
      });
      setResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-mono uppercase tracking-widest text-white/60">Node Discovery</h2>
      
      <form onSubmit={handleSearch} className="relative">
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter FitID (e.g. FIT-X7Y8Z9)..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
        />
        <button type="submit" className="absolute right-3 top-3 text-white/20">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
        </button>
      </form>

      <div className="space-y-3">
        {results.map(node => (
          <div key={node._id} className="glass p-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5" />
              </div>
              <div>
                <div className="font-mono text-sm">{node.alias}</div>
                <div className="text-[10px] text-white/40 uppercase tracking-tighter">{node.fitId}</div>
              </div>
            </div>
            <button 
              onClick={() => handleSelect(node)}
              className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white transition-all"
            >
              <MessageSquare size={18} />
            </button>
          </div>
        ))}
        {query && results.length === 0 && !loading && (
          <p className="text-center text-white/20 text-xs uppercase tracking-widest mt-8">No nodes identified</p>
        )}
      </div>
    </div>
  );
};

export default SearchNode;
