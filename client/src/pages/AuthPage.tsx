import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { buildApiUrl } from '../runtimeConfig';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    fitId: '',
    email: '',
    password: '',
    unlockCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await axios.post(buildApiUrl(endpoint), formData);
      login(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.msg || 'Something went wrong');
    } finally {
      setLoading(false);
    }
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
              placeholder="Username"
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
                placeholder="Choose FitID (e.g. FIT-ARVIN01)"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-fitness-primary transition-colors uppercase"
                value={formData.fitId}
                onChange={(e) => setFormData({...formData, fitId: e.target.value.toUpperCase()})}
                required
                maxLength={24}
              />
              <p className="text-[10px] text-slate-400 px-2 italic">This unique FitID is how trusted nodes will find you.</p>
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
    </div>
  );
};

export default AuthPage;
