import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface User {
  id: string;
  username: string;
  alias: string;
  fitId: string;
}

interface WorkoutAlert {
  senderId: string;
  senderAlias: string;
  createdAt: string;
}

import { Socket } from 'socket.io-client';
import { buildApiUrl, connectSocket } from '../runtimeConfig';

interface AuthContextType {
  user: User | null;
  token: string | null;
  vaultToken: string | null;
  login: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
  setVaultToken: (token: string | null) => void;
  isAuthenticated: boolean;
  isVaultUnlocked: boolean;
  unreadCount: number;
  latestWorkoutAlert: WorkoutAlert | null;
  incrementUnread: () => void;
  clearUnread: () => void;
  refreshUnreadCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [vaultToken, setVaultTokenState] = useState<string | null>(null); // Do NOT load from localStorage
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestWorkoutAlert, setLatestWorkoutAlert] = useState<WorkoutAlert | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const refreshUnreadCount = async () => {
    if (!token) {
      setUnreadCount(0);
      setLatestWorkoutAlert(null);
      return;
    }

    try {
      const res = await axios.get(buildApiUrl('/api/sync-center/unread-count'), {
        headers: { 'x-auth-token': token }
      });
      setUnreadCount(res.data.unreadCount);
      if (!res.data.unreadCount) {
        setLatestWorkoutAlert(null);
      }
    } catch (err) {
      console.error('Unread Count Error:', err);
    }
  };

  useEffect(() => {
    refreshUnreadCount();
  }, [token, user?.id]);

  // Listen for workout-style vault notifications while the fitness app is open
  useEffect(() => {
    if (token && user?.id) {
      const socket = connectSocket({
        auth: { authToken: token }
      });
      socketRef.current = socket;

      socket.on('vaultNotification', (notification: WorkoutAlert) => {
        if (notification.senderId !== user.id) {
          setUnreadCount(prev => prev + 1);
          setLatestWorkoutAlert(notification);
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [token, user?.id]);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const updateUser = (nextUser: User) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setVaultTokenState(null);
    setUnreadCount(0);
    setLatestWorkoutAlert(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('vaultToken');
  };

  const setVaultToken = (newToken: string | null) => {
    setVaultTokenState(newToken);
    if (!newToken) {
      setUnreadCount(0);
    }
  };

  const incrementUnread = () => setUnreadCount(prev => prev + 1);
  const clearUnread = () => {
    setUnreadCount(0);
    setLatestWorkoutAlert(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      vaultToken, 
      login, 
      updateUser,
      logout, 
      setVaultToken,
      isAuthenticated: !!token,
      isVaultUnlocked: !!vaultToken,
      unreadCount,
      latestWorkoutAlert,
      incrementUnread,
      clearUnread,
      refreshUnreadCount
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
