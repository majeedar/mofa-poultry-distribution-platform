import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import * as Location from 'expo-location';
import api from '../../../shared/api';

const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;

export default function FarmerRegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    ghana_card_number: '', full_name: '', phone_number: '', gender: 'Female',
    production_tier: 'small_medium', sp_id: '', aea_id: '',
    farm_location: '', region: '', district: '',
    farm_gps_lat: '', farm_gps_lng: '',
    flock_capacity: '', has_tablet: false,
  });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [spList, setSpList]   = useState([]);
  const [myAeaId, setMyAeaId] = useState(null);

  useEffect(() => {
    loadRefs();
  }, []);

  const loadRefs = async () => {
    try {
      const [spsRes, aeaRes] = await Promise.all([
        api.get('/service-providers'),
        api.get('/aeas/mine'),
      ]);
      const sps = spsRes.data || [];
      setSpList(sps);
      if (aeaRes.data?.id) {
        setMyAeaId(aeaRes.data.id);
        setForm(f => ({
          ...f,
          aea_id: String(aeaRes.data.id),
          sp_id: f.sp_id || (sps[0] ? String(sps[0].id) : ''),
        }));
      } else if (sps[0]) {
        setForm(f => ({ ...f, sp_id: f.sp_id || String(sps[0].id) }));
      }
    } catch (e) {}
  };

  const fillSample = () => {
    const rand9 = () => String(Math.floor(100000000 + Math.random() * 800000000));
    const checkDigit = () => String(Math.floor(Math.random() * 10));
    const firstNames = ['Kwame','Abena','Kofi','Akosua','Yaw','Ama','Kojo','Adwoa','Fiifi','Efua'];
    const lastNames  = ['Asante','Boateng','Mensah','Owusu','Amoah','Darko','Frimpong','Adjei','Ofori','Tetteh'];
    const locations  = [
      { loc: 'Adum, Kumasi',    region: 'Ashanti',  district: 'Kumasi Metro', lat: '6.68830', lng: '-1.62480' },
      { loc: 'Suame, Kumasi',   region: 'Ashanti',  district: 'Suame',        lat: '6.72100', lng: '-1.61500' },
      { loc: 'Kasoa, Central',  region: 'Central',  district: 'Awutu Senya',  lat: '5.53500', lng: '-0.42800' },
      { loc: 'Tamale Central',  region: 'Northern', district: 'Tamale Metro', lat: '9.40390', lng: '-0.83990' },
      { loc: 'Koforidua, ER',   region: 'Eastern',  district: 'New Juaben',   lat: '6.09400', lng: '-0.26100' },
    ];
    const place = locations[Math.floor(Math.random() * locations.length)];
    const gender = Math.random() > 0.5 ? 'Male' : 'Female';
    const tiers = ['anchor', 'small_medium', 'household'];
    const tier = tiers[Math.floor(Math.random() * tiers.length)];
    const sp = spList.length > 0 ? spList[Math.floor(Math.random() * spList.length)] : null;
    const phone = '+23324' + String(Math.floor(1000000 + Math.random() * 8999999));
    const name = firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' +
                 lastNames[Math.floor(Math.random() * lastNames.length)];
    setForm({
      ghana_card_number: `GHA-${rand9()}-${checkDigit()}`,
      full_name:         name,
      phone_number:      phone,
      gender,
      production_tier:   tier,
      sp_id:             sp ? String(sp.id) : (form.sp_id || ''),
      aea_id:            myAeaId ? String(myAeaId) : (form.aea_id || ''),
      farm_location:     place.loc,
      region:            place.region,
      district:          place.district,
      farm_gps_lat:      place.lat,
      farm_gps_lng:      place.lng,
      flock_capacity:    String(100 + Math.floor(Math.random() * 900)),
      has_tablet:        Math.random() > 0.6,
    });
  };

  const getGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Location permission needed to capture farm GPS'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm(f => ({ ...f, farm_gps_lat: String(loc.coords.latitude.toFixed(6)), farm_gps_lng: String(loc.coords.longitude.toFixed(6)) }));
    } catch (e) { Alert.alert('GPS Error', 'Could not get location'); }
    finally { setGpsLoading(false); }
  };

  const validate = () => {
    const e = {};
    if (!GHANA_CARD_RE.test(form.ghana_card_number)) e.ghana_card_number = 'Format: GHA-XXXXXXXXX-X';
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!form.phone_number.trim()) e.phone_number = 'Required';
    if (!form.sp_id) e.sp_id = 'Select a Service Provider';
    if (!form.farm_location.trim()) e.farm_location = 'Required';
    if (!form.region.trim()) e.region = 'Required';
    if (!form.farm_gps_lat) e.farm_gps_lat = 'Capture GPS or enter manually';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/registrations', {
        ghana_card_number: form.ghana_card_number,
        requested_role: 'farmer',
        submitted_data: {
          ...form,
          farm_gps_lat: parseFloat(form.farm_gps_lat),
          farm_gps_lng: parseFloat(form.farm_gps_lng),
          flock_capacity: form.flock_capacity ? parseInt(form.flock_capacity) : null,
          sp_id: parseInt(form.sp_id),
          aea_id: myAeaId || parseInt(form.aea_id),
        },
      });
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  if (submitted) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <Text style={{ fontSize: 56, marginBottom: 16 }}>⏳</Text>
      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111', textAlign: 'center' }}>Registration Submitted</Text>
      <Text style={{ color: '#666', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
        {form.full_name}'s registration is pending National Admin approval. They will receive login credentials once approved.
      </Text>
      <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
        <Text style={s.btnText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );

  const Field = ({ name, label, type = 'default', placeholder }) => (
    <View style={{ marginBottom: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, errors[name] && { borderColor: '#dc2626' }]}
        value={form[name]} onChangeText={v => setForm(f => ({ ...f, [name]: v }))}
        keyboardType={type} placeholder={placeholder} placeholderTextColor="#aaa" />
      {errors[name] && <Text style={s.errorText}>{errors[name]}</Text>}
    </View>
  );

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Register Farmer</Text>
        <Text style={s.sub}>Pending National Admin approval</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={s.demoFill} onPress={fillSample}>
            <Text style={s.demoFillText}>⚡ Fill New (Random)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.demoFill, { backgroundColor: 'rgba(255,80,80,0.25)' }]}
            onPress={() => setForm(f => ({ ...f, ghana_card_number: 'GHA-500000001-0', full_name: 'Ama Owusu', phone_number: '+233244000001', sp_id: spList[0] ? String(spList[0].id) : f.sp_id, aea_id: myAeaId ? String(myAeaId) : f.aea_id, farm_location: 'Manhyia, Kumasi', region: 'Ashanti', district: 'Kumasi Metro', farm_gps_lat: '6.70120', farm_gps_lng: '-1.62100', flock_capacity: '200' }))}>
            <Text style={s.demoFillText}>🚫 Fill Existing (Reject)</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.form}>
        <Field name="ghana_card_number" label="Ghana Card Number *" placeholder="GHA-123456789-0" />
        <Field name="full_name"         label="Full Name *"         placeholder="Ama Owusu" />
        <Field name="phone_number"      label="Phone Number *"      type="phone-pad" placeholder="+233244000000" />

        <Text style={s.label}>Gender</Text>
        <View style={s.row}>
          {['Male','Female'].map(g => (
            <TouchableOpacity key={g} style={[s.toggle, form.gender === g && s.toggleActive]} onPress={() => setForm(f => ({ ...f, gender: g }))}>
              <Text style={[s.toggleText, form.gender === g && { color: '#fff' }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Production Tier *</Text>
        <View style={s.row}>
          {['anchor','small_medium','household'].map(t => (
            <TouchableOpacity key={t} style={[s.toggle, form.production_tier === t && s.toggleActive]} onPress={() => setForm(f => ({ ...f, production_tier: t }))}>
              <Text style={[s.toggleText, form.production_tier === t && { color: '#fff' }, { fontSize: 11 }]}>{t.replace('_',' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Service Provider *</Text>
        {spList.length > 0 ? (
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {spList.map(sp => (
              <TouchableOpacity key={sp.id} style={[s.toggle, form.sp_id === String(sp.id) && s.toggleActive, { marginBottom: 6 }]}
                onPress={() => setForm(f => ({ ...f, sp_id: String(sp.id) }))}>
                <Text style={[s.toggleText, form.sp_id === String(sp.id) && { color: '#fff' }, { fontSize: 11 }]}>
                  {sp.sp_number}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TextInput style={[s.input, errors.sp_id && { borderColor: '#dc2626' }]}
            value={form.sp_id} onChangeText={v => setForm(f => ({ ...f, sp_id: v }))}
            keyboardType="numeric" placeholder="SP ID" placeholderTextColor="#aaa" />
        )}
        {errors.sp_id && <Text style={s.errorText}>{errors.sp_id}</Text>}

        <Field name="farm_location" label="Farm Location *" placeholder="Asokwa, Kumasi" />
        <Field name="region"        label="Region *"        placeholder="Ashanti" />
        <Field name="district"      label="District"        placeholder="Kumasi Metro" />

        <Text style={s.label}>Farm GPS Coordinates *</Text>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1, marginRight: 8 }, errors.farm_gps_lat && { borderColor: '#dc2626' }]}
            value={form.farm_gps_lat} onChangeText={v => setForm(f => ({ ...f, farm_gps_lat: v }))} placeholder="Latitude" keyboardType="decimal-pad" placeholderTextColor="#aaa" />
          <TextInput style={[s.input, { flex: 1 }]}
            value={form.farm_gps_lng} onChangeText={v => setForm(f => ({ ...f, farm_gps_lng: v }))} placeholder="Longitude" keyboardType="decimal-pad" placeholderTextColor="#aaa" />
        </View>
        <TouchableOpacity style={s.gpsBtn} onPress={getGPS} disabled={gpsLoading}>
          {gpsLoading ? <ActivityIndicator color="#006B3F" size="small" /> : <Text style={s.gpsBtnText}>📍 Capture Current GPS Location</Text>}
        </TouchableOpacity>
        {errors.farm_gps_lat && <Text style={s.errorText}>{errors.farm_gps_lat}</Text>}

        <Field name="flock_capacity" label="Flock Capacity" type="numeric" placeholder="500" />

        <View style={s.switchRow}>
          <Text style={s.label}>Has Android Tablet</Text>
          <Switch value={form.has_tablet} onValueChange={v => setForm(f => ({ ...f, has_tablet: v }))} trackColor={{ true: '#006B3F' }} />
        </View>

        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Submit for Approval</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafb' },
  header:    { backgroundColor: '#006B3F', padding: 20 },
  title:     { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub:       { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  demoFill:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start', marginTop: 10 },
  demoFillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  form:      { padding: 20 },
  label:     { color: '#374151', fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:     { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111' },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: 3 },
  row:       { flexDirection: 'row', gap: 8, marginBottom: 4 },
  toggle:    { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  toggleActive: { backgroundColor: '#006B3F', borderColor: '#006B3F' },
  toggleText:{ fontSize: 13, color: '#374151' },
  gpsBtn:    { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  gpsBtnText:{ color: '#16a34a', fontWeight: '600', fontSize: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  btn:       { backgroundColor: '#006B3F', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 32 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
