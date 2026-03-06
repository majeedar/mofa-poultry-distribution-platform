import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user:  JSON.parse(localStorage.getItem('pircmes_user') || 'null'),
  token: localStorage.getItem('pircmes_token') || null,

  login: (user, token) => {
    localStorage.setItem('pircmes_user',  JSON.stringify(user));
    localStorage.setItem('pircmes_token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('pircmes_user');
    localStorage.removeItem('pircmes_token');
    set({ user: null, token: null });
  },

  isAdmin:    () => useAuthStore.getState().user?.role === 'national_admin',
  isNational: () => ['national_admin','national_officer'].includes(useAuthStore.getState().user?.role),
  canWrite:   () => ['national_admin','national_officer'].includes(useAuthStore.getState().user?.role),
}));

export default useAuthStore;
