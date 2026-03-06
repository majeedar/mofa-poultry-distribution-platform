import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Android emulator → 10.0.2.2 reaches the host machine's localhost
// Physical device  → change to your LAN IP, e.g. http://192.168.1.100:3001
const API_URL = 'http://10.0.2.2:3001';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('pircmes_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('pircmes_token');
      await AsyncStorage.removeItem('pircmes_user');
    }
    return Promise.reject(err);
  }
);

// Offline queue support: write to local SQLite first, sync later
export const offlineQueue = [];

export async function queueRequest(method, url, data) {
  offlineQueue.push({ method, url, data, ts: Date.now() });
}

export default api;
