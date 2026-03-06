import { registerRootComponent } from 'expo';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './navigation';
import useAuthStore from '../../shared/authStore';
import { initDB } from '../../shared/db';

function App() {
  const { init } = useAuthStore();
  useEffect(() => {
    initDB().catch(console.error);
    init();
  }, []);
  return (
    <>
      <StatusBar style="light" backgroundColor="#006B3F" />
      <Navigation />
    </>
  );
}

registerRootComponent(App);
