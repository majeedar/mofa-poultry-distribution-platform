import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import SignatureCanvas from 'react-native-signature-canvas';
import { checkGeofence, GPS_ACCURACY_THRESHOLD } from '../../../shared/geofence';
import api from '../../../shared/api';

export default function FarmerDistributionScreen({ route }) {
  const { allocationId, spId } = route.params || { allocationId: 1, spId: 1 };
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [scanning, setScanning]     = useState(false);
  const [scanned, setScanned]       = useState(false);
  const [activeDelivery, setActive] = useState(null);
  const [modalStep, setModalStep]   = useState('geo'); // 'geo' | 'confirm' | 'sign'
  const [docsDelivered, setDocs]    = useState('');
  const [deadOnReceipt, setDeadOnReceipt] = useState('0');
  const [signature, setSignature]   = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const sigRef    = useRef();
  const geoSubRef = useRef(null);

  // Code entry
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeEntry, setCodeEntry]         = useState('');
  const [codeLoading, setCodeLoading]     = useState(false);

  // SP data for pickup geofencing
  const [spData, setSpData] = useState(null);

  // Geofence state
  const [geoState, setGeoState]       = useState('idle'); // idle | acquiring | passed | failed | no_gps | no_coords
  const [geoDistance, setGeoDistance] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get('/deliveries', { params: { allocation_id: allocationId } });
      setDeliveries(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/service-providers/mine').then(r => setSpData(r.data)).catch(() => {});
  }, []);

  const runGeofenceCheck = async (item) => {
    const isPickup = !item.collection_method || item.collection_method === 'pickup';
    const targetLat = isPickup ? parseFloat(spData?.gps_lat) : parseFloat(item.farm_gps_lat);
    const targetLng = isPickup ? parseFloat(spData?.gps_lng) : parseFloat(item.farm_gps_lng);
    const hasGps = !isNaN(targetLat) && !isNaN(targetLng);

    if (!hasGps) { setGeoState('no_coords'); return; }

    setGeoState('acquiring');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGeoState('no_gps'); return; }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          setGpsAccuracy(accuracy);
          if (accuracy <= GPS_ACCURACY_THRESHOLD) {
            sub.remove();
            geoSubRef.current = null;
            const result = checkGeofence(latitude, longitude, targetLat, targetLng);
            setGeoDistance(result.distance_m);
            setGeoState(result.passed ? 'passed' : 'failed');
          }
        }
      );
      geoSubRef.current = sub;
      setTimeout(() => {
        if (geoSubRef.current) { geoSubRef.current.remove(); geoSubRef.current = null; }
        setGeoState(prev => prev === 'acquiring' ? 'no_gps' : prev);
      }, 30000);
    } catch { setGeoState('no_gps'); }
  };

  const openDelivery = (item) => {
    if (geoSubRef.current) { geoSubRef.current.remove(); geoSubRef.current = null; }
    setActive(item);
    setDocs(String(item.docs_allocated));
    setDeadOnReceipt('0');
    setSignature('');
    setGeoState('acquiring');
    setGeoDistance(null);
    setGpsAccuracy(null);
    setModalStep('geo');
    runGeofenceCheck(item);
  };

  const closeModal = () => {
    if (geoSubRef.current) { geoSubRef.current.remove(); geoSubRef.current = null; }
    setActive(null);
    setModalStep('geo');
  };

  const handleScan = ({ data: barcodeData }) => {
    setScanned(true); setScanning(false);
    const match = deliveries.find(d => d.delivery_barcode === barcodeData);
    if (match) {
      openDelivery(match);
    } else {
      Alert.alert('Barcode not found', 'This barcode does not match any pending deliveries.', [{ text: 'Try Again', onPress: () => { setScanned(false); setScanning(true); } }]);
    }
  };

  const lookupByCode = async () => {
    if (codeEntry.length < 6) return;
    setCodeLoading(true);
    try {
      const { data } = await api.get(`/deliveries/code/${codeEntry.trim()}`);
      // Must belong to this allocation
      const match = deliveries.find(d => d.id === data.id);
      if (!match) {
        Alert.alert('Wrong Allocation', 'This code belongs to a different allocation. Check you have the right farmer.');
        return;
      }
      setShowCodeInput(false);
      setCodeEntry('');
      openDelivery(match);
    } catch (e) {
      Alert.alert('Invalid Code', e.response?.data?.error || 'Code not found. Please check and try again.');
    } finally { setCodeLoading(false); }
  };

  const confirmDelivery = async () => {
    if (!signature && !__DEV__) { Alert.alert('Signature required'); return; }
    try {
      await api.put(`/deliveries/${activeDelivery.id}/confirm`, {
        docs_delivered:   parseInt(docsDelivered),
        farmer_signature: signature || 'DEMO_SIG',
        dead_on_receipt:  parseInt(deadOnReceipt) || 0,
      });
      Alert.alert('✓ Confirmed', `${docsDelivered} DoCs delivered to ${activeDelivery.farmer_name}`);
      closeModal();
      load();
    } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); }
  };

  const isPickupDelivery = activeDelivery && (!activeDelivery.collection_method || activeDelivery.collection_method === 'pickup');
  const geoLabel = isPickupDelivery ? 'Service Provider' : 'Farmer Farm';

  const pending   = deliveries.filter(d => d.status === 'pending');
  const delivered = deliveries.filter(d => d.status !== 'pending');

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Farmer Distribution</Text>
        <Text style={s.sub}>{pending.length} pending · {delivered.length} delivered</Text>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 10 }}>
        <TouchableOpacity style={[s.scanBtn, { flex: 1, margin: 0 }]} onPress={async () => { if (!permission?.granted) await requestPermission(); setScanned(false); setScanning(true); }}>
          <Text style={s.scanBtnText}>📷 Scan Barcode</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.demoScanBtn, { flex: 1 }]} onPress={() => {
          const first = deliveries.find(d => d.status === 'pending');
          if (first) { openDelivery(first); }
          else Alert.alert('All Delivered', 'No pending farmer deliveries remain.');
        }}>
          <Text style={s.demoScanBtnText}>Demo: Select First</Text>
        </TouchableOpacity>
      </View>

      {/* Code entry toggle */}
      <TouchableOpacity
        style={[s.codeToggleBtn, showCodeInput && s.codeToggleBtnActive]}
        onPress={() => { setShowCodeInput(v => !v); setCodeEntry(''); }}
      >
        <Text style={[s.codeToggleBtnText, showCodeInput && { color: '#006B3F' }]}>
          🔑 Enter Farmer Collection Code
        </Text>
      </TouchableOpacity>

      {showCodeInput && (
        <View style={s.codePanel}>
          <Text style={s.codePanelLabel}>Collection Code (6 characters)</Text>
          <TextInput
            style={s.codeInput}
            value={codeEntry}
            onChangeText={v => setCodeEntry(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABC123"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[s.btn, { marginTop: 12 }, (codeLoading || codeEntry.length < 6) && { opacity: 0.5 }]}
            onPress={lookupByCode}
            disabled={codeLoading || codeEntry.length < 6}
          >
            <Text style={s.btnText}>{codeLoading ? 'Verifying...' : 'Verify Code & Proceed →'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList data={deliveries} keyExtractor={d => String(d.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => openDelivery(item)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.farmerName}>{item.farmer_name}</Text>
              <Text style={[s.status, item.status === 'delivered' ? { color: '#16a34a' } : { color: '#d97706' }]}>{item.status}</Text>
            </View>
            <Text style={s.sub2}>{item.docs_allocated} DoCs · {item.collection_method}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16 }}
      />

      {/* Camera modal */}
      <Modal visible={scanning} onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} onBarcodeScanned={scanned ? undefined : handleScan} barcodeScannerSettings={{ barcodeTypes: ['qr','code128'] }} />
          <TouchableOpacity style={s.closeBtn} onPress={() => setScanning(false)}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✕ Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Confirm delivery modal */}
      <Modal visible={!!activeDelivery} onRequestClose={closeModal}>
        <ScrollView style={{ flex: 1, backgroundColor: '#f8fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{activeDelivery?.farmer_name}</Text>
            <Text style={s.modalSub}>Allocated: {activeDelivery?.docs_allocated} DoCs · {activeDelivery?.collection_method}</Text>
          </View>
          <View style={{ padding: 20 }}>

            {/* ── Geo step ────────────────────────────────────────────── */}
            {modalStep === 'geo' && (
              <>
                {geoState === 'acquiring' && (
                  <View style={s.geoCard}>
                    <ActivityIndicator color="#006B3F" size="large" />
                    <Text style={s.geoTitle}>Verifying Location...</Text>
                    <Text style={s.geoSub}>{gpsAccuracy ? `GPS accuracy: ±${gpsAccuracy.toFixed(0)}m` : 'Waiting for GPS signal...'}</Text>
                    <TouchableOpacity style={s.demoBtn} onPress={() => { setGeoState('passed'); setGeoDistance(12.5); }}>
                      <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {geoState === 'failed' && (
                  <View style={[s.geoCard, { borderColor: '#dc2626', borderWidth: 2 }]}>
                    <Text style={{ fontSize: 40 }}>🚫</Text>
                    <Text style={[s.geoTitle, { color: '#dc2626' }]}>Too Far from {geoLabel}</Text>
                    <Text style={s.geoSub}>You are {geoDistance?.toFixed(0)}m away. Move within 50m to proceed.</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => runGeofenceCheck(activeDelivery)}>
                      <Text style={s.retryBtnText}>Check Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.demoBtn} onPress={() => { setGeoState('passed'); setGeoDistance(12.5); }}>
                      <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {geoState === 'no_gps' && (
                  <View style={[s.geoCard, { borderColor: '#d97706', borderWidth: 2 }]}>
                    <Text style={{ fontSize: 40 }}>📡</Text>
                    <Text style={[s.geoTitle, { color: '#d97706' }]}>GPS Signal Required</Text>
                    <Text style={s.geoSub}>GPS unavailable. Move outdoors or use demo bypass.</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => runGeofenceCheck(activeDelivery)}>
                      <Text style={s.retryBtnText}>Retry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.demoBtn} onPress={() => { setGeoState('passed'); setGeoDistance(12.5); }}>
                      <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {(geoState === 'passed' || geoState === 'no_coords') && (
                  <View style={[s.geoCard, { borderColor: geoState === 'passed' ? '#16a34a' : '#9ca3af', borderWidth: 2 }]}>
                    {geoState === 'passed' ? (
                      <>
                        <Text style={{ fontSize: 40 }}>✅</Text>
                        <Text style={[s.geoTitle, { color: '#16a34a' }]}>Location Verified</Text>
                        <Text style={s.geoSub}>Within {geoDistance}m of {geoLabel}.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 40 }}>📍</Text>
                        <Text style={[s.geoTitle, { color: '#6b7280' }]}>No GPS Coordinates</Text>
                        <Text style={s.geoSub}>No GPS registered for this {isPickupDelivery ? 'service point' : 'farm'}.</Text>
                      </>
                    )}
                    <TouchableOpacity style={[s.btn, { marginTop: 12, width: '100%' }]} onPress={() => setModalStep('confirm')}>
                      <Text style={s.btnText}>Proceed to Confirm →</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 8 }]} onPress={closeModal}>
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Confirm step ────────────────────────────────────────── */}
            {modalStep === 'confirm' && (
              <>
                <Text style={s.label}>DoCs Actually Handed Over</Text>
                <TextInput style={s.input} value={docsDelivered} onChangeText={setDocs} keyboardType="numeric" />
                <Text style={s.label}>Dead on Receipt</Text>
                <TextInput style={s.input} value={deadOnReceipt} onChangeText={setDeadOnReceipt} keyboardType="numeric" placeholder="0" />
                <TouchableOpacity style={[s.btn, { marginTop: 16 }]} onPress={() => setModalStep('sign')}>
                  <Text style={s.btnText}>Next: Get Farmer Signature →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 8 }]} onPress={closeModal}>
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Sign step ───────────────────────────────────────────── */}
            {modalStep === 'sign' && (
              <>
                <Text style={s.label}>Farmer Signature</Text>
                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>Hand the phone to the farmer to sign below</Text>
                <View style={{ height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <SignatureCanvas ref={sigRef} onOK={sig => setSignature(sig)} descriptionText="Farmer signs here" clearText="Clear" confirmText="Confirm"
                    webStyle=".m-signature-pad--footer { display: none; }" />
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                  <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => sigRef.current?.readSignature()}>
                    <Text style={s.btnText}>Use Signature</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setSignature('DEMO_FARMER_SIG')}>
                    <Text style={s.btnSecondaryText}>Demo Sig</Text>
                  </TouchableOpacity>
                </View>
                {signature ? (
                  <TouchableOpacity style={[s.btn, { backgroundColor: '#16a34a', marginTop: 8 }]} onPress={confirmDelivery}>
                    <Text style={s.btnText}>✓ Confirm Delivery</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[s.btnSecondary, { marginTop: 8 }]} onPress={() => setModalStep('confirm')}>
                  <Text style={s.btnSecondaryText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafb' },
  header:        { backgroundColor: '#006B3F', padding: 20 },
  title:         { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:           { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  scanBtn:       { backgroundColor: '#FCD116', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  scanBtnText:   { color: '#1a1a1a', fontWeight: 'bold', fontSize: 14 },
  demoScanBtn:   { backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  demoScanBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  card:          { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  farmerName:    { fontSize: 15, fontWeight: 'bold', color: '#111' },
  status:        { fontSize: 12, fontWeight: '600' },
  sub2:          { fontSize: 13, color: '#666', marginTop: 4 },
  closeBtn:      { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8 },
  modalHeader:   { backgroundColor: '#006B3F', padding: 20 },
  modalTitle:    { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalSub:      { color: '#a7f3d0', fontSize: 13, marginTop: 4 },
  label:         { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input:         { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15 },
  btn:           { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText:       { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnSecondary:  { backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  // Code entry
  codeToggleBtn:       { marginHorizontal: 16, marginTop: 8, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  codeToggleBtnActive: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  codeToggleBtnText:   { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  codePanel:           { marginHorizontal: 16, marginTop: 4, backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  codePanelLabel:      { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  codeInput:           { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 28, fontWeight: 'bold', color: '#111', textAlign: 'center', letterSpacing: 10, fontFamily: 'monospace' },
  // Geofence card
  geoCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', gap: 8, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  geoTitle:      { fontSize: 16, fontWeight: 'bold', color: '#111', textAlign: 'center' },
  geoSub:        { fontSize: 12, color: '#666', textAlign: 'center' },
  retryBtn:      { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  retryBtnText:  { color: '#374151', fontWeight: '600', fontSize: 13 },
  demoBtn:       { backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  demoBtnText:   { color: '#92400e', fontSize: 12 },
});
