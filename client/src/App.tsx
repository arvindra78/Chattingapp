import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import FitnessLayout from './layouts/FitnessLayout';
import VaultLayout from './layouts/VaultLayout';
import Dashboard from './pages/Dashboard';
import VaultUnlock from './components/VaultUnlock';
import AuthPage from './pages/AuthPage';
import VaultPage from './vault/VaultPage';
import { Copy, Check, Clock, Dumbbell, Flame, TrendingUp, Bell, BellOff } from 'lucide-react';
import axios from 'axios';
import { buildApiUrl } from './runtimeConfig';
import { disableNotifications, enableNotifications, getNotificationState, onNotificationClick, sendNotificationTest, type NotificationState } from './services/notifications';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const workoutPlans = [
  { title: 'Full Body Circuit', focus: 'Strength + cardio', difficulty: 'Medium', tone: 'emerald' },
  { title: 'Push Day Builder', focus: 'Chest, shoulders, triceps', difficulty: 'Hard', tone: 'rose' },
  { title: 'Mobility Reset', focus: 'Hips, spine, shoulders', difficulty: 'Easy', tone: 'sky' },
  { title: 'Lower Body Power', focus: 'Glutes, quads, core', difficulty: 'Hard', tone: 'orange' },
  { title: 'Zone 2 Endurance', focus: 'Steady cardio base', difficulty: 'Medium', tone: 'blue' },
  { title: 'Core Control', focus: 'Abs and stability', difficulty: 'Medium', tone: 'violet' },
  { title: 'Active Recovery', focus: 'Light movement', difficulty: 'Easy', tone: 'teal' }
];

