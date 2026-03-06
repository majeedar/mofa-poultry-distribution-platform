import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useAuthStore = create((set, get) => ({
  user:  null,
  token: null,

  init: async () => {
    const token = await AsyncStorage.getItem('pircmes_token');
    const userStr = await AsyncStorage.getItem('pircmes_user');
    if (token && userStr) {
      set({ token, user: JSON.parse(userStr) });
    }
  },

  login: async (user, token) => {
    await AsyncStorage.setItem('pircmes_token', token);
    await AsyncStorage.setItem('pircmes_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: async () => {
    await AsyncStorage.removeItem('pircmes_token');
    await AsyncStorage.removeItem('pircmes_user');
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
