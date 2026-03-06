import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import api from '../../../shared/api';
import useAuthStore from '../../../shared/authStore';
import DemoUserPicker from '../../../shared/DemoUserPicker';

const DEMO_USERS = [
  { label: 'Emmanuel Acheampong', sub: 'DIST042 · GR-1234-21 · Ashanti',       email: 'dist1@pircmes.gov.gh' },
  { label: 'Francis Adjei',       sub: 'DIST043 · GR-5678-21 · Greater Accra', email: 'dist2@pircmes.gov.gh' },
];

export default function LoginScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Enter email and password'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      if (data.user.role !== 'distributor') {
        Alert.alert('Access Denied', 'This app is for distributors only.');
        return;
      }
      await login(data.user, data.token);
      navigation.replace('ActiveBatch');
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Check your credentials and connection');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.emoji}>🚚</Text>
        <Text style={s.title}>PIRCMES</Text>
        <Text style={s.subtitle}>Distributor App</Text>
        <Text style={s.sub2}>Feed Ghana Programme · MoFA</Text>

        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="rgba(255,255,255,0.6)" />
        <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor="rgba(255,255,255,0.6)" />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#1a1a1a" /> : <Text style={s.btnText}>Sign In</Text>}
        </TouchableOpacity>

        <View style={s.pickerWrap}>
          <DemoUserPicker
            users={DEMO_USERS}
            allowedRole="distributor"
            homeScreen="ActiveBatch"
            navigation={navigation}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#006B3F' },
  inner:      { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingBottom: 48 },
  emoji:      { fontSize: 56, marginBottom: 12 },
  title:      { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  subtitle:   { color: '#a7f3d0', fontSize: 18, marginTop: 4 },
  sub2:       { color: '#6ee7b7', fontSize: 12, marginBottom: 40 },
  input:      { width: '100%', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 15 },
  btn:        { width: '100%', backgroundColor: '#FCD116', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText:    { color: '#1a1a1a', fontWeight: 'bold', fontSize: 16 },
  pickerWrap: { width: '100%', marginTop: 8 },
});
