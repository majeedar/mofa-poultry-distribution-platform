import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, ActivityIndicator } from 'react-native';
import api from '../../../shared/api';
import { queueSync } from '../../../shared/db';
import useAuthStore from '../../../shared/authStore';

const HEALTH_FLAGS = ['lethargy', 'respiratory', 'diarrhoea', 'sudden_death', 'reduced_feed'];

export default function DailyEntryScreen({ navigation, route }) {
  const { user } = useAuthStore();
  const today = new Date().toISOString().slice(0,10);
  const farmerId = route.params?.farmerId || 1;

  const [form, setForm] = useState({
    birds_alive: '', mortality_count: '0', feed_consumed_kg: '', water_consumed_l: '',
    vaccine_given: false, vaccine_type: '', observations: '',
  });
  const [healthFlags, setHealthFlags] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleFlag = (flag) => setHealthFlags(prev => prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag]);

  const handleSubmit = async () => {
    if (!form.birds_alive) { Alert.alert('Required', 'Enter number of birds alive today'); return; }
    const mortality = parseInt(form.mortality_count || 0);

    if (mortality > 0) {
      navigation.navigate('MortalityPhoto', {
        farmerId, dailyData: { ...form, health_flags: JSON.stringify(healthFlags), entry_date: today, farmer_id: farmerId },
        mortalityCount: mortality,
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        farmer_id:       farmerId,
        entry_date:      today,
        birds_alive:     parseInt(form.birds_alive),
        mortality_count: mortality,
        feed_consumed_kg: form.feed_consumed_kg ? parseFloat(form.feed_consumed_kg) : null,
        water_consumed_l: form.water_consumed_l ? parseFloat(form.water_consumed_l) : null,
        vaccine_given:   form.vaccine_given,
        vaccine_type:    form.vaccine_given ? form.vaccine_type : null,
        health_flags:    JSON.stringify(healthFlags),
        observations:    form.observations,
        entry_method:    'tablet',
      };
      try {
        await api.post('/daily-entries', payload);
        Alert.alert('✓ Submitted', 'Daily entry recorded', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } catch (netErr) {
        // Queue for later sync
        await queueSync('post', '/daily-entries', payload);
        Alert.alert('Saved Offline', 'Entry saved locally. Will sync when connected.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Daily Farm Entry</Text>
        <Text style={s.date}>{today}</Text>
      </View>

      <View style={s.section}>
        <Label text="Birds Alive Today *" />
        <TextInput style={s.input} value={form.birds_alive} onChangeText={v => setForm(f => ({ ...f, birds_alive: v }))} keyboardType="numeric" placeholder="e.g. 196" />

        <Label text="Mortality Today" />
        <TextInput style={s.input} value={form.mortality_count} onChangeText={v => setForm(f => ({ ...f, mortality_count: v }))} keyboardType="numeric" placeholder="0" />
        {parseInt(form.mortality_count) > 0 && (
          <View style={s.alert}><Text style={s.alertText}>⚠️ Mortality recorded — you'll be asked to take a photo next</Text></View>
        )}

        <Label text="Feed Consumed (kg)" />
        <TextInput style={s.input} value={form.feed_consumed_kg} onChangeText={v => setForm(f => ({ ...f, feed_consumed_kg: v }))} keyboardType="decimal-pad" placeholder="e.g. 23.5" />

        <Label text="Water Consumed (litres)" />
        <TextInput style={s.input} value={form.water_consumed_l} onChangeText={v => setForm(f => ({ ...f, water_consumed_l: v }))} keyboardType="decimal-pad" placeholder="e.g. 60" />

        <View style={s.switchRow}>
          <Text style={s.label}>Vaccine Given Today</Text>
          <Switch value={form.vaccine_given} onValueChange={v => setForm(f => ({ ...f, vaccine_given: v }))} trackColor={{ true: '#006B3F' }} />
        </View>
        {form.vaccine_given && (
          <>
            <Label text="Vaccine Type" />
            <TextInput style={s.input} value={form.vaccine_type} onChangeText={v => setForm(f => ({ ...f, vaccine_type: v }))} placeholder="e.g. Newcastle ND Clone 30" />
          </>
        )}

        <Label text="Health Flags (select all that apply)" />
        <View style={s.flags}>
          {HEALTH_FLAGS.map(flag => (
            <TouchableOpacity key={flag} style={[s.flag, healthFlags.includes(flag) && s.flagActive]} onPress={() => toggleFlag(flag)}>
              <Text style={[s.flagText, healthFlags.includes(flag) && { color: '#fff' }]}>{flag}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Label text="Observations" />
        <TextInput style={[s.input, { height: 80 }]} value={form.observations} onChangeText={v => setForm(f => ({ ...f, observations: v }))} multiline placeholder="Any other observations..." />

        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Submit Entry</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const Label = ({ text }) => <Text style={{ color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 16 }}>{text}</Text>;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafb' },
  header:    { backgroundColor: '#006B3F', padding: 20 },
  title:     { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  date:      { color: '#a7f3d0', fontSize: 13, marginTop: 4 },
  section:   { padding: 20 },
  label:     { color: '#374151', fontSize: 14, fontWeight: '600' },
  input:     { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  flags:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  flag:      { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  flagActive:{ backgroundColor: '#006B3F', borderColor: '#006B3F' },
  flagText:  { fontSize: 12, color: '#374151' },
  alert:     { backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginTop: 8 },
  alertText: { color: '#92400e', fontSize: 13 },
  btn:       { backgroundColor: '#006B3F', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
