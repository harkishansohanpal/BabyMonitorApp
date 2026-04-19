import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const THEME = {
  primary: '#6C63FF',
  primaryLight: '#EEF0FF',
  background: '#F8F9FE',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subText: '#8E8EA0',
  green: '#4CAF50',
  orange: '#FF9800',
  red: '#F44336',
  blue: '#2196F3',
  purple: '#9C27B0',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
const LOG_TYPES = [
  { id: 'sleep', label: 'Sleep', icon: 'moon', color: THEME.blue },
  { id: 'feed_breast', label: 'Breastfeed', icon: 'heart', color: THEME.red },
  { id: 'feed_bottle', label: 'Bottle', icon: 'water', color: THEME.primary },
  { id: 'diaper', label: 'Diaper', icon: 'refresh', color: THEME.orange },
  { id: 'awake', label: 'Awake Time', icon: 'sunny', color: THEME.orange },
];

const SAMPLE_LOGS = [
  { id: '1', type: 'sleep', startTime: '08:00 AM', endTime: '10:15 AM', duration: '2h 15m', notes: 'Long morning nap' },
  { id: '2', type: 'feed_breast', startTime: '10:30 AM', endTime: '10:50 AM', duration: '20m', notes: 'Both sides' },
  { id: '3', type: 'diaper', startTime: '11:00 AM', endTime: null, duration: null, notes: 'Wet' },
  { id: '4', type: 'feed_bottle', startTime: '01:30 PM', endTime: '01:50 PM', duration: '20m', notes: '4oz formula' },
  { id: '5', type: 'sleep', startTime: '02:00 PM', endTime: '03:30 PM', duration: '1h 30m', notes: 'Afternoon nap' },
];

// ─────────────────────────────────────────────
// Log Entry Component
// ─────────────────────────────────────────────
function LogEntry({ item }) {
  const type = LOG_TYPES.find((t) => t.id === item.type) || LOG_TYPES[0];
  return (
    <View style={styles.logEntry}>
      <View style={[styles.logIcon, { backgroundColor: type.color + '20' }]}>
        <Ionicons name={type.icon} size={18} color={type.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.logType}>{type.label}</Text>
        <Text style={styles.logTime}>
          {item.startTime}{item.endTime ? ` → ${item.endTime}` : ' (ongoing)'}
          {item.duration ? `  ·  ${item.duration}` : ''}
        </Text>
        {item.notes ? <Text style={styles.logNotes}>{item.notes}</Text> : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Summary Chip
// ─────────────────────────────────────────────
function SummaryChip({ icon, value, label, color }) {
  return (
    <View style={[styles.chip, { borderColor: color + '40', backgroundColor: color + '10' }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Add Entry Modal
// ─────────────────────────────────────────────
function AddEntryModal({ visible, onClose, onSave }) {
  const [selectedType, setSelectedType] = useState('sleep');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    const type = LOG_TYPES.find((t) => t.id === selectedType);
    onSave({
      id: Date.now().toString(),
      type: selectedType,
      startTime: now(),
      endTime: null,
      duration: null,
      notes,
    });
    setNotes('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Log New Entry</Text>

          <Text style={styles.modalLabel}>Type</Text>
          <View style={styles.typeGrid}>
            {LOG_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeBtn, selectedType === t.id && { borderColor: t.color, backgroundColor: t.color + '15' }]}
                onPress={() => setSelectedType(t.id)}
              >
                <Ionicons name={t.icon} size={18} color={selectedType === t.id ? t.color : THEME.subText} />
                <Text style={[styles.typeBtnText, selectedType === t.id && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="E.g., deep sleep, 4oz, wet diaper…"
            placeholderTextColor={THEME.subText}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Sleep Timer
// ─────────────────────────────────────────────
function SleepTimer() {
  const [isSleeping, setIsSleeping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    if (!isSleeping) return;
    const t = setInterval(() => setElapsed((e) => e + 1000), 1000);
    return () => clearInterval(t);
  }, [isSleeping]);

  const toggle = () => {
    if (!isSleeping) {
      setStartTime(now());
      setElapsed(0);
    }
    setIsSleeping(!isSleeping);
  };

  return (
    <View style={[styles.timerCard, isSleeping && styles.timerCardActive]}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Ionicons name="moon" size={28} color={isSleeping ? THEME.blue : THEME.subText} />
        <Text style={styles.timerTitle}>Sleep Timer</Text>
        {isSleeping && <Text style={styles.timerSince}>Started at {startTime}</Text>}
        <Text style={[styles.timerDisplay, { color: isSleeping ? THEME.blue : THEME.subText }]}>
          {formatDuration(elapsed)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.timerBtn, { backgroundColor: isSleeping ? THEME.red : THEME.blue }]}
        onPress={toggle}
      >
        <Ionicons name={isSleeping ? 'stop' : 'play'} size={20} color="#fff" />
        <Text style={styles.timerBtnText}>{isSleeping ? 'Stop Sleep' : 'Start Sleep'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function SleepTrackerScreen() {
  const [logs, setLogs] = useState(SAMPLE_LOGS);
  const [modalVisible, setModalVisible] = useState(false);

  const handleSave = (entry) => {
    setLogs((prev) => [entry, ...prev]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Sleep Timer ── */}
        <SleepTimer />

        {/* ── Today Summary ── */}
        <Text style={styles.sectionTitle}>Today at a Glance</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SummaryChip icon="moon" value="6h 20m" label="Total Sleep" color={THEME.blue} />
            <SummaryChip icon="heart" value="3×" label="Breastfed" color={THEME.red} />
            <SummaryChip icon="water" value="1×" label="Bottle" color={THEME.primary} />
            <SummaryChip icon="refresh" value="5×" label="Diapers" color={THEME.orange} />
            <SummaryChip icon="sunny" value="2h 10m" label="Awake" color={THEME.orange} />
          </View>
        </ScrollView>

        {/* ── Log List ── */}
        <View style={styles.logHeader}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Entry</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.logCard}>
          {logs.map((item) => (
            <LogEntry key={item.id} item={item} />
          ))}
        </View>

      </ScrollView>

      <AddEntryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FE' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  timerCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    alignItems: 'center', gap: 16, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    borderWidth: 2, borderColor: 'transparent',
  },
  timerCardActive: { borderColor: THEME.blue, backgroundColor: '#EAF4FF' },
  timerTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  timerSince: { fontSize: 12, color: THEME.subText },
  timerDisplay: { fontSize: 40, fontWeight: '800', letterSpacing: 2 },
  timerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
  },
  timerBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1,
  },
  chipValue: { fontSize: 14, fontWeight: '800' },
  chipLabel: { fontSize: 11, color: THEME.subText, fontWeight: '500' },

  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: THEME.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  logCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 8,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  logEntry: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F8',
  },
  logIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  logType: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  logTime: { fontSize: 12, color: THEME.subText },
  logNotes: { fontSize: 12, color: THEME.primary, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0',
    alignSelf: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E', textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', color: THEME.subText },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: THEME.subText },
  notesInput: {
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12,
    padding: 12, fontSize: 14, color: '#1A1A2E',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F0F0F8', alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: THEME.subText },
  saveBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: THEME.primary, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
