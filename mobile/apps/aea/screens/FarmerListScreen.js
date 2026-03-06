import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput
} from 'react-native';
import api from '../../../shared/api';

export default function FarmerListScreen({ navigation }) {
  const [farmers, setFarmers]   = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // all | anchor | small_medium | household

  const load = async () => {
    try {
      const { data } = await api.get('/farmers');
      setFarmers(data);
      setFiltered(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = farmers;
    if (filter !== 'all') result = result.filter(f => f.production_tier === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f =>
        f.full_name?.toLowerCase().includes(q) ||
        f.farmer_number?.toLowerCase().includes(q) ||
        f.ghana_card_number?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, filter, farmers]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  const tierColor = { anchor: '#006B3F', small_medium: '#2563eb', household: '#d97706' };
  const tierLabel = { anchor: 'Anchor', small_medium: 'Small-Med', household: 'Household' };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>My Farmers</Text>
        <Text style={s.sub}>{filtered.length} of {farmers.length} farmers</Text>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <Text style={{ color: '#9ca3af', marginRight: 8 }}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, ID or Ghana Card..."
          placeholderTextColor="#9ca3af"
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: '#9ca3af', fontSize: 18 }}>✕</Text></TouchableOpacity> : null}
      </View>

      {/* Tier filter */}
      <View style={s.filterRow}>
        {['all', 'anchor', 'small_medium', 'household'].map(t => (
          <TouchableOpacity
            key={t}
            style={[s.filterChip, filter === t && { backgroundColor: '#006B3F', borderColor: '#006B3F' }]}
            onPress={() => setFilter(t)}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: filter === t ? '#fff' : '#6b7280' }}>
              {t === 'all' ? 'All' : tierLabel[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#006B3F']} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Text style={{ fontSize: 36 }}>🔍</Text>
            <Text style={{ color: '#9ca3af', marginTop: 12 }}>No farmers found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const tc = tierColor[item.production_tier] || '#6b7280';
          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => navigation.navigate('FarmVisit', { farmer: item })}
              activeOpacity={0.8}
            >
              <View style={[s.avatar, { backgroundColor: tc }]}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                  {item.full_name?.[0] ?? 'F'}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.farmerName}>{item.full_name}</Text>
                <Text style={s.meta}>{item.farmer_number} · {item.farm_location}</Text>
                <Text style={[s.tier, { color: tc }]}>{tierLabel[item.production_tier] ?? item.production_tier}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.flock_capacity} birds</Text>
                {item.has_tablet && (
                  <View style={s.tabletBadge}>
                    <Text style={{ fontSize: 10, color: '#1d4ed8', fontWeight: '600' }}>📱 Tablet</Text>
                  </View>
                )}
                <Text style={{ fontSize: 20, color: '#9ca3af', marginTop: 4 }}>›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('FarmerRegister')}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold' }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8fafb' },
  header:      { backgroundColor: '#006B3F', padding: 20 },
  title:       { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:         { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  searchInput: { flex: 1, fontSize: 14, color: '#111' },
  filterRow:   { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  filterChip:  { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  card:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  avatar:      { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  farmerName:  { fontWeight: '700', color: '#111', fontSize: 14 },
  meta:        { color: '#6b7280', fontSize: 12, marginTop: 2 },
  tier:        { fontSize: 11, fontWeight: '600', marginTop: 3 },
  tabletBadge: { backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  fab:         { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#006B3F', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
});
