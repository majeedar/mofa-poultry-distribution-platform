import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import api from '../../../shared/api';

export default function IncomingAllocationScreen({ navigation }) {
  const [allocation, setAllocation] = useState(null);
  const [sp, setSp]                 = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: spData } = await api.get('/service-providers/mine');
      setSp(spData);
      const { data: allocs } = await api.get(`/allocations/sp/${spData?.id}`);
      setAllocation(allocs[0] || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  if (!allocation) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
      <Text style={s.noAlloc}>No pending allocations</Text>
      <Text style={s.noAllocSub}>Check back when a distributor is en route</Text>
      <TouchableOpacity style={[s.btn, { marginTop: 24 }]} onPress={() => { setLoading(true); load(); }}>
        <Text style={s.btnText}>↻ Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Delivered view ────────────────────────────────────────────────────────
  if (allocation.status === 'delivered') return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={[s.header, { backgroundColor: '#16a34a' }]}>
        <Text style={s.headerTitle}>✅ Delivery Confirmed</Text>
        <Text style={s.headerSub}>This allocation has been received and signed</Text>
      </View>

      <View style={[s.card, { margin: 16, alignItems: 'center', paddingVertical: 28 }]}>
        <Text style={{ fontSize: 56, marginBottom: 12 }}>✅</Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#15803d' }}>Receipt Complete</Text>
        <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' }}>
          {allocation.docs_confirmed ?? allocation.docs_allocated} DoCs confirmed received
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Allocation Details</Text>
        <Row label="Barcode"        value={allocation.allocation_barcode} mono />
        <Row label="DoCs Allocated" value={`${allocation.docs_allocated}`} />
        <Row label="DoCs Confirmed" value={`${allocation.docs_confirmed ?? '—'}`} />
        <Row label="Status"         value="Delivered ✓" />
        <Row label="Batch"          value={allocation.batch_barcode || '—'} mono />
      </View>

      {/* Action buttons for post-delivery workflow */}
      <TouchableOpacity
        style={s.btn}
        onPress={() => navigation.navigate('FarmerAllocation', { allocation })}
      >
        <Text style={s.btnText}>📋 Plan Farmer Allocations →</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.btn, { backgroundColor: '#0369a1', marginTop: 0 }]}
        onPress={() => navigation.navigate('FarmerDistribution', { allocationId: allocation.id, spId: sp?.id })}
      >
        <Text style={s.btnText}>📷 Scan & Deliver to Farmers →</Text>
      </TouchableOpacity>

      <Text style={s.refreshHint}>Pull down to refresh</Text>
    </ScrollView>
  );

  // ── Pending / en_route view ───────────────────────────────────────────────
  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Incoming Allocation</Text>
        <Text style={s.headerSub}>
          {allocation.status === 'en_route'
            ? '🚚 Distributor is on the way — show this barcode when they arrive'
            : 'Show this barcode to the distributor when they arrive'}
        </Text>
      </View>

      <View style={s.qrCard}>
        <QRCode value={allocation.allocation_barcode} size={200} backgroundColor="#fff" color="#111" />
        <Text style={s.barcodeText}>{allocation.allocation_barcode}</Text>
      </View>

      <View style={s.card}>
        <Row label="DoCs Expected"  value={`${allocation.docs_allocated}`} />
        <Row label="Batch"          value={allocation.batch_barcode || '—'} mono />
        <Row label="Status"         value={allocation.status} />
        {allocation.expected_arrival_time && (
          <Row label="Expected Arrival" value={new Date(allocation.expected_arrival_time).toLocaleString()} />
        )}
      </View>

      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('ConfirmReceipt', { allocation })}>
        <Text style={s.btnText}>Distributor Arrived → Confirm Receipt</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
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
  container:   { flex: 1, backgroundColor: '#f8fafb' },
  header:      { backgroundColor: '#006B3F', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:   { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  qrCard:      { backgroundColor: '#fff', margin: 16, borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  barcodeText: { marginTop: 12, fontFamily: 'monospace', fontSize: 13, color: '#374151' },
  card:        { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16 },
  cardTitle:   { fontWeight: 'bold', fontSize: 14, color: '#374151', marginBottom: 8 },
  btn:         { backgroundColor: '#006B3F', margin: 16, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnText:     { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  noAlloc:     { fontSize: 18, fontWeight: 'bold', color: '#111' },
  noAllocSub:  { color: '#888', fontSize: 13, marginTop: 8 },
  refreshHint: { textAlign: 'center', color: '#9ca3af', fontSize: 11, paddingBottom: 24 },
});
