import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquare, Search, UserPlus, Settings, ChevronLeft } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';

const VaultLayout: React.FC = () => {
  const { unreadCount } = useAuth();
  const { exitVaultMode } = useVault();

  return (
    <div className="flex flex-col min-h-screen bg-vault-bg text-white">
      {/* Stealth Top Bar */}
      <header className="fixed top-0 w-full h-14 flex items-center justify-between px-4 bg-black/50 backdrop-blur-lg border-b border-white/5 z-50">
        <button
          type="button"
          onClick={exitVaultMode}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white"
          aria-label="Back to fitness app"
        >
          <ChevronLeft size={14} />
          <span>Back</span>
        </button>
        <h1 className="text-sm font-mono tracking-widest text-white/40 uppercase">
          System Core
        </h1>
        <div className="w-[68px]" />
      </header>

      {/* Content */}
      <main className="flex-1 mt-14 mb-20 px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full h-16 bg-black/50 backdrop-blur-lg border-t border-white/5 flex items-center justify-around z-50">
        <NavLink to="/advanced-metrics" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-white/20 transition-all relative", isActive && "text-white scale-110")}>
          <MessageSquare size={24} />
          {unreadCount > 0 && (
            <div className="absolute -top-1 right-0 w-4 h-4 bg-fitness-secondary rounded-full flex items-center justify-center text-[8px] text-white font-bold border border-vault-bg">
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
          <span className="text-[10px] uppercase tracking-tighter">Secure</span>
        </NavLink>
        <NavLink to="/sync-center" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-white/20 transition-all", isActive && "text-white scale-110")}>
          <Search size={24} />
          <span className="text-[10px] uppercase tracking-tighter">Locate</span>
        </NavLink>
        <NavLink to="/recovery-tools" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-white/20 transition-all", isActive && "text-white scale-110")}>
          <UserPlus size={24} />
          <span className="text-[10px] uppercase tracking-tighter">Nodes</span>
        </NavLink>
        <NavLink to="/performance-lab" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-white/20 transition-all", isActive && "text-white scale-110")}>
          <Settings size={24} />
          <span className="text-[10px] uppercase tracking-tighter">Config</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default VaultLayout;
