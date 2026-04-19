import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FEEDING_TYPES = ['Breast L', 'Breast R', 'Bottle', 'Solid'];

export default function SleepTrackerScreen() {
  const [sleeping, setSleeping] = useState(false);
  const [sleepStart, setSleepStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState([
    { type: 'sleep', duration: '1h 45m', time: '10:30 AM' },
    { type: 'feed', note: 'Breast L — 15 min', time: '9:00 AM' },
    { type: 'sleep', duration: '2h 10m', time: '6:30 AM' },
  ]);
  const [feedNote, setFeedNote] = useState('');
  const intervalRef = useRef(null);

  useEffect(() => {
    if (sleeping) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [sleeping]);

  const formatTime = secs => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  };

  const toggleSleep = () => {
    if (!sleeping) {
      setSleeping(true);
      setSleepStart(new Date());
      setElapsed(0);
    } else {
      setSleeping(false);
      setSessions(prev => [{ type: 'sleep', duration: formatTime(elapsed), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...prev]);
    }
  };

  const logFeeding = type => {
    setSessions(prev => [{ type: 'feed', note: type, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...prev]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sleep Timer */}
      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>{sleeping ? 'Sleeping for' : 'Baby is Awake'}</Text>
        <Text style={styles.timerValue}>{sleeping ? formatTime(elapsed) : '--'}</Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: sleeping ? '#FF6B6B' : '#6C63FF' }]} onPress={toggleSleep}>
          <Ionicons name={sleeping ? 'stop-circle' : 'moon'} size={20} color="#fff" />
          <Text style={styles.btnText}>{sleeping ? 'End Sleep' : 'Start Sleep'}</Text>
        </TouchableOpacity>
      </View>

      {/* Feeding Log */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Log Feeding</Text>
        <View style={styles.feedButtons}>
          {FEEDING_TYPES.map(t => (
            <TouchableOpacity key={t} style={styles.feedBtn} onPress={() => logFeeding(t)}>
              <Text style={styles.feedBtnText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Log</Text>
        {sessions.map((s, i) => (
          <View key={i} style={styles.logRow}>
            <Ionicons name={s.type === 'sleep' ? 'moon' : 'nutrition'} size={18} color={s.type === 'sleep' ? '#4ECDC4' : '#FF9800'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.logMain}>{s.type === 'sleep' ? `Sleep — ${s.duration}` : `Feeding — ${s.note}`}</Text>
              <Text style={styles.logTime}>{s.time}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FE' },
  content: { padding: 20, gap: 16 },
  timerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  timerLabel: { fontSize: 14, color: '#8E8EA0', marginBottom: 8 },
  timerValue: { fontSize: 48, fontWeight: '700', color: '#1A1A2E', marginBottom: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  feedButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  feedBtn: { backgroundColor: '#F0EEFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  feedBtnText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F8' },
  logMain: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  logTime: { fontSize: 12, color: '#8E8EA0', marginTop: 2 },
});
