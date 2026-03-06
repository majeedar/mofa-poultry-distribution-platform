import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import SignatureCanvas from 'react-native-signature-canvas';
import { checkGeofence, GPS_ACCURACY_THRESHOLD } from '../../../shared/geofence';
import api from '../../../shared/api';

export default function SPDeliveryScreen({ route, navigation }) {
  const { allocation } = route.params;

  // Detect recipient type
  const isFarmer = allocation.recipient_type && allocation.recipient_type !== 'sp';
  const tierLabel = allocation.recipient_type === 'anchor' ? '🌟 Anchor Farmer' : allocation.recipient_type === 'small_medium' ? '👩‍🌾 STM Farmer' : null;

  // Recipient info for display
  const recipientName    = isFarmer ? (allocation.farmer_name || 'Farmer') : (allocation.sp_name || 'SP');
  const recipientBarcode = isFarmer ? allocation.farmer_delivery_barcode : allocation.sp_barcode;
  const recipientScanId  = isFarmer ? allocation.farmer_delivery_barcode : null; // what to match on scan

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]         = useState(false);
  const [scanned, setScanned]           = useState(false);
  const [docsConfirmed, setDocsConfirmed] = useState(String(allocation.docs_allocated));
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [deadOnArrival, setDeadOnArrival] = useState('0');
  const [signature, setSignature]       = useState('');
  const [step, setStep]                 = useState(allocation.status === 'delivered' ? 'done' : 'scan');
  const [loading, setLoading]           = useState(false);
  const sigRef = useRef();

  // Geofence — use farmer GPS for anchor/STM, SP GPS for service points
  const targetLat = isFarmer
    ? parseFloat(allocation.farmer_gps_lat)
    : parseFloat(allocation.sp_gps_lat);
  const targetLng = isFarmer
    ? parseFloat(allocation.farmer_gps_lng)
    : parseFloat(allocation.sp_gps_lng);
  const hasTargetGps = !isNaN(targetLat) && !isNaN(targetLng);

  const [geoState, setGeoState]     = useState(hasTargetGps ? 'acquiring' : 'no_coords');
  const [geoDistance, setGeoDistance] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [distPos, setDistPos]       = useState(null);

  // Farmer code entry (isFarmer only)
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [farmerCode, setFarmerCode]       = useState('');
  const [codeValidating, setCodeValidating] = useState(false);

  useEffect(() => {
    if (hasTargetGps) runGeofenceCheck();
  }, []);

  const runGeofenceCheck = async () => {
    setGeoState('acquiring');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGeoState('no_gps'); return; }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          setGpsAccuracy(accuracy);
          setDistPos({ lat: latitude, lng: longitude });
          if (accuracy <= GPS_ACCURACY_THRESHOLD) {
            sub.remove();
            const result = checkGeofence(latitude, longitude, targetLat, targetLng);
            setGeoDistance(result.distance_m);
            setGeoState(result.passed ? 'passed' : 'failed');
          }
        }
      );
      setTimeout(() => {
        sub.remove();
        if (geoState === 'acquiring') setGeoState('no_gps');
      }, 30000);
    } catch { setGeoState('no_gps'); }
  };

  const bypassGeofence = () => {
    setGeoState('passed');
    setGeoDistance(12.5);
    setDistPos({ lat: targetLat || 0, lng: targetLng || 0 });
    // Send arrival coordinates to server so the live map updates
    if (hasTargetGps) {
      api.post('/locations', {
        lat: targetLat, lng: targetLng,
        heading: 0, speed_kmh: 0, status: 'en_route',
      }).catch(() => {});
    }
  };

  const handleCodeEntry = async () => {
    if (farmerCode.length < 6) return;
    setCodeValidating(true);
    try {
      const { data } = await api.get(`/deliveries/code/${farmerCode.trim()}`);
      // Verify this code corresponds to the expected farmer barcode
      if (data.delivery_barcode !== allocation.farmer_delivery_barcode) {
        Alert.alert('Wrong Code', 'This code belongs to a different delivery. Please check and try again.');
        return;
      }
      await api.put(`/allocations/${allocation.id}/scan`).catch(() => {});
      setStep('confirm');
    } catch (e) {
      Alert.alert('Invalid Code', e.response?.data?.error || 'Code not found. Please check and try again.');
    } finally { setCodeValidating(false); }
  };

  const handleBarcodeScan = async ({ data }) => {
    setScanned(true); setScanning(false);
    // For SP: match allocation_barcode or sp_barcode
    // For farmer: match farmer_delivery_barcode
    const expectedBarcode = isFarmer ? allocation.farmer_delivery_barcode : allocation.allocation_barcode;
    const altBarcode      = isFarmer ? null : allocation.sp_barcode;

    if (data === expectedBarcode || (altBarcode && data === altBarcode)) {
      Alert.alert(
        '✓ Barcode Matched',
        `${isFarmer ? 'Farmer' : 'SP'} confirmed: ${recipientName}\nDocs expected: ${allocation.docs_allocated}`,
        [{ text: 'Proceed to Confirm', onPress: () => setStep('confirm') }]
      );
      await api.put(`/allocations/${allocation.id}/scan`).catch(() => {});
    } else {
      Alert.alert('Wrong Barcode', `Expected: ${expectedBarcode}\nScanned: ${data}`, [
        { text: 'Try Again', onPress: () => { setScanned(false); setScanning(true); } }
      ]);
    }
  };

  const handleConfirm = async () => {
    if (!signature) {
      Alert.alert('Signature Required', `${isFarmer ? 'Farmer' : 'SP'} must sign before confirming delivery`);
      return;
    }
    setLoading(true);
    try {
      // Both SP and farmer deliveries use the same confirm endpoint.
      // For farmer allocations the server creates farmer_receipts instead of sp_receipts.
      await api.put(`/allocations/${allocation.id}/confirm`, {
        docs_confirmed: parseInt(docsConfirmed),
        sp_signature: signature,
        discrepancy_notes: discrepancyNotes,
        dead_on_arrival: parseInt(deadOnArrival),
      });
      setStep('done');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to confirm delivery');
    } finally { setLoading(false); }
  };

  if (step === 'done') return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 64, marginBottom: 16 }}>✅</Text>
      <Text style={s.doneTitle}>Delivery Confirmed</Text>
      <Text style={s.doneSub}>{recipientName}</Text>
      {tierLabel && <Text style={[s.doneSub, { color: '#7c3aed' }]}>{tierLabel}</Text>}
      <Text style={s.doneSub}>{docsConfirmed} DoCs received · Signed</Text>
      <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
        <Text style={s.btnText}>Back to Route</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={s.container}>
      <View style={s.topCard}>
        <Text style={s.spName}>{recipientName}</Text>
        {tierLabel && <Text style={s.tierBadge}>{tierLabel}</Text>}
        <Text style={s.barcode}>{allocation.allocation_barcode}</Text>
        <Text style={s.docs}>Expected: {allocation.docs_allocated} DoCs</Text>
      </View>

      {step === 'scan' && (
        <View style={s.section}>
          {/* Geofence card */}
          {hasTargetGps && geoState === 'acquiring' && (
            <View style={s.geoCard}>
              <ActivityIndicator color="#006B3F" size="large" />
              <Text style={s.geoTitle}>Verifying Location...</Text>
              <Text style={s.geoSub}>{gpsAccuracy ? `GPS accuracy: ±${gpsAccuracy.toFixed(0)}m` : 'Waiting for GPS signal...'}</Text>
              <TouchableOpacity style={s.demoBtn} onPress={bypassGeofence}>
                <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
              </TouchableOpacity>
            </View>
          )}
          {hasTargetGps && geoState === 'failed' && (
            <View style={[s.geoCard, { borderColor: '#dc2626', borderWidth: 2 }]}>
              <Text style={{ fontSize: 40 }}>🚫</Text>
              <Text style={[s.geoTitle, { color: '#dc2626' }]}>Too Far from {isFarmer ? 'Farm' : 'SP'} Location</Text>
              <Text style={s.geoSub}>You are {geoDistance?.toFixed(0)}m away. Move within 50m of {recipientName} to proceed.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={runGeofenceCheck}>
                <Text style={s.retryBtnText}>Check Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.demoBtn} onPress={bypassGeofence}>
                <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
              </TouchableOpacity>
            </View>
          )}
          {hasTargetGps && geoState === 'no_gps' && (
            <View style={[s.geoCard, { borderColor: '#d97706', borderWidth: 2 }]}>
              <Text style={{ fontSize: 40 }}>📡</Text>
              <Text style={[s.geoTitle, { color: '#d97706' }]}>GPS Signal Required</Text>
              <Text style={s.geoSub}>GPS unavailable. Move outdoors or use demo bypass.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={runGeofenceCheck}>
                <Text style={s.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.demoBtn} onPress={bypassGeofence}>
                <Text style={s.demoBtnText}>Demo: Bypass Geofence</Text>
              </TouchableOpacity>
            </View>
          )}
          {hasTargetGps && geoState === 'passed' && (
            <View style={[s.geoCard, { borderColor: '#16a34a', borderWidth: 2 }]}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={[s.geoTitle, { color: '#16a34a' }]}>Location Verified</Text>
              <Text style={s.geoSub}>You are {geoDistance}m from {recipientName}.</Text>
            </View>
          )}

          {/* Scan section — unlocked once geofence passed (or no GPS coords) */}
          {(geoState === 'passed' || geoState === 'no_coords') && (
            <>
              <Text style={s.sectionTitle}>Step 1: Scan {isFarmer ? 'Farmer' : 'SP'} Barcode</Text>
              <Text style={s.hint}>
                {isFarmer
                  ? 'Ask the farmer to open their PIRCMES app and show their delivery barcode. Scan it to confirm you are at the right farm.'
                  : 'Ask the SP operator to show their tablet barcode. Scan it to confirm you are at the right location.'}
              </Text>
              {scanning && permission?.granted ? (
                <View style={s.camera}>
                  <CameraView style={{ flex: 1 }} onBarcodeScanned={scanned ? undefined : handleBarcodeScan} barcodeScannerSettings={{ barcodeTypes: ['qr','code128','code39'] }} />
                </View>
              ) : (
                <TouchableOpacity style={s.btn} onPress={async () => {
                  if (!permission?.granted) await requestPermission();
                  setScanned(false); setScanning(true);
                }}>
                  <Text style={s.btnText}>📷 Scan Barcode</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.btnSecondary} onPress={() => { setStep('confirm'); api.put(`/allocations/${allocation.id}/scan`).catch(() => {}); }}>
                <Text style={s.btnSecondaryText}>Demo: Skip Scan →</Text>
              </TouchableOpacity>

              {/* Code entry option for farmer deliveries */}
              {isFarmer && (
                <>
                  <TouchableOpacity
                    style={[s.btnSecondary, showCodeEntry && { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' }]}
                    onPress={() => { setShowCodeEntry(v => !v); setFarmerCode(''); }}
                  >
                    <Text style={[s.btnSecondaryText, showCodeEntry && { color: '#15803d' }]}>
                      {showCodeEntry ? 'Cancel Code Entry' : '🔑 Enter Farmer Code Instead'}
                    </Text>
                  </TouchableOpacity>
                  {showCodeEntry && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={s.label}>Farmer Collection Code</Text>
                      <TextInput
                        style={[s.input, { fontSize: 28, textAlign: 'center', letterSpacing: 10, fontFamily: 'monospace', fontWeight: 'bold' }]}
                        value={farmerCode}
                        onChangeText={v => setFarmerCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="ABC123"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="characters"
                        maxLength={6}
                        autoFocus
                      />
                      <TouchableOpacity
                        style={[s.btn, (codeValidating || farmerCode.length < 6) && { opacity: 0.5 }]}
                        onPress={handleCodeEntry}
                        disabled={codeValidating || farmerCode.length < 6}
                      >
                        <Text style={s.btnText}>{codeValidating ? 'Validating...' : 'Validate Code & Proceed →'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
      )}

      {step === 'confirm' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Step 2: Confirm Quantities</Text>
          <Text style={s.label}>DoCs Actually Received</Text>
          <TextInput style={s.input} value={docsConfirmed} onChangeText={setDocsConfirmed} keyboardType="numeric" />
          <Text style={s.label}>Dead on Arrival</Text>
          <TextInput style={s.input} value={deadOnArrival} onChangeText={setDeadOnArrival} keyboardType="numeric" />
          {parseInt(docsConfirmed) !== allocation.docs_allocated && (
            <>
              <Text style={s.label}>Discrepancy Notes *</Text>
              <TextInput style={[s.input, { height: 80 }]} value={discrepancyNotes} onChangeText={setDiscrepancyNotes} multiline placeholder="Explain the difference..." />
            </>
          )}
          <TouchableOpacity style={s.btn} onPress={() => setStep('sign')}>
            <Text style={s.btnText}>Next: Get {isFarmer ? 'Farmer' : 'SP'} Signature →</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'sign' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Step 3: {isFarmer ? 'Farmer' : 'SP'} Signature</Text>
          <Text style={s.hint}>Hand the phone to {isFarmer ? 'the farmer' : 'the SP operator'} to sign below</Text>
          <View style={s.sigBox}>
            <SignatureCanvas ref={sigRef} onOK={sig => setSignature(sig)} onEmpty={() => setSignature('')}
              descriptionText={isFarmer ? 'Farmer Signature' : 'SP Operator Signature'} clearText="Clear" confirmText="Confirm"
              webStyle=".m-signature-pad--footer { display: none; }" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => sigRef.current?.readSignature()}>
              <Text style={s.btnText}>Use Signature</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => { setSignature('DEMO_SIG_BASE64'); setStep('sign'); }}>
              <Text style={s.btnSecondaryText}>Demo Sig</Text>
            </TouchableOpacity>
          </View>
          {signature ? (
            <TouchableOpacity style={[s.btn, { backgroundColor: '#16a34a', marginTop: 8 }]} onPress={handleConfirm} disabled={loading}>
              <Text style={s.btnText}>{loading ? 'Confirming...' : '✓ Confirm Delivery'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f8fafb' },
  topCard:          { backgroundColor: '#006B3F', padding: 20 },
  spName:           { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  tierBadge:        { color: '#bbf7d0', fontSize: 12, fontWeight: '600', marginTop: 3 },
  barcode:          { color: '#a7f3d0', fontSize: 12, fontFamily: 'monospace', marginTop: 4 },
  docs:             { color: '#6ee7b7', fontSize: 14, marginTop: 4 },
  section:          { padding: 20 },
  sectionTitle:     { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  hint:             { color: '#666', fontSize: 13, marginBottom: 16 },
  label:            { color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input:            { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15 },
  camera:           { height: 240, borderRadius: 12, overflow: 'hidden', marginVertical: 12 },
  sigBox:           { height: 200, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden' },
  btn:              { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText:          { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnSecondary:     { backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnSecondaryText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  doneTitle:        { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  doneSub:          { fontSize: 14, color: '#666', marginBottom: 4 },
  geoCard:          { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', gap: 8, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  geoTitle:         { fontSize: 16, fontWeight: 'bold', color: '#111', textAlign: 'center' },
  geoSub:           { fontSize: 12, color: '#666', textAlign: 'center' },
  retryBtn:         { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  retryBtnText:     { color: '#374151', fontWeight: '600', fontSize: 13 },
  demoBtn:          { backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  demoBtnText:      { color: '#92400e', fontSize: 12 },
});
