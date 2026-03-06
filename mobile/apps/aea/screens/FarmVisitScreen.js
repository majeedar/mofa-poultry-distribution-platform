import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { checkGeofence, GPS_ACCURACY_THRESHOLD } from '../../../shared/geofence';
import api from '../../../shared/api';

export default function FarmVisitScreen({ route, navigation }) {
  const { farmer } = route.params; // { id, full_name, farm_gps_lat, farm_gps_lng, aea_id }
  const farmLat = parseFloat(farmer.farm_gps_lat);
  const farmLng = parseFloat(farmer.farm_gps_lng);
  const hasFarmGps = !isNaN(farmLat) && !isNaN(farmLng);
  const [geoState, setGeoState]   = useState('checking'); // checking | acquiring | passed | failed | no_gps
  const [distance, setDistance]   = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [aeaPos, setAeaPos]       = useState(null);
  const [form, setForm]           = useState({ birds_alive_observed: '', health_assessment: '', recommendations: '' });
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    runGeofenceCheck();
  }, []);

  const runGeofenceCheck = async () => {
    setGeoState('acquiring');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGeoState('no_gps'); return; }

      // Watch position until accuracy < 20m
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          setGpsAccuracy(accuracy);
          setAeaPos({ lat: latitude, lng: longitude });
          if (accuracy <= GPS_ACCURACY_THRESHOLD) {
            sub.remove();
            const result = checkGeofence(latitude, longitude, farmLat, farmLng);
            setDistance(result.distance_m);
            setGeoState(result.passed ? 'passed' : 'failed');
          }
        }
      );
      // Timeout after 30s
      setTimeout(() => {
        sub.remove();
        if (geoState === 'acquiring') setGeoState('no_gps');
      }, 30000);
    } catch { setGeoState('no_gps'); }
  };

  const submitVisit = async () => {
    setLoading(true);
    try {
      await api.post('/visits', {
        aea_id: farmer.aea_id,
        farmer_id: farmer.id,
        visit_type: route.params.visitType || 'routine_weekly',
        trigger_event_id: route.params.triggerEventId || null,
        geofence_lat: aeaPos?.lat || farmLat,
        geofence_lng: aeaPos?.lng || farmLng,
        birds_alive_observed: parseInt(form.birds_alive_observed) || null,
        health_assessment: form.health_assessment,
        recommendations: form.recommendations,
        flag_resolved: !!route.params.triggerEventId,
      });
      Alert.alert('✓ Visit Submitted', 'Farm visit recorded with GPS coordinates', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  const renderGeoStatus = () => {
    if (geoState === 'acquiring') return (
      <View style={s.geoCard}>
        <ActivityIndicator color="#006B3F" size="large" />
        <Text style={s.geoTitle}>Acquiring GPS...</Text>
        <Text style={s.geoSub}>{gpsAccuracy ? `Accuracy: ±${gpsAccuracy.toFixed(0)}m` : 'Waiting for GPS signal...'}</Text>
      </View>
    );
    if (geoState === 'passed') return (
      <View style={[s.geoCard, { borderColor: '#16a34a', borderWidth: 2 }]}>
        <Text style={{ fontSize: 48 }}>✅</Text>
        <Text style={[s.geoTitle, { color: '#16a34a' }]}>Geofence Passed</Text>
        <Text style={s.geoSub}>You are {distance}m from the farm (within 50m). Form unlocked.</Text>
      </View>
    );
    if (geoState === 'failed') return (
      <View style={[s.geoCard, { borderColor: '#dc2626', borderWidth: 2 }]}>
        <Text style={{ fontSize: 48 }}>🚫</Text>
        <Text style={[s.geoTitle, { color: '#dc2626' }]}>Too Far from Farm</Text>
        <Text style={s.geoSub}>You are {distance?.toFixed(0)}m from the farm. Move within 50m to unlock the form.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={runGeofenceCheck}>
          <Text style={s.retryBtnText}>Check Again</Text>
        </TouchableOpacity>
        {/* Demo bypass for emulator/indoor testing */}
        <TouchableOpacity style={s.demoBtn} onPress={() => { setGeoState('passed'); setDistance(12.5); setAeaPos({ lat: farmLat, lng: farmLng }); }}>
          <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
        </TouchableOpacity>
      </View>
    );
    if (geoState === 'no_gps') return (
      <View style={[s.geoCard, { borderColor: '#d97706', borderWidth: 2 }]}>
        <Text style={{ fontSize: 48 }}>📡</Text>
        <Text style={[s.geoTitle, { color: '#d97706' }]}>GPS Signal Required</Text>
        <Text style={s.geoSub}>GPS is unavailable. Move outdoors and try again.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={runGeofenceCheck}>
          <Text style={s.retryBtnText}>Retry</Text>
        </TouchableOpacity>
        {/* Demo bypass for indoor testing */}
        <TouchableOpacity style={s.demoBtn} onPress={() => { setGeoState('passed'); setDistance(12.5); setAeaPos({ lat: farmLat, lng: farmLng }); }}>
          <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
        </TouchableOpacity>
      </View>
    );
    return null;
  };

  const formUnlocked = geoState === 'passed';

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>{farmer.full_name}</Text>
        <Text style={s.sub}>{farmer.farm_location}</Text>
        <Text style={s.sub}>Farm GPS: {hasFarmGps ? `${farmLat.toFixed(5)}, ${farmLng.toFixed(5)}` : 'No GPS recorded'}</Text>
      </View>

      {renderGeoStatus()}

      {formUnlocked && (
        <View style={s.form}>
          <Text style={s.formTitle}>Farm Visit Form</Text>

          <Label text="Birds Alive Observed" />
          <TextInput style={s.input} value={form.birds_alive_observed} onChangeText={v => setForm(f => ({ ...f, birds_alive_observed: v }))} keyboardType="numeric" placeholder="Count observed" />

          <Label text="Health Assessment" />
          <TextInput style={[s.input, { height: 100 }]} value={form.health_assessment} onChangeText={v => setForm(f => ({ ...f, health_assessment: v }))} multiline placeholder="General health status, any disease signs..." />

          <Label text="Recommendations" />
          <TextInput style={[s.input, { height: 80 }]} value={form.recommendations} onChangeText={v => setForm(f => ({ ...f, recommendations: v }))} multiline placeholder="Actions recommended to farmer..." />

          <TouchableOpacity style={s.btn} onPress={submitVisit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>✓ Submit Visit</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const Label = ({ text }) => <Text style={{ color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 16 }}>{text}</Text>;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafb' },
  header:    { backgroundColor: '#006B3F', padding: 20 },
  title:     { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:       { color: '#a7f3d0', fontSize: 12, marginTop: 3 },
  geoCard:   { margin: 16, backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  geoTitle:  { fontSize: 18, fontWeight: 'bold', color: '#111', textAlign: 'center' },
  geoSub:    { fontSize: 13, color: '#666', textAlign: 'center' },
  retryBtn:  { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  demoBtn:   { backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 6 },
  demoBtnText: { color: '#92400e', fontSize: 12 },
  form:      { padding: 20 },
  formTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  input:     { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15 },
  btn:       { backgroundColor: '#006B3F', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 32 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
