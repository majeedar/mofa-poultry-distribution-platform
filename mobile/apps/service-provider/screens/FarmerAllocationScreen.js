import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import api from '../../../shared/api';

// ── Tier configuration ────────────────────────────────────────────────────────
const DOCS_PER_TIER = { anchor: 100, small_medium: 50, household: 10 };
const TIER_LABEL    = { anchor: '🌟 Anchor', small_medium: '👩‍🌾 Small/Medium', household: '🏠 Household' };
const TIER_COLOR    = { anchor: '#7c3aed', small_medium: '#0369a1', household: '#15803d' };
const TIER_BG       = { anchor: '#ede9fe', small_medium: '#dbeafe', household: '#dcfce7' };
const TIER_ORDER    = ['anchor', 'small_medium', 'household'];

export default function FarmerAllocationScreen({ route, navigation }) {
  const { allocation } = route.params;
  const totalDocs = allocation.docs_confirmed ?? allocation.docs_allocated;

  const [sp, setSp]                   = useState(null);
  const [farmers, setFarmers]         = useState([]);
  const [allHhFarmers, setAllHhFarmers] = useState([]); // all HH farmers in system
  const [addedHhIds, setAddedHhIds]   = useState(new Set()); // HH farmers added via picker
  const [showHhPicker, setShowHhPicker] = useState(false);
  const [hhSearch, setHhSearch]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmit]       = useState(false);
  // allocs: { [farmer_id]: { docs: string, method: 'pickup'|'delivery' } }
  const [allocs, setAllocs]           = useState({});

  const load = useCallback(async () => {
    try {
      const { data: spData } = await api.get('/service-providers/mine');
      setSp(spData);
      // SP's own registered farmers (all tiers)
      const { data: farmerList } = await api.get('/farmers', { params: { sp_id: spData?.id } });
      setFarmers(farmerList);
      // All household farmers in the system (for picker)
      const { data: hhList } = await api.get('/farmers', { params: { tier: 'household' } });
      setAllHhFarmers(hhList);
      // Default method from farmer's registered collection_method preference
      const init = {};
      for (const f of farmerList) init[f.id] = { docs: '', method: f.collection_method || 'pickup' };
      setAllocs(init);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Auto-allocate: tier-based quantities ──────────────────────────────────
  const autoAllocate = () => {
    if (!farmers.length) return;
    const updated = {};
    for (const f of farmers) {
      updated[f.id] = {
        docs:   String(DOCS_PER_TIER[f.production_tier] ?? 10),
        method: allocs[f.id]?.method || f.collection_method || 'pickup',
      };
    }
    setAllocs(updated);
  };

  const setDoc    = (fid, val) => setAllocs(a => ({ ...a, [fid]: { ...a[fid], docs: val } }));
  const setMethod = (fid, val) => setAllocs(a => ({ ...a, [fid]: { ...a[fid], method: val } }));

  const allocated  = Object.values(allocs).reduce((s, a) => s + (parseInt(a.docs) || 0), 0);
  const remaining  = totalDocs - allocated;
  const numFilled  = Object.values(allocs).filter(a => parseInt(a.docs) > 0).length;

  const handleSubmit = async () => {
    if (!numFilled) { Alert.alert('No allocations', 'Set DoC counts for at least one farmer.'); return; }
    if (remaining < 0) {
      Alert.alert(
        'Over-allocated',
        `You have allocated ${Math.abs(remaining)} more DoCs than received. Please reduce amounts.`,
      );
      return;
    }
    if (remaining > 0) {
      Alert.alert(
        'Unallocated DoCs',
        `${remaining} DoCs will not be allocated. Continue anyway?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: doSubmit }],
      );
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    setSubmit(true);
    try {
      const farmers_allocations = Object.entries(allocs)
        .filter(([, a]) => parseInt(a.docs) > 0)
        .map(([farmer_id, a]) => ({
          farmer_id:         parseInt(farmer_id),
          docs_allocated:    parseInt(a.docs),
          collection_method: a.method,
        }));
      await api.post('/deliveries', {
        allocation_id: allocation.id,
        sp_id:         sp.id,
        farmers_allocations,
      });
      Alert.alert(
        '✓ Farmers Notified',
        `${farmers_allocations.length} farmers have been allocated DoCs and notified via SMS.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally { setSubmit(false); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#006B3F" size="large" />;

  // HH farmers added via picker (not already in SP's registered list)
  const spHhIds = new Set(farmers.filter(f => f.production_tier === 'household').map(f => f.id));
  const extraHhFarmers = allHhFarmers.filter(f => addedHhIds.has(f.id) && !spHhIds.has(f.id));

  // Group farmers by tier in defined order, skip tiers with no farmers
  const grouped = TIER_ORDER
    .map(tier => ({
      tier,
      items: tier === 'household'
        ? [...farmers.filter(f => f.production_tier === tier), ...extraHhFarmers]
        : farmers.filter(f => f.production_tier === tier),
    }))
    .filter(g => g.items.length > 0 || g.tier === 'household'); // always show HH section for picker

  // Picker: HH farmers not yet in the list
  const hhPickerOptions = allHhFarmers.filter(f =>
    !spHhIds.has(f.id) && !addedHhIds.has(f.id) &&
    (!hhSearch || f.full_name.toLowerCase().includes(hhSearch.toLowerCase()) || f.farmer_number.toLowerCase().includes(hhSearch.toLowerCase()))
  );

  // Per-tier counts for header summary chips
  const tierCounts = {};
  for (const f of farmers) tierCounts[f.production_tier] = (tierCounts[f.production_tier] || 0) + 1;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Farmer Allocations</Text>
        <Text style={s.headerSub}>{totalDocs} DoCs available · {farmers.length} farmers</Text>
        {/* Tier summary chips */}
        <View style={s.tierPillRow}>
          {TIER_ORDER.filter(t => tierCounts[t]).map(t => (
            <View key={t} style={s.tierPill}>
              <Text style={s.tierPillText}>{TIER_LABEL[t]} ×{tierCounts[t]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Tally bar ───────────────────────────────────────────────────────── */}
      <View style={[s.tally, remaining === 0 ? s.tallyGreen : remaining < 0 ? s.tallyRed : s.tallyAmber]}>
        <Text style={s.tallyText}>
          Allocated: {allocated} / {totalDocs} DoCs
          {remaining > 0
            ? `  ·  ${remaining} remaining`
            : remaining < 0
              ? `  ·  ${Math.abs(remaining)} over-allocated`
              : '  ✓ Balanced'}
        </Text>
      </View>

      {/* ── Auto-allocate button ────────────────────────────────────────────── */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.autoBtn} onPress={autoAllocate}>
          <Text style={s.autoBtnText}>⚡ Auto-Allocate by Tier</Text>
        </TouchableOpacity>
        <View style={s.defaultsChip}>
          <Text style={s.defaultsText}>HH ×10 · STM ×50 · Anchor ×100</Text>
        </View>
      </View>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!farmers.length && (
        <View style={s.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
          <Text style={s.emptyText}>No farmers registered under this service point.</Text>
        </View>
      )}

      {/* ── Grouped farmer cards ────────────────────────────────────────────── */}
      {grouped.map(({ tier, items }) => (
        <View key={tier}>

          {/* Tier section header */}
          <View style={s.tierHeader}>
            <View style={[s.tierDot, { backgroundColor: TIER_COLOR[tier] }]} />
            <Text style={[s.tierHeaderText, { color: TIER_COLOR[tier] }]}>
              {TIER_LABEL[tier].toUpperCase()}
            </Text>
            <Text style={s.tierMeta}>
              {items.length} farmer{items.length !== 1 ? 's' : ''} · {DOCS_PER_TIER[tier] ?? 10} DoCs each
            </Text>
          </View>

          {/* HH picker — add any household farmer by search */}
          {tier === 'household' && (
            <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <TouchableOpacity
                style={[s.addHhBtn, showHhPicker && s.addHhBtnActive]}
                onPress={() => { setShowHhPicker(v => !v); setHhSearch(''); }}
              >
                <Text style={s.addHhBtnText}>{showHhPicker ? '✕ Close' : '➕ Add Household Farmer'}</Text>
              </TouchableOpacity>
              {showHhPicker && (
                <View style={s.hhPickerPanel}>
                  <TextInput
                    style={s.hhSearchInput}
                    value={hhSearch}
                    onChangeText={setHhSearch}
                    placeholder="Search by name or ID..."
                    placeholderTextColor="#9ca3af"
                    autoFocus
                  />
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                    {hhPickerOptions.length === 0 && (
                      <Text style={s.hhPickerEmpty}>
                        {hhSearch ? 'No matches found' : 'All household farmers already added'}
                      </Text>
                    )}
                    {hhPickerOptions.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={s.hhPickerRow}
                        onPress={() => {
                          setAddedHhIds(s => new Set([...s, f.id]));
                          setAllocs(a => ({ ...a, [f.id]: { docs: '10', method: f.collection_method || 'pickup' } }));
                          setShowHhPicker(false);
                          setHhSearch('');
                        }}
                      >
                        <View style={[s.avatar, { backgroundColor: TIER_COLOR.household, width: 30, height: 30, borderRadius: 15 }]}>
                          <Text style={[s.avatarText, { fontSize: 12 }]}>{(f.full_name?.[0] || 'F').toUpperCase()}</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={s.hhPickerName}>{f.full_name}</Text>
                          <Text style={s.hhPickerSub}>{f.farmer_number} · {f.farm_location || f.district || ''}</Text>
                        </View>
                        <Text style={{ color: '#006B3F', fontWeight: '700', fontSize: 18 }}>+</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {items.map(f => {
            const docVal = allocs[f.id]?.docs || '';
            const method = allocs[f.id]?.method || 'pickup';
            return (
              <View key={f.id} style={s.farmerCard}>
                {/* Farmer identity row */}
                <View style={s.farmerInfo}>
                  <View style={[s.avatar, { backgroundColor: TIER_COLOR[f.production_tier] || '#006B3F' }]}>
                    <Text style={s.avatarText}>{(f.full_name?.[0] || 'F').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.farmerName}>{f.full_name}</Text>
                    <Text style={s.farmerId}>{f.farmer_number} · {f.farm_location || f.district}</Text>
                  </View>
                  <View style={[s.tierBadge, { backgroundColor: TIER_BG[f.production_tier] }]}>
                    <Text style={[s.tierBadgeText, { color: TIER_COLOR[f.production_tier] }]}>
                      {TIER_LABEL[f.production_tier] || f.production_tier}
                    </Text>
                  </View>
                </View>

                {/* DoCs + method row */}
                <View style={s.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inputLabel}>DoCs to allocate</Text>
                    <TextInput
                      style={[s.input, docVal && parseInt(docVal) > 0 ? s.inputFilled : null]}
                      value={docVal}
                      onChangeText={v => setDoc(f.id, v)}
                      keyboardType="numeric"
                      placeholder={String(DOCS_PER_TIER[f.production_tier] ?? 10)}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={s.methodToggle}>
                    <Text style={s.inputLabel}>Collection</Text>
                    <View style={s.toggleRow}>
                      {['pickup', 'delivery'].map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[s.toggleBtn, method === m && s.toggleBtnActive]}
                          onPress={() => setMethod(f.id, m)}
                        >
                          <Text style={[s.toggleBtnText, method === m && s.toggleBtnTextActive]}>
                            {m === 'pickup' ? '🏠 Pickup' : '🚚 Deliver'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <View style={{ padding: 16 }}>
        <TouchableOpacity
          style={[s.submitBtn, (submitting || !numFilled) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting || !numFilled}
        >
          <Text style={s.submitBtnText}>
            {submitting
              ? 'Notifying farmers...'
              : numFilled
                ? `✓ Allocate & Notify ${numFilled} Farmer${numFilled !== 1 ? 's' : ''}`
                : 'Enter DoC counts above'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafb' },

  header:          { backgroundColor: '#006B3F', padding: 20 },
  headerTitle:     { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub:       { color: '#a7f3d0', fontSize: 13, marginTop: 4 },
  tierPillRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tierPill:        { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tierPillText:    { color: '#fff', fontSize: 11, fontWeight: '600' },

  tally:           { marginHorizontal: 16, marginTop: 12, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  tallyGreen:      { backgroundColor: '#dcfce7' },
  tallyAmber:      { backgroundColor: '#fef9c3' },
  tallyRed:        { backgroundColor: '#fee2e2' },
  tallyText:       { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },

  actionRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 10 },
  autoBtn:         { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  autoBtnText:     { color: '#92400e', fontWeight: '700', fontSize: 13 },
  defaultsChip:    { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  defaultsText:    { color: '#6b7280', fontSize: 11, fontWeight: '500' },

  // Tier section header
  tierHeader:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, gap: 8 },
  tierDot:         { width: 8, height: 8, borderRadius: 4 },
  tierHeaderText:  { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  tierMeta:        { fontSize: 11, color: '#9ca3af', flex: 1 },

  farmerCard:      { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  farmerInfo:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar:          { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  avatarText:      { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  farmerName:      { fontWeight: '700', color: '#111', fontSize: 14 },
  farmerId:        { color: '#6b7280', fontSize: 11, marginTop: 1 },
  tierBadge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tierBadgeText:   { fontSize: 10, fontWeight: '700' },

  inputRow:        { flexDirection: 'row', gap: 12 },
  inputLabel:      { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:           { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 20, fontWeight: 'bold', color: '#111', textAlign: 'center' },
  inputFilled:     { borderColor: '#006B3F', backgroundColor: '#f0fdf4' },
  methodToggle:    { flex: 1.5 },
  toggleRow:       { flexDirection: 'row', gap: 4 },
  toggleBtn:       { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#006B3F' },
  toggleBtnText:   { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  toggleBtnTextActive: { color: '#fff' },

  addHhBtn:        { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  addHhBtnActive:  { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  addHhBtnText:    { color: '#15803d', fontWeight: '700', fontSize: 13 },
  hhPickerPanel:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  hhSearchInput:   { borderBottomWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  hhPickerRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  hhPickerName:    { fontWeight: '600', color: '#111', fontSize: 13 },
  hhPickerSub:     { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  hhPickerEmpty:   { textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 20 },

  empty:           { alignItems: 'center', padding: 48 },
  emptyText:       { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginTop: 4 },

  submitBtn:       { backgroundColor: '#006B3F', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  submitBtnText:   { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cancelBtn:       { backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:   { color: '#6b7280', fontWeight: '600', fontSize: 14 },
});
