import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Image, ScrollView
} from 'react-native';
import api from '../../../shared/api';

export default function MortalityReviewScreen() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/mortality?status=pending_review');
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openReview = (item) => { setSelected(item); setNotes(''); };
  const closeReview = () => { setSelected(null); setNotes(''); };

  const submit = async (decision) => {
    if (decision === 'rejected' && !notes.trim()) {
      Alert.alert('Rejection reason required', 'Please provide notes when rejecting.');
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/mortality/${selected.id}/review`, { aea_decision: decision, aea_notes: notes.trim() });
      setItems(prev => prev.filter(i => i.id !== selected.id));
      closeReview();
      Alert.alert('Done', `Mortality report ${decision}.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to submit review');
    } finally { setSubmitting(false); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Mortality Review</Text>
        <Text style={s.sub}>{items.length} reports awaiting review</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#006B3F']} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={{ color: '#6b7280', marginTop: 12, fontWeight: '600' }}>No pending reviews</Text>
            <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>All mortality reports have been reviewed</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => openReview(item)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <View>
                <Text style={s.farmerName}>{item.farmer_name || `Farmer #${item.farmer_id}`}</Text>
                <Text style={s.farmerId}>{item.farmer_number}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: item.ocr_status === 'flagged' ? '#fee2e2' : '#fef3c7' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: item.ocr_status === 'flagged' ? '#991b1b' : '#92400e' }}>
                  {item.ocr_status === 'flagged' ? '⚠ FLAGGED' : '⏳ PENDING'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Detail label="Farmer Count"  value={item.farmer_count} />
              <Detail label="OCR Count"     value={item.ocr_count} color={item.ocr_status === 'flagged' ? '#dc2626' : '#006B3F'} />
              <Detail label="Variance"      value={`${item.variance_percent?.toFixed(1)}%`} color={item.variance_percent > 20 ? '#dc2626' : '#6b7280'} />
            </View>

            <Text style={s.dateText}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Review Modal */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={closeReview}>
        {selected && (
          <ScrollView style={{ flex: 1, backgroundColor: '#f8fafb' }}>
            <View style={[s.header, { paddingTop: 48 }]}>
              <Text style={s.title}>Review Mortality Report</Text>
              <Text style={s.sub}>{selected.farmer_name || `Farmer #${selected.farmer_id}`}</Text>
            </View>

            {selected.photo_url && (
              <View style={s.photoCard}>
                <Text style={s.sectionLabel}>Photo Evidence</Text>
                <Image
                  source={{ uri: `http://10.0.2.2:3000/${selected.photo_url}` }}
                  style={{ width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover' }}
                />
              </View>
            )}

            <View style={s.infoCard}>
              <Text style={s.sectionLabel}>OCR Analysis</Text>
              <Row label="Farmer's Count"   value={selected.farmer_count} />
              <Row label="OCR Count"        value={selected.ocr_count}    color={selected.ocr_status === 'flagged' ? '#dc2626' : '#006B3F'} />
              <Row label="Confidence"       value={`${selected.ocr_confidence?.toFixed(0)}%`} />
              <Row label="Variance"         value={`${selected.variance_percent?.toFixed(1)}%`} color={selected.variance_percent > 20 ? '#dc2626' : undefined} />
              <Row label="OCR Status"       value={selected.ocr_status}   color={selected.ocr_status === 'flagged' ? '#dc2626' : '#16a34a'} />
            </View>

            <View style={s.infoCard}>
              <Text style={s.sectionLabel}>Your Notes</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Enter your observations or reasons for this decision..."
                multiline
                numberOfLines={4}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, margin: 16 }}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#006B3F', flex: 1 }]}
                onPress={() => submit('confirmed')}
                disabled={submitting}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
                  {submitting ? '...' : '✓ Confirm'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#dc2626', flex: 1 }]}
                onPress={() => submit('rejected')}
                disabled={submitting}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
                  {submitting ? '...' : '✗ Reject'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={{ padding: 16, alignItems: 'center' }} onPress={closeReview}>
              <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

const Detail = ({ label, value, color = '#374151' }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={{ fontSize: 16, fontWeight: 'bold', color }}>{value}</Text>
    <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{label}</Text>
  </View>
);

const Row = ({ label, value, color }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
    <Text style={{ color: '#6b7280', fontSize: 13 }}>{label}</Text>
    <Text style={{ color: color ?? '#111', fontWeight: '600', fontSize: 13 }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafb' },
  header:       { backgroundColor: '#006B3F', padding: 20 },
  title:        { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:          { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  farmerName:   { fontWeight: 'bold', fontSize: 15, color: '#111' },
  farmerId:     { color: '#6b7280', fontSize: 12, marginTop: 2 },
  badge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  dateText:     { color: '#9ca3af', fontSize: 11, marginTop: 10 },
  photoCard:    { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16 },
  infoCard:     { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16 },
  sectionLabel: { fontWeight: '700', color: '#374151', fontSize: 13, marginBottom: 12 },
  notesInput:   { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', minHeight: 90, textAlignVertical: 'top' },
  actionBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
