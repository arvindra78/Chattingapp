import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Dumbbell, BarChart2, User, UserCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../context/AuthContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FitnessLayout: React.FC = () => {
  const { unreadCount } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-fitness-bg">
      {/* Top Bar */}
      <header className="fixed top-0 w-full h-14 flex items-center justify-between px-4 bg-white shadow-sm z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-fitness-primary to-fitness-secondary bg-clip-text text-transparent">
          FitMask
        </h1>
        <div className="relative">
          <UserCircle size={28} className="text-slate-200" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white font-bold animate-pulse">
              {unreadCount}
            </div>
          )}
        </div>
      </header>


      {/* Content */}
      <main className="flex-1 mt-14 mb-20 px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full h-16 bg-white border-t border-slate-200 flex items-center justify-around z-50">
        <NavLink to="/" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-slate-400 transition-colors", isActive && "text-fitness-primary")}>
          <Home size={24} />
          <span className="text-xs">Home</span>
        </NavLink>
        <NavLink to="/workouts" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-slate-400 transition-colors", isActive && "text-fitness-primary")}>
          <Dumbbell size={24} />
          <span className="text-xs">Workouts</span>
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-slate-400 transition-colors", isActive && "text-fitness-primary")}>
          <BarChart2 size={24} />
          <span className="text-xs">Stats</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => cn("flex flex-col items-center gap-1 text-slate-400 transition-colors", isActive && "text-fitness-primary")}>
          <User size={24} />
          <span className="text-xs">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default FitnessLayout;
