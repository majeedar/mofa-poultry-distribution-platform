import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import * as Location from 'expo-location';
import api from '../../../shared/api';

// ── Ghana demo waypoints (cycle through on each button press) ─────────────────
const DEMO_WAYPOINTS = [
  { lat:  6.6884, lng: -1.6244 }, // Kumasi
  { lat:  6.7500, lng: -1.5500 }, // Ejisu
  { lat:  7.0000, lng: -1.7000 }, // Mampong
  { lat:  6.6200, lng: -1.7000 }, // Bekwai
  { lat:  6.9000, lng: -1.3000 }, // Konongo
  { lat:  5.5600, lng: -0.2057 }, // Accra
  { lat:  5.8500, lng: -0.5000 }, // Nsawam
  { lat:  6.1000, lng: -0.7200 }, // Koforidua
  { lat:  9.4034, lng: -0.8424 }, // Tamale
  { lat:  7.3667, lng: -1.6167 }, // Sunyani
];

export default function ActiveBatchScreen({ navigation }) {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [tab, setTab]                 = useState(0); // 0 = Pending, 1 = Delivered
  const locationIntervalRef           = useRef(null);

  // Demo location sender
  const demoWaypointRef = useRef(0);
  const [demoSent, setDemoSent] = useState(false);
  const [demoSending, setDemoSending] = useState(false);

  const sendDemoLocation = async () => {
    setDemoSending(true);
    try {
      const idx     = demoWaypointRef.current % DEMO_WAYPOINTS.length;
      const wp      = DEMO_WAYPOINTS[idx];
      demoWaypointRef.current = idx + 1;
      const jitter  = () => (Math.random() - 0.5) * 0.025;
      await api.post('/locations', {
        lat:       wp.lat + jitter(),
        lng:       wp.lng + jitter(),
        heading:   Math.round(Math.random() * 360),
        speed_kmh: Math.round(40 + Math.random() * 50),
        status:    'en_route',
      });
      setDemoSent(true);
      setTimeout(() => setDemoSent(false), 2000);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally { setDemoSending(false); }
  };

  // ── GPS location tracking ─────────────────────────────────────────────────
  const startLocationTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude, heading, speed } = loc.coords;
        await api.post('/locations', {
          lat:       latitude,
          lng:       longitude,
          heading:   heading ?? null,
          speed_kmh: speed != null ? Math.round(speed * 3.6) : null,
          status:    'en_route',
        });
      } catch { /* best effort — silently ignore network errors */ }
    };
    await sendLocation(); // immediate first update
    locationIntervalRef.current = setInterval(sendLocation, 30000);
  };

  const stopLocationTracking = async () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      await api.post('/locations', {
        lat:    loc?.coords.latitude  ?? 0,
        lng:    loc?.coords.longitude ?? 0,
        status: 'idle',
      });
    } catch { /* ignore */ }
  };

  // Start/stop tracking based on whether there are pending deliveries
  useEffect(() => {
    if (loading) return; // wait until first load completes
    const hasPending = allocations.some(a => a.status !== 'delivered');
    if (hasPending && !locationIntervalRef.current) {
      startLocationTracking();
    } else if (!hasPending && locationIntervalRef.current) {
      stopLocationTracking();
    }
  }, [allocations, loading]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current); };
  }, []);

  const load = useCallback(async () => {
    try {
      const { data: dist } = await api.get('/distributors/mine');
      const { data } = await api.get('/allocations', { params: { distributor_id: dist?.id } });
      setAllocations(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Reload every time screen comes into focus (after returning from SPDelivery)
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Helper: recipient label for an allocation
  const recipientLabel = (item) => {
    if (!item.recipient_type || item.recipient_type === 'sp') return item.sp_name || '—';
    return item.farmer_name || '—';
  };
  const recipientRegion = (item) => item.sp_region || item.sp_district || null;
  const tierBadge = (item) => {
    if (!item.recipient_type || item.recipient_type === 'sp') return null;
    return item.recipient_type === 'anchor' ? '🌟 Anchor' : '👩‍🌾 STM';
  };

  // ── Pending: en_route first, then by route_order ───────────────────────────
  const pending = [...allocations]
    .filter(a => a.status !== 'delivered')
    .sort((a, b) => {
      if (a.status === 'en_route' && b.status !== 'en_route') return -1;
      if (b.status === 'en_route' && a.status !== 'en_route') return 1;
      return (a.route_order || 99) - (b.route_order || 99);
    });

  // ── Delivered: group by region, then most recent first ────────────────────
  const delivered = [...allocations]
    .filter(a => a.status === 'delivered')
    .sort((a, b) => {
      const ra = recipientRegion(a) || 'Other';
      const rb = recipientRegion(b) || 'Other';
      const regionCmp = ra.localeCompare(rb);
      if (regionCmp !== 0) return regionCmp;
      const da = a.receipt_signed_at || a.updated_at || '';
      const db = b.receipt_signed_at || b.updated_at || '';
      return db > da ? 1 : da > db ? -1 : 0;
    });

  // Insert region section headers into delivered list
  const deliveredRows = [];
  let lastRegion = null;
  for (const item of delivered) {
    const region = recipientRegion(item) || 'Other';
    if (region !== lastRegion) {
      deliveredRows.push({ _type: 'header', _key: `h-${region}`, region });
      lastRegion = region;
    }
    deliveredRows.push({ _type: 'item', _key: String(item.id), ...item });
  }

  // ── Render: pending route card ─────────────────────────────────────────────
  const renderPending = ({ item, index }) => {
    const isFarmer = item.recipient_type && item.recipient_type !== 'sp';
    const badge = tierBadge(item);
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SPDelivery', { allocation: item })}
      >
        <View style={s.routeNum}>
          <Text style={s.routeNumText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.cardHeader}>
            <Text style={s.spName} numberOfLines={1}>{recipientLabel(item)}</Text>
            <View style={[s.badge, item.status === 'en_route' ? s.badgeBlue : s.badgeGray]}>
              <Text style={s.badgeText}>{item.status === 'en_route' ? '🚚 En Route' : '⏳ Pending'}</Text>
            </View>
          </View>
          {badge && (
            <View style={[s.badge, s.badgePurple, { alignSelf: 'flex-start', marginBottom: 4 }]}>
              <Text style={s.badgeText}>{badge} Farmer</Text>
            </View>
          )}
          <Text style={s.meta}>📦 {item.docs_allocated} DoCs</Text>
          {isFarmer ? (
            <Text style={s.meta}>🌾 Direct farm delivery</Text>
          ) : (
            <Text style={s.meta}>📍 {item.location_name || '—'}</Text>
          )}
          {item.sp_region && !isFarmer && (
            <Text style={s.meta}>🗺 {item.sp_region}{item.sp_district ? ` · ${item.sp_district}` : ''}</Text>
          )}
          <Text style={s.barcode}>🔖 {item.allocation_barcode}</Text>
          <TouchableOpacity
            style={s.deliverBtn}
            onPress={() => navigation.navigate('SPDelivery', { allocation: item })}
          >
            <Text style={s.deliverBtnText}>Scan & Deliver →</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: delivered card or region header ────────────────────────────────
  const renderDelivered = ({ item }) => {
    if (item._type === 'header') return (
      <View style={s.regionHeader}>
        <Text style={s.regionHeaderText}>📍 {item.region}</Text>
      </View>
    );
    const signedAt = item.receipt_signed_at
      ? new Date(item.receipt_signed_at).toLocaleString()
      : item.updated_at ? new Date(item.updated_at).toLocaleString() : null;
    const badge = tierBadge(item);
    return (
      <View style={s.cardDone}>
        <View style={s.cardHeader}>
          <Text style={s.spName} numberOfLines={1}>{recipientLabel(item)}</Text>
          <View style={[s.badge, s.badgeGreen]}>
            <Text style={s.badgeText}>✓ Delivered</Text>
          </View>
        </View>
        {badge && (
          <View style={[s.badge, s.badgePurple, { alignSelf: 'flex-start', marginBottom: 4 }]}>
            <Text style={s.badgeText}>{badge} Farmer</Text>
          </View>
        )}
        <Text style={s.meta}>📦 {item.receipt_docs ?? item.docs_confirmed ?? item.docs_allocated} DoCs confirmed</Text>
        {(!item.recipient_type || item.recipient_type === 'sp') && (
          <Text style={s.meta}>📍 {item.location_name || '—'}</Text>
        )}
        {signedAt && <Text style={s.signedAt}>🕐 {signedAt}</Text>}
        <Text style={s.barcode}>🔖 {item.allocation_barcode}</Text>
      </View>
    );
  };

  const listData = tab === 0 ? pending : deliveredRows;
  const keyFn    = (item, idx) => item._key || `row-${idx}`;
  const renderFn = tab === 0 ? renderPending : renderDelivered;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Today's Route</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            style={[s.demoLocBtn, demoSent && s.demoLocBtnSent]}
            onPress={sendDemoLocation}
            disabled={demoSending}
          >
            <Text style={s.demoLocBtnText}>
              {demoSent ? '✓ Sent!' : demoSending ? '...' : '📍 Demo Location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setRefreshing(true); load(); }}>
            <Text style={s.syncBtn}>⟳ Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {[
          { label: 'Pending Deliveries', count: pending.length },
          { label: 'Delivered', count: delivered.length },
        ].map(({ label, count }, i) => (
          <TouchableOpacity key={label} style={[s.tab, tab === i && s.tabActive]} onPress={() => setTab(i)}>
            <Text style={[s.tabText, tab === i && s.tabTextActive]}>
              {label}
              {count > 0 && <Text style={[s.tabCount, tab === i && s.tabCountActive]}> {count}</Text>}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#006B3F" size="large" />
        : (
          <FlatList
            data={listData}
            keyExtractor={keyFn}
            renderItem={renderFn}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
            }
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={s.emptyIcon}>{tab === 0 ? '🎉' : '📦'}</Text>
                <Text style={s.emptyText}>
                  {tab === 0 ? 'No pending deliveries.\nAll done for today!' : 'No completed deliveries yet.'}
                </Text>
              </View>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f8fafb' },
  header:           { backgroundColor: '#006B3F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle:      { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  syncBtn:          { color: '#FCD116', fontSize: 15, fontWeight: '600' },
  demoLocBtn:       { backgroundColor: 'rgba(252,209,22,0.18)', borderWidth: 1, borderColor: '#FCD116', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  demoLocBtnSent:   { backgroundColor: 'rgba(34,197,94,0.2)', borderColor: '#4ade80' },
  demoLocBtnText:   { color: '#FCD116', fontSize: 11, fontWeight: '700' },

  tabs:             { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  tab:              { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive:        { borderBottomWidth: 2.5, borderColor: '#006B3F' },
  tabText:          { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  tabTextActive:    { color: '#006B3F', fontWeight: '700' },
  tabCount:         { color: '#9ca3af' },
  tabCountActive:   { color: '#006B3F' },

  // Pending card — row layout with route number bubble
  card:             { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  routeNum:         { width: 34, height: 34, borderRadius: 17, backgroundColor: '#006B3F', justifyContent: 'center', alignItems: 'center', marginTop: 2, flexShrink: 0 },
  routeNumText:     { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  // Delivered card — no route number
  cardDone:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },

  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  spName:           { fontSize: 15, fontWeight: 'bold', color: '#111', flex: 1 },
  meta:             { fontSize: 13, color: '#555', marginBottom: 3 },
  barcode:          { fontSize: 11, color: '#bbb', fontFamily: 'monospace', marginTop: 4 },
  signedAt:         { fontSize: 11, color: '#6b7280', marginTop: 3 },

  badge:            { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  badgeGray:        { backgroundColor: '#f3f4f6' },
  badgeBlue:        { backgroundColor: '#dbeafe' },
  badgeGreen:       { backgroundColor: '#dcfce7' },
  badgePurple:      { backgroundColor: '#f3e8ff' },
  badgeText:        { fontSize: 11, fontWeight: '600', color: '#374151' },

  deliverBtn:       { backgroundColor: '#006B3F', borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  deliverBtnText:   { color: '#fff', fontWeight: '600', fontSize: 13 },

  regionHeader:     { paddingHorizontal: 4, paddingTop: 14, paddingBottom: 4 },
  regionHeaderText: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },

  emptyWrap:        { alignItems: 'center', marginTop: 70 },
  emptyIcon:        { fontSize: 52, marginBottom: 14 },
  emptyText:        { textAlign: 'center', color: '#9ca3af', fontSize: 15, lineHeight: 22 },
});
