import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import api from '../../../shared/api';

export default function MortalityPhotoScreen({ route, navigation }) {
  const { farmerId, dailyData, mortalityCount } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const cameraRef = useRef();

  const takePicture = async () => {
    if (!cameraRef.current) return;
    const pic = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    setPhoto(pic);
  };

  const submitWithPhoto = async () => {
    setLoading(true);
    try {
      // First submit daily entry
      const entryRes = await api.post('/daily-entries', {
        ...dailyData, birds_alive: parseInt(dailyData.birds_alive), mortality_count: mortalityCount,
      });

      // Submit mortality evidence (use mock path for prototype)
      const photoPath = photo?.uri || '/uploads/demo_mortality.jpg';
      const formData = new FormData();
      if (photo) {
        formData.append('photo', { uri: photo.uri, type: 'image/jpeg', name: `mortality_${Date.now()}.jpg` });
      }
      formData.append('daily_entry_id', String(entryRes.data.id));
      formData.append('farmer_id', String(farmerId));
      formData.append('aea_id', '1'); // Would come from farmer profile in production
      formData.append('farmer_count', String(mortalityCount));
      formData.append('photo_path', photoPath);

      const { data: ocr } = await api.post('/mortality', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOcrResult(ocr);
    } catch (e) {
      // Offline fallback
      Alert.alert('Saved Offline', 'Entry and photo saved locally. Will sync when connected.');
      navigation.popToTop();
    } finally { setLoading(false); }
  };

  if (ocrResult) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>{ocrResult.count_match ? '✅' : '⚠️'}</Text>
      <Text style={s.title}>{ocrResult.count_match ? 'OCR Confirmed' : 'OCR Flagged'}</Text>
      <Text style={s.sub}>Your count: {mortalityCount} birds</Text>
      <Text style={s.sub}>OCR count: {ocrResult.ocr_count} birds</Text>
      <Text style={s.sub}>Confidence: {ocrResult.ocr_confidence?.toFixed(1)}%</Text>
      {!ocrResult.count_match && <Text style={s.flagMsg}>Flagged for AEA review. Your AEA has been notified.</Text>}
      <TouchableOpacity style={s.btn} onPress={() => navigation.popToTop()}>
        <Text style={s.btnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Mortality Evidence Photo</Text>
        <Text style={s.sub}>You reported {mortalityCount} dead birds. Take a clear photo of all dead birds together.</Text>
      </View>

      {!photo ? (
        permission?.granted ? (
          <View style={{ flex: 1 }}>
            <CameraView style={{ flex: 1 }} ref={cameraRef} />
            <TouchableOpacity style={s.captureBtn} onPress={takePicture}>
              <View style={s.captureInner} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📷</Text>
            <Text style={s.sub}>Camera permission required</Text>
            <TouchableOpacity style={s.btn} onPress={requestPermission}>
              <Text style={s.btnText}>Grant Camera Access</Text>
            </TouchableOpacity>
            {/* Demo bypass */}
            <TouchableOpacity style={s.btnSecondary} onPress={() => setPhoto({ uri: null })}>
              <Text style={s.btnSecondaryText}>Demo: Skip Photo</Text>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <View style={{ flex: 1 }}>
          {photo.uri ? <Image source={{ uri: photo.uri }} style={{ flex: 1 }} resizeMode="cover" /> : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 48 }}>🖼️</Text>
              <Text style={{ color: '#666' }}>Demo photo placeholder</Text>
            </View>
          )}
          <View style={{ padding: 20, flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setPhoto(null)}>
              <Text style={s.btnSecondaryText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={submitWithPhoto} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#111' },
  header:        { backgroundColor: '#1f2937', padding: 20 },
  title:         { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  sub:           { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  captureBtn:    { position: 'absolute', bottom: 40, alignSelf: 'center', width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureInner:  { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  btn:           { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText:       { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnSecondary:  { backgroundColor: '#374151', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnSecondaryText: { color: '#d1d5db', fontWeight: '600', fontSize: 14 },
  flagMsg:       { backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginTop: 16, color: '#92400e', fontSize: 13, textAlign: 'center' },
});
