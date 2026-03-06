import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import api from '../../../shared/api';
import useAuthStore from '../../../shared/authStore';
import DemoUserPicker from '../../../shared/DemoUserPicker';

const DEMO_USERS = [
  { label: 'Ama Owusu',      sub: 'Anchor Farmer · Kumasi Metro',   email: 'f1@pircmes.gov.gh' },
  { label: 'Kofi Asante',    sub: 'Anchor Farmer · Kumasi Metro',   email: 'f2@pircmes.gov.gh' },
  { label: 'Akosua Boateng', sub: 'Small-Medium Farmer · Kumasi',   email: 'f3@pircmes.gov.gh' },
  { label: 'Yaw Mensah',     sub: 'Small-Medium Farmer · Ga North', email: 'f4@pircmes.gov.gh' },
  { label: 'Abena Darko',    sub: 'Small-Medium Farmer · Ga North', email: 'f5@pircmes.gov.gh' },
];

export default function LoginScreen({ navigation }) {
  const { login } = useAuthStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Enter email and password'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      if (data.user.role !== 'farmer') {
        Alert.alert('Access Denied', 'This app is for farmers only.');
        return;
      }
      await login(data.user, data.token);
      navigation.replace('IncomingDelivery');
    } catch (e) {
      Alert.alert('Login Failed', e.response?.data?.error || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.hero}>
        <Text style={s.emoji}>🐔</Text>
        <Text style={s.appName}>PIRCMES Farm</Text>
        <Text style={s.tagline}>Feed Ghana Programme</Text>
      </View>

      <View style={s.form}>
        <Text style={s.label}>Email Address</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="farmer@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#9ca3af"
        />

        <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secureTextEntry
          placeholderTextColor="#9ca3af"
        />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Sign In</Text>
          }
        </TouchableOpacity>

        <DemoUserPicker
          users={DEMO_USERS}
          allowedRole="farmer"
          homeScreen="IncomingDelivery"
          navigation={navigation}
        />
      </View>

      <Text style={s.footer}>PIRCMES · MoFA Ghana · v1.0</Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafb' },
  hero:      { backgroundColor: '#006B3F', alignItems: 'center', paddingTop: 60, paddingBottom: 36 },
  emoji:     { fontSize: 48, marginBottom: 8 },
  appName:   { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  tagline:   { fontSize: 13, color: '#a7f3d0', marginTop: 4 },
  form:      { margin: 24, backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  label:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:     { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111', backgroundColor: '#fafafa' },
  btn:       { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer:    { textAlign: 'center', color: '#9ca3af', fontSize: 11, marginTop: 'auto', paddingBottom: 24 },
});
