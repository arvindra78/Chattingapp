import React, { useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Droplets, Trophy, Activity, BellRing, ChevronDown } from 'lucide-react';
import { useVault } from '../context/VaultContext';

import { useAuth } from '../context/AuthContext';

const workoutPool = [
  { title: 'Morning Yoga', min: 22, max: 38, color: 'bg-emerald-50', textColor: 'text-emerald-600' },
  { title: 'HIIT Cardio', min: 18, max: 32, color: 'bg-blue-50', textColor: 'text-blue-600' },
  { title: 'Lower Body Strength', min: 42, max: 64, color: 'bg-orange-50', textColor: 'text-orange-600' },
  { title: 'Core Stability', min: 20, max: 35, color: 'bg-violet-50', textColor: 'text-violet-600' },
  { title: 'Zone 2 Run', min: 28, max: 46, color: 'bg-sky-50', textColor: 'text-sky-600' },
  { title: 'Mobility Flow', min: 16, max: 28, color: 'bg-teal-50', textColor: 'text-teal-600' },
  { title: 'Upper Body Push', min: 35, max: 55, color: 'bg-rose-50', textColor: 'text-rose-600' },
  { title: 'Evening Walk', min: 25, max: 50, color: 'bg-lime-50', textColor: 'text-lime-600' }
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickWorkouts = () => {
  const shuffled = [...workoutPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((workout) => ({
    ...workout,
    duration: `${randomInt(workout.min, workout.max)} min`
  }));
};

const createFitnessSnapshot = () => {
  const steps = randomInt(4200, 12800);
  const intensity = steps > 9500 ? 'high' : steps > 6500 ? 'moderate' : 'light';
  const calories = randomInt(
    intensity === 'high' ? 1450 : intensity === 'moderate' ? 1050 : 720,
    intensity === 'high' ? 2350 : intensity === 'moderate' ? 1750 : 1250
  );
  const water = (randomInt(9, intensity === 'high' ? 24 : 19) / 10).toFixed(1);
  const streak = randomInt(3, 28);
  const weeklyProgress = Math.min(96, Math.max(28, Math.round((steps / 12000) * 70 + randomInt(8, 22))));

  return {
    calories: calories.toLocaleString(),
    water,
    streak: streak.toString(),
    steps: steps.toLocaleString(),
    weeklyProgress,
    workouts: pickWorkouts()
  };
};

const Dashboard: React.FC = () => {
  const { user, unreadCount, latestWorkoutAlert } = useAuth();
  const { enterVaultMode } = useVault();
  const fitnessSnapshot = useMemo(() => createFitnessSnapshot(), []);
  const [dragY, setDragY] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const startY = useRef(0);

  const getInitials = () => {
    if (!user?.username) return 'JD';
    return user.username.substring(0, 2).toUpperCase();
  };

  const handleStart = (e: any) => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    startY.current = y;
    setIsHolding(true);
  };

  const handleMove = (e: any) => {
    if (!isHolding) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const diff = y - startY.current;
    if (diff > 0) {
      setDragY(Math.min(diff, 150));
      if (diff > 120) {
        enterVaultMode();
        handleEnd();
      }
    }
  };

  const handleEnd = () => {
    setIsHolding(false);
    setDragY(0);
  };

  return (
    <div className="space-y-6 select-none" onMouseMove={handleMove} onMouseUp={handleEnd} onTouchMove={handleMove} onTouchEnd={handleEnd}>
      {/* Header with Secret Trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Hello, {user?.username || 'Champ'}!</h2>
          <p className="text-slate-500">Ready for today's workout?</p>
        </div>
        <div className="relative">
          <motion.div 
            style={{ y: dragY }}
            className={`w-12 h-12 rounded-full bg-fitness-primary flex items-center justify-center text-white font-bold cursor-pointer shadow-lg z-10 relative ${isHolding ? 'scale-110' : ''}`}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
          >
            {getInitials()}
          </motion.div>
          
          {/* Drag Track Indicator (Hidden hint) */}
          <AnimatePresence>
            {isHolding && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.1 }}
                exit={{ opacity: 0 }}
                className="absolute top-0 left-0 w-12 h-[150px] bg-fitness-primary rounded-full -z-0"
              />
            )}
          </AnimatePresence>

          {unreadCount > 0 && !isHolding && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-fitness-bg flex items-center justify-center text-[10px] text-white font-bold animate-bounce z-20">
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </div>
      </div>

      {unreadCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-amber-100 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-5 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <BellRing size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-500">
                <span>Workout Alert</span>
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </div>
              <h3 className="mt-2 text-base font-bold text-slate-800">
                {latestWorkoutAlert ? `${latestWorkoutAlert.senderAlias} sent a recovery ping` : 'A private recovery ping just arrived'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pull down the profile bubble to open Advanced Metrics and review your secure messages.
              </p>
            </div>
            <div className="flex items-center gap-1 text-emerald-500">
              <ChevronDown size={18} />
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={<Flame className="text-orange-500" />} label="Calories" value={fitnessSnapshot.calories} unit="kcal" />
        <StatCard icon={<Droplets className="text-blue-500" />} label="Water" value={fitnessSnapshot.water} unit="liters" />
        <StatCard icon={<Trophy className="text-yellow-500" />} label="Streak" value={fitnessSnapshot.streak} unit="days" />
        <StatCard icon={<Activity className="text-fitness-primary" />} label="Steps" value={fitnessSnapshot.steps} unit="steps" />
      </div>

      {/* Daily Progress */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="font-bold mb-4">Weekly Goal</h3>
        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-fitness-primary"
            initial={{ width: 0 }}
            animate={{ width: `${fitnessSnapshot.weeklyProgress}%` }}
            transition={{ duration: 1 }}
          />
        </div>
        <p className="text-sm text-slate-500 mt-2 text-right">{fitnessSnapshot.weeklyProgress}% of weekly goal achieved</p>
      </div>

      {/* Recent Workouts */}
      <div>
        <h3 className="font-bold mb-4">Recent Workouts</h3>
        <div className="space-y-3">
          {fitnessSnapshot.workouts.map((workout) => (
            <WorkoutItem
              key={workout.title}
              title={workout.title}
              duration={workout.duration}
              color={workout.color}
              textColor={workout.textColor}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: string, unit: string }> = ({ icon, label, value, unit }) => (
  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
    <div className="mb-2">{icon}</div>
    <div className="text-xs text-slate-500 uppercase font-semibold">{label}</div>
    <div className="text-xl font-bold text-slate-800">
      {value} <span className="text-sm font-normal text-slate-400">{unit}</span>
    </div>
  </div>
);

const WorkoutItem: React.FC<{ title: string, duration: string, color: string, textColor: string }> = ({ title, duration, color, textColor }) => (
  <div className={`flex items-center justify-between p-4 rounded-xl ${color}`}>
    <div className="font-semibold text-slate-800">{title}</div>
    <div className={`text-sm font-bold ${textColor}`}>{duration}</div>
  </div>
);

export default Dashboard;
