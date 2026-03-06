import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, RefreshControl,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import api from '../../../shared/api';

export default function IncomingDeliveryScreen({ navigation }) {
  const [farmer, setFarmer]         = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: myFarmer } = await api.get('/farmers/mine');
      setFarmer(myFarmer);
      if (myFarmer) {
        const { data: dels } = await api.get(`/deliveries/farmer/${myFarmer.id}`);
        setDeliveries(Array.isArray(dels) ? dels : dels ? [dels] : []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  if (!farmer) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>🐣</Text>
      <Text style={s.noDelivery}>No farmer profile found</Text>
      <Text style={s.noDeliverySub}>Your account is not linked to a farmer record</Text>
    </View>
  );

  const pending   = deliveries.filter(d => d.status === 'pending');
  const delivered = deliveries.filter(d => d.status === 'delivered');
  const active    = pending[0] || null;

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Active / pending delivery — show QR for SP to scan */}
      {active ? (
        <>
          <View style={s.header}>
            <Text style={s.headerTitle}>Incoming DoCs</Text>
            <Text style={s.headerSub}>Show this barcode to your Service Provider</Text>
          </View>

          <View style={s.qrCard}>
            <QRCode value={active.delivery_barcode} size={220} backgroundColor="#fff" color="#111" />
            <Text style={s.barcodeText}>{active.delivery_barcode}</Text>
          </View>

          <View style={s.infoCard}>
            <Row label="DoCs Allocated"    value={`${active.docs_allocated} Day-Old Chicks`} />
            <Row label="Collection Method" value={active.collection_method || '—'} />
            <Row label="Status"            value="⏳ Awaiting delivery" />
            <Row label="Batch"             value={active.batch_barcode || '—'} mono />
            <Row label="Allocated On"      value={active.generated_at ? new Date(active.generated_at).toLocaleDateString() : '—'} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#16a34a' }]}
              onPress={() => navigation.navigate('DailyEntry', { farmerId: farmer.id })}>
              <Text style={s.btnText}>📋 Daily Entry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#1d4ed8' }]}
              onPress={() => navigation.navigate('DocsStats', { farmerId: farmer.id })}>
              <Text style={s.btnText}>📊 View DoC Statistics</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[s.header, { backgroundColor: delivered.length ? '#16a34a' : '#006B3F' }]}>
          <Text style={s.headerTitle}>
            {delivered.length ? '✅ All Deliveries Received' : 'Incoming DoCs'}
          </Text>
          <Text style={s.headerSub}>
            {delivered.length
              ? `${delivered.length} batch${delivered.length > 1 ? 'es' : ''} confirmed`
              : 'Your Service Provider will notify you when DoCs are allocated'}
          </Text>
        </View>
      )}

      {/* No deliveries at all */}
      {deliveries.length === 0 && (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🐣</Text>
          <Text style={s.noDelivery}>No deliveries yet</Text>
          <Text style={s.noDeliverySub}>Pull down to refresh</Text>
        </View>
      )}

      {/* Delivered batches history */}
      {delivered.length > 0 && (
        <View style={{ padding: 16 }}>
          <Text style={s.sectionTitle}>Received Batches</Text>
          {delivered.map(d => (
            <View key={d.id} style={s.deliveredCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={s.deliveredTitle}>{d.batch_barcode || `Batch #${d.allocation_id}`}</Text>
                <View style={s.badgeGreen}><Text style={s.badgeText}>✓ Received</Text></View>
              </View>
              <Text style={s.deliveredMeta}>📦 {d.docs_delivered ?? d.docs_allocated} DoCs received</Text>
              <Text style={s.deliveredMeta}>📅 {d.loading_date ? new Date(d.loading_date).toLocaleDateString() : '—'}</Text>
              <Text style={s.deliveredMeta}>🚚 {d.collection_method || '—'}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[s.btn, { backgroundColor: '#1d4ed8', marginTop: 8 }]}
            onPress={() => navigation.navigate('DocsStats', { farmerId: farmer.id })}
          >
            <Text style={s.btnText}>📊 View DoC Statistics →</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const Row = ({ label, value, mono }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
    <Text style={{ color: '#6b7280', fontSize: 13 }}>{label}</Text>
    <Text style={{ color: '#111', fontWeight: '600', fontSize: 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafb' },
  header:        { backgroundColor: '#006B3F', padding: 20 },
  headerTitle:   { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:     { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  qrCard:        { backgroundColor: '#fff', margin: 16, borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  barcodeText:   { marginTop: 12, fontSize: 11, color: '#6b7280', textAlign: 'center', fontFamily: 'monospace' },
  infoCard:      { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16 },
  btn:           { backgroundColor: '#006B3F', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText:       { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  noDelivery:    { fontSize: 18, fontWeight: 'bold', color: '#111' },
  noDeliverySub: { color: '#888', fontSize: 13, marginTop: 8, textAlign: 'center' },
  sectionTitle:  { fontWeight: 'bold', color: '#374151', fontSize: 15, marginBottom: 10 },
  deliveredCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  deliveredTitle:{ fontWeight: 'bold', color: '#111', fontSize: 14 },
  deliveredMeta: { fontSize: 13, color: '#555', marginTop: 3 },
  badgeGreen:    { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText:     { fontSize: 11, fontWeight: '600', color: '#15803d' },
});
