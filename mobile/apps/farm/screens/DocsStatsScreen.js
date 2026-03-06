import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import api from '../../../shared/api';

export default function DocsStatsScreen({ route, navigation }) {
  const { farmerId: paramFarmerId } = route.params || {};
  const [farmerId, setFarmerId]   = useState(paramFarmerId || null);
  const [deliveries, setDeliveries] = useState([]);
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let fid = farmerId;
      if (!fid) {
        const { data: myFarmer } = await api.get('/farmers/mine');
        fid = myFarmer?.id;
        setFarmerId(fid);
      }
      if (fid) {
        const [dRes, eRes] = await Promise.all([
          api.get(`/deliveries/farmer/${fid}`),
          api.get(`/daily-entries`, { params: { farmer_id: fid } }),
        ]);
        setDeliveries(Array.isArray(dRes.data) ? dRes.data : []);
        setEntries(Array.isArray(eRes.data) ? eRes.data : []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [farmerId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  // ── Build per-batch statistics ─────────────────────────────────────────────
  const batches = deliveries.map(d => {
    const batchEntries = entries.filter(e => e.delivery_id === d.id || e.batch_barcode === d.batch_barcode);
    // Sort entries by date descending
    batchEntries.sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    const latest       = batchEntries[0] || null;
    const docsReceived = d.docs_delivered ?? d.docs_allocated;
    const totalDead    = batchEntries.reduce((sum, e) => sum + (e.mortality_count || 0), 0);
    const currentAlive = latest?.birds_alive ?? docsReceived;
    const mortalityPct = docsReceived > 0 ? ((totalDead / docsReceived) * 100).toFixed(1) : '0.0';
    const loadingDate  = d.loading_date ? new Date(d.loading_date) : null;
    const today        = new Date();
    const ageInDays    = loadingDate
      ? Math.max(0, Math.floor((today - loadingDate) / (1000 * 60 * 60 * 24)))
      : null;
    return { delivery: d, batchEntries, latest, docsReceived, totalDead, currentAlive, mortalityPct, ageInDays, loadingDate };
  });

  // Sort by loading date descending (newest batch first)
  batches.sort((a, b) => (b.loadingDate || 0) - (a.loadingDate || 0));

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totalDocsEver   = batches.reduce((s, b) => s + b.docsReceived, 0);
  const totalDeadEver   = batches.reduce((s, b) => s + b.totalDead, 0);
  const totalAliveNow   = batches.reduce((s, b) => s + b.currentAlive, 0);

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My DoC Statistics</Text>
        <Text style={s.headerSub}>{batches.length} batch{batches.length !== 1 ? 'es' : ''} · pull to refresh</Text>
      </View>

      {/* Overall summary card */}
      {batches.length > 0 && (
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>Overall Summary</Text>
          <View style={s.summaryRow}>
            <StatBox label="Total DoCs Received" value={totalDocsEver} color="#006B3F" />
            <StatBox label="Currently Alive"     value={totalAliveNow} color="#1d4ed8" />
            <StatBox label="Total Deaths"        value={totalDeadEver} color="#dc2626" />
          </View>
        </View>
      )}

      {/* Empty state */}
      {batches.length === 0 && (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🐣</Text>
          <Text style={s.emptyTitle}>No DoC records yet</Text>
          <Text style={s.emptySub}>Deliveries and daily entries will appear here</Text>
        </View>
      )}

      {/* Per-batch cards */}
      {batches.map(({ delivery: d, batchEntries, latest, docsReceived, totalDead, currentAlive, mortalityPct, ageInDays, loadingDate }) => (
        <View key={d.id} style={s.batchCard}>
          {/* Card header */}
          <View style={s.batchHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.batchCode}>{d.batch_barcode || `Batch #${d.allocation_id}`}</Text>
              <Text style={s.batchDate}>
                📅 {loadingDate ? loadingDate.toLocaleDateString() : '—'}
                {ageInDays !== null && <Text style={s.ageChip}>  ·  Day {ageInDays + 1}</Text>}
              </Text>
            </View>
            <View style={[s.statusBadge, d.status === 'delivered' ? s.statusGreen : s.statusAmber]}>
              <Text style={s.statusBadgeText}>{d.status === 'delivered' ? '✓ Received' : '⏳ Pending'}</Text>
            </View>
          </View>

          {/* Stats grid */}
          <View style={s.statsGrid}>
            <MiniStat icon="📦" label="Received" value={docsReceived} />
            <MiniStat icon="🐥" label="Alive Now" value={currentAlive} highlight />
            <MiniStat icon="💀" label="Total Dead" value={totalDead} danger={totalDead > 0} />
            <MiniStat icon="📉" label="Mortality" value={`${mortalityPct}%`} danger={parseFloat(mortalityPct) > 5} />
          </View>

          {/* Chick age progress */}
          {ageInDays !== null && (
            <View style={s.ageRow}>
              <Text style={s.ageLabel}>Chick Age: Day {ageInDays + 1}</Text>
              <View style={s.ageBar}>
                <View style={[s.ageFill, { width: `${Math.min(100, ((ageInDays + 1) / 42) * 100)}%` }]} />
              </View>
              <Text style={s.ageHint}>of ~42 day grow cycle</Text>
            </View>
          )}

          {/* Latest daily entry snippet */}
          {latest && (
            <View style={s.latestEntry}>
              <Text style={s.latestEntryTitle}>Latest Entry — {new Date(latest.entry_date).toLocaleDateString()}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <Text style={s.entryMeta}>🐥 {latest.birds_alive} alive</Text>
                <Text style={s.entryMeta}>💀 {latest.mortality_count || 0} dead</Text>
                {latest.vaccine_given && <Text style={s.entryMeta}>💉 Vaccinated</Text>}
              </View>
            </View>
          )}

          {batchEntries.length === 0 && d.status === 'delivered' && (
            <TouchableOpacity
              style={s.entryPrompt}
              onPress={() => navigation.navigate('DailyEntry', { farmerId })}
            >
              <Text style={s.entryPromptText}>📋 No daily entries yet — tap to add today's entry</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const StatBox = ({ label, value, color }) => (
  <View style={[sb.box, { borderTopColor: color }]}>
    <Text style={[sb.value, { color }]}>{value}</Text>
    <Text style={sb.label}>{label}</Text>
  </View>
);

const MiniStat = ({ icon, label, value, highlight, danger }) => (
  <View style={ms.wrap}>
    <Text style={ms.icon}>{icon}</Text>
    <Text style={[ms.value, highlight && ms.highlight, danger && ms.danger]}>{value}</Text>
    <Text style={ms.label}>{label}</Text>
  </View>
);

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f8fafb' },
  header:           { backgroundColor: '#006B3F', padding: 20 },
  headerTitle:      { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:        { color: '#a7f3d0', fontSize: 12, marginTop: 4 },

  summaryCard:      { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  summaryTitle:     { fontWeight: 'bold', color: '#374151', fontSize: 14, marginBottom: 12 },
  summaryRow:       { flexDirection: 'row', gap: 8 },

  batchCard:        { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  batchHeader:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  batchCode:        { fontWeight: 'bold', fontSize: 13, color: '#111', fontFamily: 'monospace' },
  batchDate:        { fontSize: 12, color: '#6b7280', marginTop: 2 },
  ageChip:          { color: '#006B3F', fontWeight: '600' },
  statusBadge:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexShrink: 0 },
  statusGreen:      { backgroundColor: '#dcfce7' },
  statusAmber:      { backgroundColor: '#fef3c7' },
  statusBadgeText:  { fontSize: 11, fontWeight: '600', color: '#374151' },

  statsGrid:        { flexDirection: 'row', borderTopWidth: 1, borderColor: '#f3f4f6', paddingTop: 12, marginBottom: 12 },

  ageRow:           { marginBottom: 10 },
  ageLabel:         { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 },
  ageBar:           { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  ageFill:          { height: 6, backgroundColor: '#16a34a', borderRadius: 3 },
  ageHint:          { fontSize: 10, color: '#9ca3af', marginTop: 3 },

  latestEntry:      { backgroundColor: '#f8fafb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  latestEntryTitle: { fontSize: 12, fontWeight: '700', color: '#374151' },
  entryMeta:        { fontSize: 12, color: '#555' },

  entryPrompt:      { backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginTop: 8, alignItems: 'center' },
  entryPromptText:  { fontSize: 12, color: '#1d4ed8', fontWeight: '500' },

  emptyTitle:       { fontSize: 18, fontWeight: 'bold', color: '#111' },
  emptySub:         { color: '#888', fontSize: 13, marginTop: 8, textAlign: 'center' },
});

const sb = StyleSheet.create({
  box:   { flex: 1, alignItems: 'center', borderTopWidth: 3, paddingTop: 8 },
  value: { fontSize: 22, fontWeight: 'bold' },
  label: { fontSize: 10, color: '#6b7280', marginTop: 2, textAlign: 'center' },
});

const ms = StyleSheet.create({
  wrap:      { flex: 1, alignItems: 'center', paddingVertical: 4 },
  icon:      { fontSize: 18, marginBottom: 2 },
  value:     { fontSize: 18, fontWeight: 'bold', color: '#111' },
  highlight: { color: '#006B3F' },
  danger:    { color: '#dc2626' },
  label:     { fontSize: 10, color: '#6b7280', marginTop: 1 },
});
