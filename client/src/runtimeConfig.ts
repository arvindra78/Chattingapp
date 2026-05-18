import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client';

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
