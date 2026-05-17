import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import FitnessLayout from './layouts/FitnessLayout';
import VaultLayout from './layouts/VaultLayout';
import Dashboard from './pages/Dashboard';
import VaultUnlock from './components/VaultUnlock';
import AuthPage from './pages/AuthPage';
import VaultPage from './vault/VaultPage';
import { Copy, Check } from 'lucide-react';

// Placeholder Pages
const Workouts = () => <div className="p-4">Workout Plans</div>;
const Stats = () => <div className="p-4">Fitness Statistics</div>;

const Profile = () => {
  const { user, logout, unreadCount } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyFitId = () => {
    if (user?.fitId) {
      navigator.clipboard.writeText(user.fitId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-fitness-primary/10 flex items-center justify-center text-fitness-primary text-3xl font-black mb-4">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          {unreadCount > 0 && (
            <div className="absolute top-0 right-0 w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-xs text-white font-bold animate-bounce">
              {unreadCount}
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-800">{user?.username}</h2>
        <p className="text-slate-400 text-sm">{user?.alias}</p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        {unreadCount > 0 && (
          <div className="absolute top-0 right-0 bg-fitness-secondary text-white text-[8px] font-black px-3 py-1 uppercase tracking-widest transform rotate-45 translate-x-3 translate-y-1 shadow-sm">
            Alert
          </div>
        )}
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secret Identity</h3>
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Your Unique FitID</div>
            <div className="font-mono font-bold text-slate-700">{user?.fitId}</div>
          </div>
          <button 
            onClick={copyFitId}
            className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
          >
            {copied ? <Check size={18} className="text-fitness-primary" /> : <Copy size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 italic px-1">
          Share this ID with trusted nodes to initiate a secure uplink.
        </p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Settings</h3>
        <div className="flex items-center justify-between py-2 border-b border-slate-50">
          <span className="text-sm font-semibold text-slate-600">Dark Mode</span>
          <div className="w-10 h-5 bg-slate-200 rounded-full"></div>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-50">
          <span className="text-sm font-semibold text-slate-600">Health Sync</span>
          <div className="w-10 h-5 bg-fitness-primary rounded-full flex items-center justify-end px-1">
            <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
        </div>
      </div>

      <button 
        onClick={logout} 
        className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
      >
        Sign Out
      </button>
    </div>
  );
};

const VaultDashboard = () => <VaultPage />;

const AppContent: React.FC = () => {
  const { isAuthenticated, isVaultUnlocked } = useAuth();
  const { isVaultMode } = useVault();

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <>
      {isVaultMode && !isVaultUnlocked && <VaultUnlock />}
      
      <Routes>
        {isVaultUnlocked && isVaultMode ? (
          <Route element={<VaultLayout />}>
            <Route path="/advanced-metrics" element={<VaultDashboard />} />
            <Route path="/sync-center" element={<div>Search Nodes</div>} />
            <Route path="/recovery-tools" element={<div>Connections</div>} />
            <Route path="/performance-lab" element={<div>System Settings</div>} />
            <Route path="*" element={<Navigate to="/advanced-metrics" />} />
          </Route>
        ) : (
          <Route element={<FitnessLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        )}
      </Routes>
    </>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <VaultProvider>
        <Router>
          <AppContent />
        </Router>
      </VaultProvider>
    </AuthProvider>
  );
};

export default App;
