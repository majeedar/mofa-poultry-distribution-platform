import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, FlatList
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import api from '../../../shared/api';

export default function FarmerUploadScreen() {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState([]);
  const [columns, setColumns]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const REQUIRED_COLUMNS = [
    'ghana_card_number', 'full_name', 'phone', 'gender',
    'production_tier', 'farm_location', 'flock_capacity',
  ];

  const pickFile = async () => {
    setResult(null); setError(null); setPreview([]); setFile(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const picked = res.assets[0];
      setFile(picked);

      // Read and parse
      const base64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { setError('File is empty'); return; }

      const cols = Object.keys(rows[0]);
      const missing = REQUIRED_COLUMNS.filter(c => !cols.includes(c));
      if (missing.length) {
        setError(`Missing required columns: ${missing.join(', ')}`);
        return;
      }

      setColumns(cols);
      setPreview(rows.slice(0, 5));
    } catch (e) {
      setError('Failed to read file: ' + e.message);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await api.post('/registrations/upload', {
        file_uri:       file.uri,
        file_name:      file.name,
        requested_role: 'farmer',
      }, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: () => {
          const form = new FormData();
          form.append('file', { uri: file.uri, type: file.mimeType, name: file.name });
          form.append('requested_role', 'farmer');
          return form;
        },
      });
      setResult(res.data);
      setPreview([]);
      setFile(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed');
    } finally { setLoading(false); }
  };

  const downloadTemplate = async () => {
    try {
      const { data } = await api.get('/registrations/template/farmer', { responseType: 'blob' });
      Alert.alert('Template', 'Template download requires a file manager app in production. For demo, see REQUIRED_COLUMNS above.');
    } catch { Alert.alert('Error', 'Could not download template'); }
  };

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Upload Farmers</Text>
        <Text style={s.sub}>Bulk register farmers via Excel</Text>
      </View>

      {/* Required columns */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Required Columns</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {REQUIRED_COLUMNS.map(c => (
            <View key={c} style={s.colChip}>
              <Text style={{ fontSize: 11, color: '#1d4ed8', fontFamily: 'monospace' }}>{c}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={s.templateBtn} onPress={downloadTemplate}>
          <Text style={{ color: '#006B3F', fontWeight: '600', fontSize: 13 }}>📥 Download Template</Text>
        </TouchableOpacity>
      </View>

      {/* File picker */}
      <TouchableOpacity style={s.dropzone} onPress={pickFile}>
        <Text style={{ fontSize: 32, marginBottom: 8 }}>📂</Text>
        <Text style={{ fontWeight: '600', color: '#374151' }}>
          {file ? `📄 ${file.name}` : 'Tap to select Excel file'}
        </Text>
        <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>.xlsx or .xls · max 5MB</Text>
      </TouchableOpacity>

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <Text style={{ color: '#b91c1c', fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Preview (first {preview.length} rows)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 6, marginBottom: 4 }}>
                {columns.map(c => (
                  <Text key={c} style={s.th}>{c}</Text>
                ))}
              </View>
              {preview.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
                  {columns.map(c => (
                    <Text key={c} style={s.td}>{String(row[c]).slice(0, 20)}</Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={s.uploadBtn} onPress={handleUpload} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.uploadBtnText}>Upload & Register {preview.length}+ Farmers</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Result */}
      {result && (
        <View style={s.successBox}>
          <Text style={{ fontWeight: 'bold', color: '#166534', fontSize: 15, marginBottom: 4 }}>Upload Complete</Text>
          <Text style={{ color: '#166534' }}>
            ✓ Submitted: {result.created} &nbsp;|&nbsp; ⚠ Skipped: {result.skipped} &nbsp;|&nbsp; ✗ Errors: {result.errors_count}
          </Text>
          {result.errors?.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {result.errors.slice(0, 5).map((e, i) => (
                <Text key={i} style={{ color: '#dc2626', fontSize: 12 }}>Row {e.row}: {e.error}</Text>
              ))}
            </View>
          )}
          <Text style={{ color: '#15803d', fontSize: 12, marginTop: 8 }}>
            All registrations are pending National Admin approval.
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8fafb' },
  header:      { backgroundColor: '#006B3F', padding: 20 },
  title:       { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:         { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  card:        { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  cardTitle:   { fontWeight: 'bold', fontSize: 14, color: '#374151', marginBottom: 8 },
  colChip:     { backgroundColor: '#dbeafe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  templateBtn: { marginTop: 12, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#006B3F', borderRadius: 10 },
  dropzone:    { margin: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 16, padding: 32, alignItems: 'center' },
  errorBox:    { margin: 16, backgroundColor: '#fee2e2', borderRadius: 12, padding: 12 },
  successBox:  { margin: 16, backgroundColor: '#dcfce7', borderRadius: 12, padding: 16 },
  th:          { fontSize: 11, fontWeight: '600', color: '#6b7280', paddingHorizontal: 8, paddingVertical: 6, minWidth: 100 },
  td:          { fontSize: 11, color: '#374151', paddingHorizontal: 8, paddingVertical: 5, minWidth: 100 },
  uploadBtn:   { backgroundColor: '#006B3F', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
