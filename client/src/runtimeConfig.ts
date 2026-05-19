import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const configuredApiBase = import.meta.env.VITE_API_URL?.trim();
const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

const apiBaseUrl = configuredApiBase ? trimTrailingSlash(configuredApiBase) : '';
const socketUrl = configuredSocketUrl ? trimTrailingSlash(configuredSocketUrl) : undefined;

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};

export const connectSocket = (options: Partial<ManagerOptions & SocketOptions> = {}) =>
  io(socketUrl, {
    transports: ['polling', 'websocket'],
    upgrade: true,
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    ...options
  });

let vaultSocketEntry: { token: string; socket: Socket; refCount: number } | null = null;

export const getVaultSocket = (vaultToken: string) => {
  if (vaultSocketEntry?.token === vaultToken && vaultSocketEntry.socket.connected) {
    vaultSocketEntry.refCount += 1;
    return vaultSocketEntry.socket;
  }

  if (vaultSocketEntry?.token === vaultToken && !vaultSocketEntry.socket.connected) {
    vaultSocketEntry.refCount += 1;
    return vaultSocketEntry.socket;
  }

  if (vaultSocketEntry) {
    vaultSocketEntry.socket.disconnect();
  }

  const socket = connectSocket({
    auth: { token: vaultToken }
  });
  vaultSocketEntry = { token: vaultToken, socket, refCount: 1 };
  return socket;
};

export const releaseVaultSocket = (socket: Socket | null) => {
  if (!vaultSocketEntry || vaultSocketEntry.socket !== socket) return;

  vaultSocketEntry.refCount -= 1;
  if (vaultSocketEntry.refCount <= 0) {
    vaultSocketEntry.socket.disconnect();
    vaultSocketEntry = null;
  }
};
