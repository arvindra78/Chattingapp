import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { buildApiUrl } from '../runtimeConfig';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    alias: '',
    fitId: '',
    email: '',
    password: '',
    unlockCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);
  const { login } = useAuth();

  const submitRegistration = async (isDiscoverable?: boolean) => {
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin ? formData : { ...formData, isDiscoverable };
      const res = await axios.post(buildApiUrl(endpoint), payload);
      login(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin) {
      setShowVisibilityDialog(true);
      return;
    }
    submitRegistration();
  };

  return (
    <div className="min-h-screen bg-fitness-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100">
        <h1 className="text-3xl font-black mb-2 bg-gradient-to-r from-fitness-primary to-fitness-secondary bg-clip-text text-transparent">
          FitMask
        </h1>
        <p className="text-slate-500 mb-8">{isLogin ? 'Welcome back, athlete!' : 'Join the fitness revolution.'}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <input 
              type="text"
              placeholder="Account username"
              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required
            />
          )}
          {!isLogin && (
            <div className="space-y-1">
              <input
                type="text"
                placeholder="Display name (e.g. John Doe)"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors"
                value={formData.alias}
                onChange={(e) => setFormData({...formData, alias: e.target.value})}
                required
                maxLength={24}
              />
              <p className="text-[10px] text-slate-400 px-2 italic">This unique name is shown to people you connect with.</p>
            </div>
          )}
          {!isLogin && (
            <div className="space-y-1">
              <input 
                type="text"
                placeholder="Choose public FitID (e.g. john_doe)"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors lowercase"
                value={formData.fitId}
                onChange={(e) => setFormData({...formData, fitId: e.target.value.toLowerCase()})}
                required
                maxLength={24}
              />
              <p className="text-[10px] text-slate-400 px-2 italic">Your public Discovery ID. Use 3-24 letters, numbers, dots, or underscores.</p>
            </div>
          )}
          <input 
            type="email"
            placeholder="Email Address"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
          />
          <input 
            type="password"
            placeholder="Password"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
          />
          {!isLogin && (
            <div className="space-y-1">
              <input 
                type="password"
                placeholder="Vault Access Key (min 4 chars)"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors"
                value={formData.unlockCode}
                onChange={(e) => setFormData({...formData, unlockCode: e.target.value})}
                required
              />
              <p className="text-[10px] text-slate-400 px-2 italic">This is for your "Advanced Metrics" profile. Supports alphanumeric.</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-fitness-primary to-fitness-secondary text-white rounded-xl font-bold shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-6 text-slate-500 text-sm font-semibold hover:text-fitness-primary transition-colors"
        >
          {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
        </button>
      </div>

      {showVisibilityDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black text-slate-800">Choose FitID visibility</h2>
            <p className="mt-2 text-sm text-slate-500">You can change this later in Profile.</p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => { setShowVisibilityDialog(false); submitRegistration(true); }}
                className="w-full rounded-2xl border border-fitness-primary bg-fitness-primary/10 p-4 text-left transition-colors hover:bg-fitness-primary/20"
              >
                <span className="block font-bold text-fitness-primary">Public</span>
                <span className="mt-1 block text-xs text-slate-500">Your FitID appears in Discovery and anyone can send you a direct DM.</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowVisibilityDialog(false); submitRegistration(false); }}
                className="w-full rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50"
              >
                <span className="block font-bold text-slate-700">Private</span>
                <span className="mt-1 block text-xs text-slate-500">Your FitID is hidden from Discovery and DMs need your approval.</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVisibilityDialog(false)}
                className="w-full py-2 text-sm font-semibold text-slate-400"
              >
                Back to sign-up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
