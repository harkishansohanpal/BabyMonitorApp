import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const THEME = {
  primary: '#6C63FF',
  background: '#F8F9FE',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subText: '#8E8EA0',
};

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const name = user?.displayName?.split(' ')[0] || 'Parent';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hello, {name} 👋</Text>
      <Text style={styles.subtitle}>Here's how baby is doing today.</Text>

      <View style={styles.grid}>
        <StatCard icon="videocam" label="Camera" value="Online" color="#6C63FF" />
        <StatCard icon="moon" label="Sleep" value="6h 20m" color="#4ECDC4" />
        <StatCard icon="thermometer" label="Room Temp" value="22°C" color="#FF6B6B" />
        <StatCard icon="water" label="Humidity" value="55%" color="#45B7D1" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Alerts</Text>
        <View style={styles.alertItem}>
          <Ionicons name="notifications" size={18} color="#FF6B6B" />
          <Text style={styles.alertText}>Cry detected — 2 hours ago</Text>
        </View>
        <View style={styles.alertItem}>
          <Ionicons name="moon" size={18} color="#4ECDC4" />
          <Text style={styles.alertText}>Baby fell asleep — 3 hours ago</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content: { padding: 20 },
  greeting: { fontSize: 24, fontWeight: '700', color: THEME.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: THEME.subText, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 16,
    width: '47%',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardValue: { fontSize: 22, fontWeight: '700', color: THEME.text, marginTop: 8 },
  cardLabel: { fontSize: 12, color: THEME.subText, marginTop: 2 },
  section: { backgroundColor: THEME.card, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 12 },
  alertItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F8' },
  alertText: { fontSize: 14, color: THEME.text },
});
