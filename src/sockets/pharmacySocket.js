import { io } from 'socket.io-client';

let socket = null;

export function connectPharmacySocket(token, pharmacyId) {
  if (socket) return socket;

  socket = io('https://api.kasmokgroup.com/pharmacy', {
    auth: { token, pharmacyId },
    transports: ['websocket'],
  });

  socket.on('connect_error', (err) => {
    console.error('Pharmacy socket connection error:', err.message);
  });

  return socket;
}

export function getPharmacySocket() {
  return socket;
}

export function disconnectPharmacySocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}