const toneClasses: Record<string, { card: string; icon: string; text: string }> = {
  emerald: { card: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
  rose: { card: 'bg-rose-50', icon: 'bg-rose-100 text-rose-600', text: 'text-rose-600' },
  sky: { card: 'bg-sky-50', icon: 'bg-sky-100 text-sky-600', text: 'text-sky-600' },
  orange: { card: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-600' },
  blue: { card: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
  violet: { card: 'bg-violet-50', icon: 'bg-violet-100 text-violet-600', text: 'text-violet-600' },
  teal: { card: 'bg-teal-50', icon: 'bg-teal-100 text-teal-600', text: 'text-teal-600' }
};

const createWorkoutPage = () => {
  const shuffled = [...workoutPlans].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 4).map((plan, index) => ({
    ...plan,
    duration: randomInt(plan.difficulty === 'Hard' ? 38 : 22, plan.difficulty === 'Easy' ? 34 : 58),
    calories: randomInt(plan.difficulty === 'Hard' ? 320 : 140, plan.difficulty === 'Easy' ? 240 : 430),
    sets: randomInt(3, 5),
    isRecommended: index === 0
  }));

  return {
    readiness: randomInt(68, 96),
    activeMinutes: selected.reduce((sum, item) => sum + item.duration, 0),
    selected
  };
};

const Workouts = () => {
  const plan = useMemo(() => createWorkoutPage(), []);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-fitness-primary">Today's Plan</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-800">Adaptive workouts</h2>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fitness-primary/10 text-fitness-primary">
            <TrendingUp size={22} />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase text-slate-400">Readiness</div>
            <div className="mt-1 text-2xl font-black text-slate-800">{plan.readiness}%</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase text-slate-400">Minutes</div>
            <div className="mt-1 text-2xl font-black text-slate-800">{plan.activeMinutes}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {plan.selected.map((workout) => {
          const tone = toneClasses[workout.tone];
          return (
            <div key={workout.title} className={`rounded-2xl border border-white p-4 shadow-sm ${tone.card}`}>
              <div className="flex items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}>
                  <Dumbbell size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{workout.title}</h3>
                    {workout.isRecommended && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        Best
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{workout.focus}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                    <span className="flex items-center gap-1"><Clock size={14} /> {workout.duration} min</span>
                    <span className="flex items-center gap-1"><Flame size={14} /> {workout.calories} kcal</span>
                    <span className={tone.text}>{workout.sets} blocks</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Stats = () => <div className="p-4">Fitness Statistics</div>;

const Profile = () => {
  const { user, token, logout, unreadCount, updateUser } = useAuth();
  const [copied, setCopied] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(user?.username || '');
  const [aliasDraft, setAliasDraft] = useState(user?.alias || '');
  const [fitIdDraft, setFitIdDraft] = useState(user?.fitId || '');
  const [isDiscoverable, setIsDiscoverable] = useState(user?.isDiscoverable ?? true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationState>('disabled');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);

  useEffect(() => {
    getNotificationState().then(setNotificationState).catch(() => setNotificationState('unsupported'));
  }, []);

  const copyFitId = () => {
    if (user?.fitId) {
      navigator.clipboard.writeText(user.fitId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveProfile = async (changes: Record<string, string | boolean>) => {
    if (!token) return;
    setSavingProfile(true);
    try {
      const res = await axios.patch(
        buildApiUrl('/api/auth/profile'),
        changes,
        { headers: { 'x-auth-token': token } }
      );
      updateUser(res.data.user);
      setUsernameDraft(res.data.user.username);
      setAliasDraft(res.data.user.alias);
      setFitIdDraft(res.data.user.fitId);
      setIsDiscoverable(res.data.user.isDiscoverable);
    } catch (error) {
      const err = error as any;
      window.alert(err.response?.data?.msg || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleDiscoverability = () => saveProfile({ isDiscoverable: !isDiscoverable });

  const savePassword = async () => {
    if (!token) return;
    setSavingPassword(true);
    try {
      await axios.patch(
        buildApiUrl('/api/auth/password'),
        { currentPassword, newPassword },
        { headers: { 'x-auth-token': token } }
      );
      setCurrentPassword('');
      setNewPassword('');
      window.alert('Password updated');
    } catch (error) {
      const err = error as any;
      window.alert(err.response?.data?.msg || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const updateNotifications = async (action: 'enable' | 'disable' | 'test') => {
    if (!token) return;
    setIsUpdatingNotifications(true);
    setNotificationMessage('');
    try {
      if (action === 'enable') {
        await enableNotifications(token);
        setNotificationState('enabled');
        setNotificationMessage('Notifications enabled for this device.');
      } else if (action === 'disable') {
        await disableNotifications(token);
        setNotificationState('disabled');
        setNotificationMessage('Notifications disabled for this device.');
      } else {
        await sendNotificationTest(token);
        setNotificationMessage('Test notification sent.');
      }
    } catch (error) {
      const err = error as any;
      setNotificationMessage(err.response?.data?.msg || err.message || 'Unable to update notifications.');
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setNotificationState('denied');
    } finally {
      setIsUpdatingNotifications(false);
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
            <div className="text-[10px] text-slate-400 uppercase font-bold">Public Discovery FitID</div>
            <div className="font-mono font-bold text-slate-700">@{user?.fitId}</div>
          </div>
          <button 
            onClick={copyFitId}
            className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
          >
            {copied ? <Check size={18} className="text-fitness-primary" /> : <Copy size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 italic px-1">
          This public ID is visible in Discovery. A DM opens only after you accept a request.
        </p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Settings</h3>
        <div className="space-y-3 border-b border-slate-50 pb-4">
          <label className="text-sm font-semibold text-slate-600">Account username</label>
          <div className="flex gap-2">
            <input
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-fitness-primary"
            />
            <button
              type="button"
              onClick={() => saveProfile({ username: usernameDraft })}
              disabled={savingProfile || usernameDraft.trim() === user?.username}
              className="rounded-2xl bg-fitness-primary px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              {savingProfile ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
        <div className="space-y-3 border-b border-slate-50 pb-4">
          <label className="text-sm font-semibold text-slate-600">Display name</label>
          <div className="flex gap-2">
            <input
              value={aliasDraft}
              onChange={(e) => setAliasDraft(e.target.value)}
              placeholder="Choose a unique name"
              className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-fitness-primary"
            />
            <button
              type="button"
              onClick={() => saveProfile({ alias: aliasDraft })}
              disabled={savingProfile || aliasDraft.trim() === user?.alias}
              className="rounded-2xl bg-fitness-primary px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              {savingProfile ? 'Saving' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-slate-400">This replaces random names such as NovaCipher921 and must be unique.</p>
        </div>
        <div className="space-y-3 border-b border-slate-50 pb-4">
          <label className="text-sm font-semibold text-slate-600">Public FitID</label>
          <div className="flex gap-2">
            <input
              value={fitIdDraft}
              onChange={(e) => setFitIdDraft(e.target.value.toLowerCase())}
              placeholder="john_doe"
              maxLength={24}
              className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-fitness-primary"
            />
            <button
              type="button"
              onClick={() => saveProfile({ fitId: fitIdDraft })}
              disabled={savingProfile || fitIdDraft.trim() === user?.fitId}
              className="rounded-2xl bg-fitness-primary px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              {savingProfile ? 'Saving' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-slate-400">Use 3-24 letters, numbers, dots, or underscores. Examples: john_doe, john.doe.</p>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-4">
          <div>
            <div className="text-sm font-semibold text-slate-600">Discovery visibility</div>
            <p className="mt-1 text-xs text-slate-400">{isDiscoverable ? 'Public: your FitID can be found in Discovery.' : 'Private: your FitID is hidden from Discovery.'}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDiscoverable}
            aria-label="Toggle public Discovery visibility"
            onClick={toggleDiscoverability}
            disabled={savingProfile}
            className={`relative h-9 w-20 rounded-full px-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${isDiscoverable ? 'bg-fitness-primary text-white' : 'bg-slate-200 text-slate-500'}`}
          >
            <span className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow transition-transform ${isDiscoverable ? 'translate-x-11' : 'translate-x-0'}`} />
            <span className="relative z-10">{isDiscoverable ? 'PUBLIC' : 'PRIVATE'}</span>
          </button>
        </div>
        <div className="space-y-3 border-b border-slate-50 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-600">Browser notifications</div>
              <p className="mt-1 text-xs text-slate-400">
                {notificationState === 'denied' ? 'Blocked in browser settings.' : notificationState === 'unsupported' ? 'Not supported by this browser or WebView.' : 'Receive alerts for new private messages.'}
              </p>
            </div>
            {notificationState === 'enabled' ? (
              <button type="button" onClick={() => updateNotifications('disable')} disabled={isUpdatingNotifications} className="flex items-center gap-2 rounded-2xl bg-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 disabled:opacity-40">
                <BellOff size={15} /> Disable
              </button>
            ) : (
              <button type="button" onClick={() => updateNotifications('enable')} disabled={isUpdatingNotifications || notificationState === 'unsupported' || notificationState === 'denied'} className="flex items-center gap-2 rounded-2xl bg-fitness-primary px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40">
                <Bell size={15} /> Enable
              </button>
            )}
          </div>
          {notificationState === 'enabled' && <button type="button" onClick={() => updateNotifications('test')} disabled={isUpdatingNotifications} className="text-xs font-bold text-fitness-primary disabled:opacity-40">Send test notification</button>}
          {notificationMessage && <p className="text-xs text-slate-500">{notificationMessage}</p>}
        </div>
        <div className="space-y-3 border-b border-slate-50 pb-4">
          <label className="text-sm font-semibold text-slate-600">Change Password</label>
          <div className="space-y-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-fitness-primary"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-fitness-primary"
            />
            <button
              type="button"
              onClick={savePassword}
              disabled={savingPassword || !currentPassword || newPassword.length < 6}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
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
  const navigate = useNavigate();

  useEffect(() => onNotificationClick((url) => navigate(url)), [navigate]);

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
