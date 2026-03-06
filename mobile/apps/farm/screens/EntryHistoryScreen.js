import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import api from '../../../shared/api';

export default function EntryHistoryScreen({ route }) {
  const { farmerId } = route.params;
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/daily-entries/farmer/${farmerId}`);
      setEntries(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  const compliancePct = entries.length
    ? Math.round((entries.filter(e => e.submitted_on_time).length / entries.length) * 100)
    : 100;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Entry History</Text>
        <Text style={s.sub}>{entries.length} records · {compliancePct}% on-time</Text>
      </View>

      {/* Summary strip */}
      {entries.length > 0 && (() => {
        const recent = entries[0];
        const avgAlive = Math.round(entries.slice(0, 7).reduce((a, e) => a + e.birds_alive, 0) / Math.min(entries.slice(0, 7).length, 7));
        const totalMort = entries.reduce((a, e) => a + e.mortality_count, 0);
        return (
          <View style={s.summaryCard}>
            <Stat label="Avg Alive (7d)" value={avgAlive} />
            <Stat label="Total Deaths" value={totalMort} color={totalMort > 10 ? '#dc2626' : '#006B3F'} />
            <Stat label="Last Entry" value={new Date(recent.entry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} />
          </View>
        );
      })()}

      <FlatList
        data={entries}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#006B3F']} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={{ color: '#9ca3af', marginTop: 12 }}>No entries yet</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expanded === item.id;
          const mortFlag = item.mortality_count > 0;
          return (
            <TouchableOpacity style={s.card} onPress={() => setExpanded(isExpanded ? null : item.id)} activeOpacity={0.8}>
              <View style={s.cardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.dateText}>{new Date(item.entry_date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</Text>
                  {!item.submitted_on_time && <View style={s.lateBadge}><Text style={{ color: '#92400e', fontSize: 10, fontWeight: '700' }}>LATE</Text></View>}
                  {mortFlag && <View style={s.mortBadge}><Text style={{ color: '#991b1b', fontSize: 10, fontWeight: '700' }}>☠ {item.mortality_count}</Text></View>}
                </View>
                <Text style={s.aliveText}>{item.birds_alive} alive</Text>
              </View>

              {isExpanded && (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderColor: '#f3f4f6', paddingTop: 10 }}>
                  <Row label="Birds Alive"      value={item.birds_alive} />
                  <Row label="Mortality"         value={item.mortality_count} color={mortFlag ? '#dc2626' : undefined} />
                  <Row label="Feed (kg)"         value={item.feed_consumed_kg ?? '—'} />
                  <Row label="Water (L)"         value={item.water_consumed_l ?? '—'} />
                  <Row label="Avg Weight (g)"    value={item.avg_weight_g ?? '—'} />
                  <Row label="Vaccine Given"     value={item.vaccine_given ? '✓ Yes' : 'No'} />
                  <Row label="Entry Method"      value={item.entry_method} />
                  {item.health_flags?.length > 0 && (
                    <Row label="Health Flags" value={item.health_flags.join(', ')} />
                  )}
                  {item.notes && <Row label="Notes" value={item.notes} />}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const Stat = ({ label, value, color = '#111' }) => (
  <View style={{ alignItems: 'center', flex: 1 }}>
    <Text style={{ fontSize: 20, fontWeight: 'bold', color }}>{value}</Text>
    <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</Text>
  </View>
);

const Row = ({ label, value, color }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
    <Text style={{ color: '#6b7280', fontSize: 12 }}>{label}</Text>
    <Text style={{ color: color ?? '#111', fontWeight: '600', fontSize: 12 }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8fafb' },
  header:      { backgroundColor: '#006B3F', padding: 20 },
  title:       { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:         { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  summaryCard: { flexDirection: 'row', backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  card:        { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:    { fontWeight: '600', color: '#374151', fontSize: 13 },
  aliveText:   { fontWeight: 'bold', color: '#006B3F', fontSize: 14 },
  lateBadge:   { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  mortBadge:   { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
