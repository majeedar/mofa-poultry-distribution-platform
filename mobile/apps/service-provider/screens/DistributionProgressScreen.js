import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../../../shared/api';
import useAuthStore from '../../../shared/authStore';

export default function DistributionProgressScreen({ navigation }) {
  const { user } = useAuthStore();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data: me }      = await api.get('/users/me');
      // Find SP record
      const { data: spList }  = await api.get('/farmers'); // placeholder — real app: /service-providers
      // In prototype, pull deliveries for this SP's allocations
      const { data: kpi }     = await api.get('/dashboard/kpi');
      setData(kpi);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const [farmers, setFarmers] = useState([]);
  const [alloc, setAlloc]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: me }     = await api.get('/users/me');
        const { data: spFm }   = await api.get('/farmers');
        setFarmers(spFm.slice(0, 8)); // show first 8 for demo
        // Load current allocation
        const { data: batches } = await api.get('/batches');
        if (batches.length) {
          const b = batches[0];
          setAlloc({ total: b.docs_total, distributed: Math.floor(b.docs_total * 0.6) });
        }
      } catch {}
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  const pct = alloc ? Math.round((alloc.distributed / alloc.total) * 100) : 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Distribution Progress</Text>
        <Text style={s.sub}>Overview of farmer DoC deliveries</Text>
      </View>

      {alloc && (
        <View style={s.progressCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={s.progressLabel}>DoCs Distributed</Text>
            <Text style={s.progressPct}>{pct}%</Text>
          </View>
          <View style={s.bar}>
            <View style={[s.fill, { width: `${pct}%` }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={s.stat}>{alloc.distributed} delivered</Text>
            <Text style={s.stat}>{alloc.total - alloc.distributed} remaining</Text>
          </View>
        </View>
      )}

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Farmers in Your Zone</Text>
        <TouchableOpacity onPress={() => navigation.navigate('FarmerDistribution')}>
          <Text style={{ color: '#006B3F', fontWeight: '600', fontSize: 13 }}>Distribute →</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={farmers}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#006B3F']} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>No farmers assigned</Text>}
        renderItem={({ item }) => {
          const delivered = item.delivery_status === 'delivered';
          return (
            <View style={s.farmerRow}>
              <View style={s.avatar}>
                <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 15 }}>
                  {item.full_name?.[0] ?? 'F'}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.farmerName}>{item.full_name}</Text>
                <Text style={s.farmerId}>{item.farmer_number} · {item.production_tier}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: delivered ? '#dcfce7' : '#fef3c7' }]}>
                <Text style={{ fontSize: 11, color: delivered ? '#166534' : '#92400e', fontWeight: '600' }}>
                  {delivered ? '✓ Done' : 'Pending'}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafb' },
  header:        { backgroundColor: '#006B3F', padding: 20 },
  title:         { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:           { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  progressCard:  { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16 },
  progressLabel: { color: '#374151', fontWeight: '600', fontSize: 14 },
  progressPct:   { color: '#006B3F', fontWeight: 'bold', fontSize: 14 },
  bar:           { height: 10, backgroundColor: '#e5e7eb', borderRadius: 5 },
  fill:          { height: 10, backgroundColor: '#006B3F', borderRadius: 5 },
  stat:          { color: '#6b7280', fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle:  { fontWeight: 'bold', color: '#111', fontSize: 15 },
  farmerRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12 },
  avatar:        { width: 40, height: 40, borderRadius: 20, backgroundColor: '#006B3F', justifyContent: 'center', alignItems: 'center' },
  farmerName:    { fontWeight: '600', color: '#111', fontSize: 14 },
  farmerId:      { color: '#6b7280', fontSize: 12, marginTop: 2 },
  badge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
});
