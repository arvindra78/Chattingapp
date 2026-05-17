import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface User {
  id: string;
  username: string;
  alias: string;
  fitId: string;
}

import { io, Socket } from 'socket.io-client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  vaultToken: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setVaultToken: (token: string | null) => void;
  isAuthenticated: boolean;
  isVaultUnlocked: boolean;
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [vaultToken, setVaultTokenState] = useState<string | null>(null); // Do NOT load from localStorage
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // Listen for global messages if vault is unlocked
  useEffect(() => {
    if (vaultToken) {
      const socket = io(import.meta.env.VITE_SOCKET_URL, {
        auth: { token: vaultToken }
      });
      socketRef.current = socket;

      socket.on('message', (msg: any) => {
        if (msg.senderId !== user?.id) {
          setUnreadCount(prev => prev + 1);
        }
      });

      return () => {
        socket.disconnect();
      };
    } else {
      setUnreadCount(0);
    }
  }, [vaultToken, user?.id]);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setVaultTokenState(null);
    setUnreadCount(0);
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
  const clearUnread = () => setUnreadCount(0);

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      vaultToken, 
      login, 
      logout, 
      setVaultToken,
      isAuthenticated: !!token,
      isVaultUnlocked: !!vaultToken,
      unreadCount,
      incrementUnread,
      clearUnread
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
