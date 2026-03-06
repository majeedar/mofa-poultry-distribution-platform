import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../../../shared/api';
import useAuthStore from '../../../shared/authStore';

export default function AEADashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [farmers, setFarmers]     = useState([]);
  const [entries, setEntries]     = useState([]);
  const [flagged, setFlagged]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().slice(0,10);

  const load = async () => {
    try {
      const [f, e, m] = await Promise.all([
        api.get('/farmers'),
        api.get('/daily-entries', { params: { date_from: today, date_to: today } }),
        api.get('/mortality', { params: { is_flagged: 'true' } }),
      ]);
      setFarmers(f.data);
      setEntries(e.data);
      setFlagged(m.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const submittedIds = new Set(entries.map(e => e.farmer_id));
  const submitted = farmers.filter(f => submittedIds.has(f.id));
  const missing   = farmers.filter(f => !submittedIds.has(f.id) && f.production_tier !== 'household');

  const StatBox = ({ label, value, color }) => (
    <View style={[s.statBox, { borderTopColor: color }]}>
      <Text style={[s.statNum, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>AEA Dashboard</Text>
        <Text style={s.sub}>{today}</Text>
      </View>

      <View style={s.stats}>
        <StatBox label="Submitted" value={submitted.length} color="#16a34a" />
        <StatBox label="Missing"   value={missing.length}   color="#dc2626" />
        <StatBox label="Flagged"   value={flagged.length}   color="#d97706" />
        <StatBox label="Total"     value={farmers.length}   color="#2563eb" />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#006B3F" size="large" /> : (
        <FlatList
          data={[
            { type: 'section', title: `Missing Today (${missing.length})`, key: 'missing_header' },
            ...missing.map(f => ({ ...f, type: 'missing' })),
            { type: 'section', title: `Flagged Mortality (${flagged.length})`, key: 'flagged_header' },
            ...flagged.map(f => ({ ...f, type: 'flagged', key: `fl_${f.id}` })),
            { type: 'section', title: `Submitted Today (${submitted.length})`, key: 'submitted_header' },
            ...submitted.map(f => ({ ...f, type: 'submitted' })),
          ]}
          keyExtractor={(item, i) => item.key || String(item.id) + i}
          renderItem={({ item }) => {
            if (item.type === 'section') return (
              <Text style={s.sectionHeader}>{item.title}</Text>
            );
            if (item.type === 'missing') return (
              <TouchableOpacity style={[s.card, s.missingCard]}
                onPress={() => navigation.navigate('FarmVisit', { farmer: item, visitType: 'routine_weekly' })}>
                <Text style={s.farmerName}>{item.full_name}</Text>
                <Text style={s.farmerSub}>{item.production_tier?.replace('_',' ')} · {item.farm_location}</Text>
                <Text style={s.visitLink}>Tap to conduct farm visit →</Text>
              </TouchableOpacity>
            );
            if (item.type === 'flagged') return (
              <TouchableOpacity style={[s.card, s.flaggedCard]}
                onPress={() => navigation.navigate('MortalityReview', { evidenceId: item.id })}>
                <Text style={s.farmerName}>⚠️ {item.farmer_name}</Text>
                <Text style={s.farmerSub}>Count: {item.farmer_count} · OCR: {item.ocr_count} ({item.ocr_status})</Text>
                <Text style={s.visitLink}>Tap to review →</Text>
              </TouchableOpacity>
            );
            if (item.type === 'submitted') return (
              <View style={[s.card, s.submittedCard]}>
                <Text style={s.farmerName}>✓ {item.full_name}</Text>
                <Text style={s.farmerSub}>{item.production_tier?.replace('_',' ')}</Text>
              </View>
            );
            return null;
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      <View style={s.fab}>
        <TouchableOpacity style={s.fabBtn} onPress={() => navigation.navigate('FarmerRegister')}>
          <Text style={s.fabText}>+ Register Farmer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafb' },
  header:        { backgroundColor: '#006B3F', padding: 20 },
  title:         { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  sub:           { color: '#a7f3d0', fontSize: 13, marginTop: 4 },
  stats:         { flexDirection: 'row', padding: 16, gap: 8 },
  statBox:       { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statNum:       { fontSize: 24, fontWeight: 'bold' },
  statLabel:     { fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center' },
  sectionHeader: { fontSize: 13, fontWeight: 'bold', color: '#6b7280', marginTop: 8, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  card:          { borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  missingCard:   { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  flaggedCard:   { backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: '#d97706' },
  submittedCard: { backgroundColor: '#f0fdf4', borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  farmerName:    { fontSize: 15, fontWeight: 'bold', color: '#111' },
  farmerSub:     { fontSize: 12, color: '#666', marginTop: 3 },
  visitLink:     { fontSize: 12, color: '#006B3F', marginTop: 6, fontWeight: '600' },
  fab:           { position: 'absolute', bottom: 20, right: 20 },
  fabBtn:        { backgroundColor: '#006B3F', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  fabText:       { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
