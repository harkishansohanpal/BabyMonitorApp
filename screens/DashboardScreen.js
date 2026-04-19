import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
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
};

// ─────────────────────────────────────────────
// Status Card Component
// ─────────────────────────────────────────────
function StatusCard({ icon, label, value, color, unit }) {
  return (
    <View style={[styles.statusCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>
        {value}
        <Text style={styles.statusUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Quick Action Button
// ─────────────────────────────────────────────
function QuickAction({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// Pulse indicator for live status
// ─────────────────────────────────────────────
function PulseIndicator({ active }) {
  const pulse = new Animated.Value(1);

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Animated.View
        style={[
          styles.pulseDot,
          { backgroundColor: active ? THEME.green : THEME.subText, transform: [{ scale: pulse }] },
        ]}
      />
      <Text style={[styles.statusText, { color: active ? THEME.green : THEME.subText }]}>
        {active ? 'Monitoring Active' : 'Monitoring Paused'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastCry, setLastCry] = useState('2 mins ago');
  const [babyStatus, setBabyStatus] = useState('Sleeping');

  // Mock real-time status cycling
  const statuses = ['Sleeping', 'Awake', 'Crying', 'Sleeping'];
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % statuses.length;
      setBabyStatus(statuses[i]);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const statusColor =
    babyStatus === 'Sleeping' ? THEME.green :
    babyStatus === 'Awake'    ? THEME.blue  :
    THEME.red;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Hero Status Banner ── */}
        <View style={[styles.heroBanner, { backgroundColor: THEME.primary }]}>
          <View>
            <Text style={styles.heroLabel}>Baby Status</Text>
            <Text style={styles.heroStatus}>{babyStatus} 💤</Text>
            <PulseIndicator active={isMonitoring} />
          </View>
          <TouchableOpacity
            style={[styles.monitorToggle, { backgroundColor: isMonitoring ? THEME.red : THEME.green }]}
            onPress={() => setIsMonitoring(!isMonitoring)}
          >
            <Ionicons name={isMonitoring ? 'pause' : 'play'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Environment Stats Row ── */}
        <Text style={styles.sectionTitle}>Current Readings</Text>
        <View style={styles.statsRow}>
          <StatusCard icon="thermometer" label="Room Temp" value="22.5" unit="°C" color={THEME.orange} />
          <StatusCard icon="water" label="Humidity" value="54" unit="%" color={THEME.blue} />
          <StatusCard icon="leaf" label="Air Quality" value="Good" unit="" color={THEME.green} />
        </View>

        {/* ── Alert Summary ── */}
        <View style={styles.alertSummary}>
          <Ionicons name="notifications" size={18} color={THEME.primary} />
          <Text style={styles.alertSummaryText}>Last cry detected: <Text style={{ fontWeight: '700', color: THEME.primary }}>{lastCry}</Text></Text>
          <TouchableOpacity onPress={() => navigation.navigate('Alerts')}>
            <Text style={styles.viewAll}>View all →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            icon="videocam"
            label="Live Feed"
            color={THEME.primary}
            onPress={() => navigation.navigate('Live Camera')}
          />
          <QuickAction
            icon="notifications"
            label="Alerts"
            color={THEME.red}
            onPress={() => navigation.navigate('Alerts')}
          />
          <QuickAction
            icon="moon"
            label="Sleep Log"
            color={THEME.blue}
            onPress={() => navigation.navigate('Sleep')}
          />
          <QuickAction
            icon="thermometer"
            label="Environment"
            color={THEME.orange}
            onPress={() => navigation.navigate('Environment')}
          />
        </View>

        {/* ── Today Summary ── */}
        <Text style={styles.sectionTitle}>Today's Summary</Text>
        <View style={styles.summaryCard}>
          <SummaryRow icon="moon-outline" label="Total Sleep" value="6h 20m" color={THEME.blue} />
          <SummaryRow icon="restaurant-outline" label="Feedings" value="4 times" color={THEME.green} />
          <SummaryRow icon="alert-circle-outline" label="Cry Events" value="3 alerts" color={THEME.red} />
          <SummaryRow icon="happy-outline" label="Awake Time" value="2h 10m" color={THEME.orange} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ icon, label, value, color }) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FE' },
  container: { flex: 1, backgroundColor: '#F8F9FE' },
  content: { padding: 16, paddingBottom: 32 },

  heroBanner: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 },
  heroStatus: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  monitorToggle: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#1A1A2E',
    marginBottom: 12, marginTop: 4,
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statusCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderLeftWidth: 3, alignItems: 'flex-start', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statusLabel: { fontSize: 11, color: '#8E8EA0', fontWeight: '500' },
  statusValue: { fontSize: 15, fontWeight: '800' },
  statusUnit: { fontSize: 11, fontWeight: '400' },

  alertSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEF0FF', borderRadius: 12, padding: 12, marginBottom: 20,
  },
  alertSummaryText: { flex: 1, fontSize: 13, color: '#1A1A2E' },
  viewAll: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },

  quickActionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20,
  },
  quickAction: {
    width: '45%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  quickActionIcon: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  quickActionLabel: { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  summaryLabel: { flex: 1, fontSize: 14, color: '#1A1A2E', fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
});
