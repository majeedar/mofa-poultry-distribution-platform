import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { getPendingSync, markSynced } from '../../../shared/db';
import api from '../../../shared/api';

export default function SyncStatusScreen() {
  const [pending, setPending] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const load = async () => {
    const p = await getPendingSync();
    setPending(p);
  };

  useEffect(() => { load(); }, []);

  const syncAll = async () => {
    setSyncing(true);
    let synced = 0;
    for (const item of pending) {
      try {
        await api[item.method.toLowerCase()](item.url, item.data ? JSON.parse(item.data) : undefined);
        await markSynced(item.id);
        synced++;
      } catch (e) {
        console.warn('Sync failed for item', item.id, e.message);
      }
    }
    setSyncing(false);
    setLastSync(new Date());
    await load();
    Alert.alert('Sync Complete', `${synced}/${pending.length} records synced`);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Sync Status</Text>
        <Text style={s.sub}>{lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : 'Not yet synced this session'}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.pendingCount}>{pending.length}</Text>
        <Text style={s.pendingLabel}>Records pending sync</Text>
        <TouchableOpacity style={[s.btn, syncing && { opacity: 0.6 }]} onPress={syncAll} disabled={syncing || pending.length === 0}>
          <Text style={s.btnText}>{syncing ? 'Syncing...' : pending.length === 0 ? '✓ All Synced' : 'Sync Now'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={pending} keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <View style={s.item}>
            <Text style={s.itemMethod}>{item.method}</Text>
            <Text style={s.itemUrl}>{item.url}</Text>
            <Text style={s.itemTime}>{new Date(item.created_at * 1000).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>No pending records</Text>}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafb' },
  header:       { backgroundColor: '#006B3F', padding: 20 },
  title:        { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:          { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  card:         { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  pendingCount: { fontSize: 48, fontWeight: 'bold', color: '#006B3F' },
  pendingLabel: { color: '#666', fontSize: 14, marginBottom: 16 },
  btn:          { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  btnText:      { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  item:         { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FCD116' },
  itemMethod:   { fontSize: 12, fontWeight: 'bold', color: '#006B3F' },
  itemUrl:      { fontSize: 13, color: '#444', marginTop: 2 },
  itemTime:     { fontSize: 11, color: '#888', marginTop: 2 },
  empty:        { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
});
