import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import api from '../../../shared/api';

export default function ConfirmReceiptScreen({ route, navigation }) {
  const { allocation } = route.params;
  const [step, setStep]         = useState('review'); // review | sign | done
  const [loading, setLoading]   = useState(false);
  const [docsReceived, setDocsReceived]         = useState(String(allocation.docs_allocated));
  const [deadOnArrival, setDeadOnArrival]       = useState('0');
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const sigRef = useRef(null);

  const handleSign = () => setStep('sign');

  const handleSubmit = async (signature) => {
    if (!signature) { Alert.alert('Signature required'); return; }
    setLoading(true);
    try {
      await api.put(`/allocations/${allocation.id}/confirm`, {
        sp_signature:      signature,
        docs_confirmed:    parseInt(docsReceived)  || allocation.docs_allocated,
        dead_on_arrival:   parseInt(deadOnArrival) || 0,
        discrepancy_notes: discrepancyNotes || null,
      });
      setStep('done');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to confirm');
    } finally { setLoading(false); }
  };

  if (step === 'done') return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize: 56, marginBottom: 12 }}>✅</Text>
      <Text style={s.doneTitle}>Receipt Confirmed!</Text>
      <Text style={s.doneSub}>The NDC has been notified. You can now distribute DoCs to farmers.</Text>
      <TouchableOpacity style={[s.btn, { marginTop: 32 }]} onPress={() => navigation.goBack()}>
        <Text style={s.btnText}>Back to Allocation</Text>
      </TouchableOpacity>
    </View>
  );

  if (step === 'sign') return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Text style={s.title}>SP Signature</Text>
        <Text style={s.sub}>Sign to confirm receipt of {allocation.docs_allocated} DoCs</Text>
      </View>
      <SignatureCanvas
        ref={sigRef}
        onOK={handleSubmit}
        onEmpty={() => Alert.alert('Please provide a signature')}
        descriptionText="Sign here to confirm receipt"
        clearText="Clear"
        confirmText={loading ? 'Confirming...' : 'Confirm Receipt'}
        webStyle={`.m-signature-pad { box-shadow: none; border: none; } .m-signature-pad--footer { background: #f8fafb; } .m-signature-pad--footer .button.clear { background: #6b7280; } .m-signature-pad--footer .button.save { background: #006B3F; }`}
      />
      <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('review')}>
        <Text style={{ color: '#6b7280', fontWeight: '600' }}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Confirm Receipt</Text>
        <Text style={s.sub}>Review the allocation details before signing</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Allocation Details</Text>
        <Row label="Barcode"            value={allocation.allocation_barcode} mono />
        <Row label="DoCs Allocated"     value={`${allocation.docs_allocated} Day-Old Chicks`} />
        <Row label="Collection Method"  value={allocation.collection_method} />
        <Row label="Status"             value={allocation.status} />
        <Row label="Dispatch Date"      value={allocation.dispatch_date ? new Date(allocation.dispatch_date).toLocaleDateString() : '—'} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Your Service Point</Text>
        <Row label="SP Code"   value={allocation.sp_code || '—'} />
        <Row label="Location"  value={allocation.location || '—'} />
        <Row label="Region"    value={allocation.region || '—'} />
      </View>

      {/* Actual count + DOA inputs */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Count Verification</Text>
        <Text style={s.inputLabel}>DoCs Actually Received</Text>
        <TextInput
          style={s.input}
          value={docsReceived}
          onChangeText={setDocsReceived}
          keyboardType="numeric"
        />
        <Text style={s.inputLabel}>Dead on Arrival</Text>
        <TextInput
          style={s.input}
          value={deadOnArrival}
          onChangeText={setDeadOnArrival}
          keyboardType="numeric"
          placeholder="0"
        />
        {parseInt(docsReceived) !== allocation.docs_allocated && (
          <>
            <Text style={[s.inputLabel, { color: '#dc2626' }]}>Discrepancy Notes *</Text>
            <TextInput
              style={[s.input, { height: 72 }]}
              value={discrepancyNotes}
              onChangeText={setDiscrepancyNotes}
              multiline
              placeholder="Explain the difference in count..."
            />
          </>
        )}
      </View>

      <View style={[s.card, { backgroundColor: '#fef3c7', borderColor: '#fde68a', borderWidth: 1 }]}>
        <Text style={{ fontWeight: '600', color: '#92400e', marginBottom: 6 }}>⚠ Before you sign</Text>
        <Text style={{ fontSize: 13, color: '#78350f', lineHeight: 20 }}>
          By signing you confirm the count above is correct. Dead on arrival chicks will be
          reported to the NDC. This action cannot be undone.
        </Text>
      </View>

      <TouchableOpacity style={s.btn} onPress={handleSign}>
        <Text style={s.btnText}>✍ Sign & Confirm Receipt</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const Row = ({ label, value, mono }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
    <Text style={{ color: '#6b7280', fontSize: 13 }}>{label}</Text>
    <Text style={{ color: '#111', fontWeight: '600', fontSize: mono ? 11 : 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f8fafb' },
  header:     { backgroundColor: '#006B3F', padding: 20 },
  title:      { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:        { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  card:       { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  cardTitle:  { fontWeight: 'bold', fontSize: 14, color: '#374151', marginBottom: 8 },
  inputLabel: { color: '#374151', fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input:      { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15 },
  btn:        { backgroundColor: '#006B3F', margin: 16, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnText:    { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cancelBtn:  { padding: 16, alignItems: 'center' },
  doneTitle:  { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  doneSub:    { fontSize: 14, color: '#6b7280', textAlign: 'center', paddingHorizontal: 32 },
});
