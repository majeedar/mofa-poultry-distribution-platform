import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import api from './api';
import useAuthStore from './authStore';

/**
 * Reusable demo-login picker for all 4 mobile apps.
 * Uses ScrollView + map (not FlatList) so it can safely sit inside
 * any parent ScrollView without triggering the VirtualizedList nesting warning.
 */
export default function DemoUserPicker({ users, allowedRole, homeScreen, navigation }) {
  const { login } = useAuthStore();
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);

  const filtered = users.filter(u =>
    u.label.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.sub && u.sub.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = async (user) => {
    setOpen(false);
    setSearch('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: user.email, password: 'Demo2026!' });
      if (allowedRole && data.user.role !== allowedRole) {
        Alert.alert('Access Denied', `This app is for ${allowedRole} accounts only.`);
        return;
      }
      await login(data.user, data.token);
      navigation.replace(homeScreen);
    } catch (e) {
      Alert.alert('Login Failed', e.response?.data?.error || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <View style={s.wrap}>
      {/* Trigger button */}
      <TouchableOpacity
        style={s.trigger}
        onPress={() => { setOpen(o => !o); setSearch(''); }}
        disabled={loading}
        activeOpacity={0.75}
      >
        {loading
          ? <ActivityIndicator size="small" color="#006B3F" />
          : <Text style={s.triggerText}>
              🧪 Demo Login — select a user {open ? '▴' : '▾'}
            </Text>
        }
      </TouchableOpacity>

      {/* Dropdown panel — ScrollView+map avoids VirtualizedList nesting warning */}
      {open && (
        <View style={s.panel}>
          <TextInput
            style={s.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email..."
            autoFocus
            autoCapitalize="none"
            placeholderTextColor="#9ca3af"
          />
          <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && (
              <Text style={s.empty}>No users match "{search}"</Text>
            )}
            {filtered.map((item, idx) => (
              <View key={item.email}>
                <TouchableOpacity style={s.item} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                  <Text style={s.itemLabel}>{item.label}</Text>
                  {item.sub && <Text style={s.itemSub}>{item.sub}</Text>}
                  <Text style={s.itemEmail}>{item.email}</Text>
                </TouchableOpacity>
                {idx < filtered.length - 1 && <View style={s.sep} />}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:        { marginTop: 12 },
  trigger:     { borderWidth: 1.5, borderColor: '#006B3F', borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f0fdf4' },
  triggerText: { color: '#006B3F', fontWeight: '600', fontSize: 14 },
  panel:       { marginTop: 6, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  search:      { borderBottomWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111', backgroundColor: '#fafafa' },
  item:        { paddingHorizontal: 14, paddingVertical: 11 },
  itemLabel:   { fontSize: 14, fontWeight: '700', color: '#111' },
  itemSub:     { fontSize: 12, color: '#374151', marginTop: 1 },
  itemEmail:   { fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: 'monospace' },
  sep:         { height: 1, backgroundColor: '#f3f4f6' },
  empty:       { padding: 14, textAlign: 'center', color: '#9ca3af', fontSize: 13 },
});
