import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

const socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

socket.on('connect',    () => console.log('Socket connected:', socket.id));
socket.on('disconnect', () => console.log('Socket disconnected'));

export default socket;
