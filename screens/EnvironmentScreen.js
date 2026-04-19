import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Switch,
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
  teal: '#009688',
};

// ─────────────────────────────────────────────
// Safe ranges for a baby's room
// ─────────────────────────────────────────────
const SAFE_RANGES = {
  temperature: { min: 18, max: 22, unit: '°C', optimal: 20 },
  humidity: { min: 40, max: 60, unit: '%', optimal: 50 },
  co2: { min: 0, max: 1000, unit: 'ppm', optimal: 400 },
  noise: { min: 0, max: 50, unit: 'dB', optimal: 30 },
};

// ─────────────────────────────────────────────
// Gauge Component
// ─────────────────────────────────────────────
function Gauge({ value, min, max, unit, color }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeBg}>
        <Animated.View style={[styles.gaugeFill, { width, backgroundColor: color }]} />
      </View>
      <Text style={[styles.gaugeValue, { color }]}>
        {value}
        <Text style={styles.gaugeUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────
function getStatus(key, value) {
  const r = SAFE_RANGES[key];
  if (value < r.min) return { label: 'Too Low', color: THEME.blue, icon: 'arrow-down-circle' };
  if (value > r.max) return { label: 'Too High', color: THEME.red, icon: 'arrow-up-circle' };
  return { label: 'Optimal', color: THEME.green, icon: 'checkmark-circle' };
}

// ─────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────
function MetricCard({ metricKey, label, value, icon, color }) {
  const status = getStatus(metricKey, value);
  const range = SAFE_RANGES[metricKey];

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metricLabel}>{label}</Text>
          <View style={styles.statusRow}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={[styles.metricValue, { color }]}>
          {value}
          <Text style={styles.metricUnit}>{range.unit}</Text>
        </Text>
      </View>
      <Gauge value={value} min={range.min - (range.max - range.min) * 0.2} max={range.max + (range.max - range.min) * 0.2} unit={range.unit} color={color} />
      <Text style={styles.rangeHint}>
        Safe range: {range.min}–{range.max}{range.unit}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// History sparkline (simple bar chart)
// ─────────────────────────────────────────────
function Sparkline({ data, color }) {
  const max = Math.max(...data);
  return (
    <View style={styles.sparkline}>
      {data.map((v, i) => (
        <View
          key={i}
          style={[
            styles.sparkBar,
            {
              height: `${(v / max) * 100}%`,
              backgroundColor: color,
              opacity: i === data.length - 1 ? 1 : 0.4 + i * 0.07,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
// Recommendation Card
// ─────────────────────────────────────────────
function Recommendation({ icon, title, desc, color }) {
  return (
    <View style={[styles.recCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.recTitle}>{title}</Text>
        <Text style={styles.recDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function EnvironmentScreen() {
  // Simulated live sensor data (±small drift every 3s)
  const [metrics, setMetrics] = useState({
    temperature: 22.5,
    humidity: 54,
    co2: 680,
    noise: 38,
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Simulated data history (last 8 readings)
  const [history] = useState({
    temperature: [21.5, 21.8, 22.1, 22.0, 22.3, 22.4, 22.6, 22.5],
    humidity: [50, 51, 52, 53, 54, 55, 54, 54],
    co2: [620, 640, 660, 670, 675, 680, 678, 680],
    noise: [30, 32, 35, 38, 40, 38, 37, 38],
  });

  // Auto-refresh: small random drift simulation
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setMetrics((m) => ({
        temperature: +(m.temperature + (Math.random() - 0.5) * 0.4).toFixed(1),
        humidity: Math.round(Math.max(30, Math.min(80, m.humidity + (Math.random() - 0.5) * 2))),
        co2: Math.round(Math.max(300, Math.min(1500, m.co2 + (Math.random() - 0.5) * 30))),
        noise: Math.round(Math.max(20, Math.min(80, m.noise + (Math.random() - 0.5) * 4))),
      }));
      setLastUpdated(new Date());
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const tempStatus = getStatus('temperature', metrics.temperature);
  const allGood = ['temperature', 'humidity', 'co2', 'noise'].every(
    (k) => getStatus(k, metrics[k]).label === 'Optimal'
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Overall Status Banner ── */}
        <View style={[styles.banner, { backgroundColor: allGood ? THEME.green : THEME.orange }]}>
          <Ionicons name={allGood ? 'shield-checkmark' : 'warning'} size={28} color="#fff" />
          <View>
            <Text style={styles.bannerTitle}>{allGood ? 'Room Environment is Safe' : 'Attention Needed'}</Text>
            <Text style={styles.bannerSub}>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.autoRefreshRow}>
            <Text style={styles.autoRefreshLabel}>Live</Text>
            <Switch
              value={autoRefresh}
              onValueChange={setAutoRefresh}
              trackColor={{ true: 'rgba(255,255,255,0.5)' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── Metric Cards ── */}
        <Text style={styles.sectionTitle}>Sensor Readings</Text>
        <MetricCard
          metricKey="temperature"
          label="Room Temperature"
          value={metrics.temperature}
          icon="thermometer"
          color={THEME.orange}
        />
        <MetricCard
          metricKey="humidity"
          label="Humidity"
          value={metrics.humidity}
          icon="water"
          color={THEME.blue}
        />
        <MetricCard
          metricKey="co2"
          label="CO₂ Level"
          value={metrics.co2}
          icon="leaf"
          color={THEME.teal}
        />
        <MetricCard
          metricKey="noise"
          label="Noise Level"
          value={metrics.noise}
          icon="volume-medium"
          color={THEME.primary}
        />

        {/* ── Trend Chart ── */}
        <Text style={styles.sectionTitle}>Temperature Trend (last 8 readings)</Text>
        <View style={styles.chartCard}>
          <Sparkline data={history.temperature} color={THEME.orange} />
          <View style={styles.chartLabels}>
            {history.temperature.map((v, i) => (
              <Text key={i} style={styles.chartLabel}>{v}°</Text>
            ))}
          </View>
        </View>

        {/* ── Recommendations ── */}
        <Text style={styles.sectionTitle}>Recommendations</Text>
        <Recommendation
          icon="thermometer-outline"
          title="Ideal Temperature"
          desc="Keep the room between 18–22°C for safe infant sleep. Avoid over-heating."
          color={THEME.orange}
        />
        <Recommendation
          icon="water-outline"
          title="Humidity Tips"
          desc="40–60% humidity prevents dry air that can irritate baby's airways. Use a cool-mist humidifier if needed."
          color={THEME.blue}
        />
        <Recommendation
          icon="leaf-outline"
          title="Air Circulation"
          desc="Open a window briefly if CO₂ rises above 1000 ppm. Avoid direct drafts on the baby."
          color={THEME.teal}
        />
        <Recommendation
          icon="volume-off-outline"
          title="Noise Management"
          desc="Keep ambient noise below 50 dB for quality sleep. White noise machines at 60 dB are acceptable."
          color={THEME.primary}
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FE' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  banner: {
    borderRadius: 18, padding: 16, flexDirection: 'row',
    alignItems: 'center', gap: 12, marginBottom: 20,
  },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  autoRefreshRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoRefreshLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12, marginTop: 4 },

  metricCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  metricLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricUnit: { fontSize: 13, fontWeight: '400' },

  gaugeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gaugeBg: { flex: 1, height: 8, backgroundColor: '#F0F0F8', borderRadius: 4, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 4 },
  gaugeValue: { fontSize: 13, fontWeight: '700', minWidth: 56, textAlign: 'right' },
  gaugeUnit: { fontSize: 11, fontWeight: '400' },
  rangeHint: { fontSize: 11, color: '#8E8EA0' },

  chartCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, gap: 6,
  },
  sparkline: { height: 60, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  sparkBar: { flex: 1, borderRadius: 3 },
  chartLabels: { flexDirection: 'row', gap: 4 },
  chartLabel: { flex: 1, fontSize: 9, color: '#8E8EA0', textAlign: 'center' },

  recCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderLeftWidth: 3, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  recTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  recDesc: { fontSize: 12, color: '#8E8EA0', lineHeight: 18 },
});
