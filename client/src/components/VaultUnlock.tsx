import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';
import axios from 'axios';
import { buildApiUrl } from '../runtimeConfig';

const VaultUnlock: React.FC = () => {
  const [step, setStep] = useState<'loading' | 'passcode'>('loading');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { setVaultToken, token } = useAuth();
  const { exitVaultMode } = useVault();

  useEffect(() => {
    const timer = setTimeout(() => {
      setStep('passcode');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');

    try {
      const res = await axios.post(buildApiUrl('/api/auth/unlock-vault'), 
        { unlockCode: passcode },
        { headers: { 'x-auth-token': token } }
      );
      setVaultToken(res.data.vaultToken);
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Incorrect passcode');
      setPasscode('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-vault-bg z-[100] flex flex-col items-center justify-center p-6 text-white font-mono">
      <AnimatePresence mode="wait">
        {step === 'loading' ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <Loader2 className="animate-spin text-white/20" size={48} />
            <div className="text-xs tracking-[0.3em] text-white/40 uppercase animate-pulse">
              Syncing fitness analytics...
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="passcode"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8">
              <Lock className="text-white/20" size={32} />
            </div>
            
            <h2 className="text-sm tracking-[0.2em] text-white/60 uppercase mb-8">
              Enter Access Key
            </h2>

            <form onSubmit={handleUnlock} className="w-full space-y-6">
              <input 
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoFocus
                className="w-full bg-white/5 border-b border-white/20 text-center text-3xl tracking-[0.5em] py-3 focus:outline-none focus:border-white transition-colors"
                maxLength={6}
              />
              
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}

              <button 
                type="submit"
                disabled={isVerifying || passcode.length < 4}
                className="w-full h-12 flex items-center justify-center bg-white text-black font-bold uppercase tracking-widest text-xs disabled:opacity-20"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Unlock System'}
              </button>

              <button 
                type="button"
                onClick={exitVaultMode}
                className="w-full text-[10px] text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors"
              >
                Cancel Session
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultUnlock;
