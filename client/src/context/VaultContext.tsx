import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface VaultContextType {
  isVaultMode: boolean;
  enterVaultMode: () => void;
  exitVaultMode: () => void;
  panicExit: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVaultMode, setIsVaultMode] = useState(false);
  const { setVaultToken } = useAuth();

  const enterVaultMode = () => setIsVaultMode(true);
  const exitVaultMode = () => setIsVaultMode(false);

  const panicExit = useCallback(() => {
    setIsVaultMode(false);
    setVaultToken(null);
    // Add vibration or sound if needed
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }, [setVaultToken]);

  // Global Panic Listener (Triple Tap Top Bar - simplified to window click for now)
  // Real implementation could be a specific invisible overlay
  useEffect(() => {
    let tapCount = 0;
    let lastTap = 0;

    const handleGlobalClick = (e: MouseEvent) => {
      // If clicking near the top of the screen (e.g., status bar area)
      if (e.clientY < 60) {
        const now = Date.now();
        if (now - lastTap < 500) {
          tapCount++;
        } else {
          tapCount = 1;
        }
        lastTap = now;

        if (tapCount >= 3) {
          panicExit();
          tapCount = 0;
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [panicExit]);

  return (
    <VaultContext.Provider value={{ isVaultMode, enterVaultMode, exitVaultMode, panicExit }}>
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within a VaultProvider');
  return context;
};
