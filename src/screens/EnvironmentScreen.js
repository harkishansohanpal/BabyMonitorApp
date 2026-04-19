import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Simulate live sensor readings (replace with real sensor data via WebSocket)
function useSensorData() {
  const [data, setData] = useState({ temp: 22.4, humidity: 54, noise: 32, light: 'Low' });
  useEffect(() => {
    const interval = setInterval(() => {
      setData(d => ({
        temp: parseFloat((d.temp + (Math.random() - 0.5) * 0.2).toFixed(1)),
        humidity: Math.round(d.humidity + (Math.random() - 0.5) * 1),
        noise: Math.round(d.noise + (Math.random() - 0.5) * 5),
        light: d.light,
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);
  return data;
}

function getStatus(key, value) {
  if (key === 'temp') return value < 18 ? { label: 'Cold', color: '#45B7D1' } : value > 24 ? { label: 'Warm', color: '#FF6B6B' } : { label: 'Good', color: '#4CAF50' };
  if (key === 'humidity') return value < 40 ? { label: 'Dry', color: '#FF9800' } : value > 65 ? { label: 'Humid', color: '#45B7D1' } : { label: 'Good', color: '#4CAF50' };
  if (key === 'noise') return value > 60 ? { label: 'Loud', color: '#FF6B6B' } : value > 40 ? { label: 'Moderate', color: '#FF9800' } : { label: 'Quiet', color: '#4CAF50' };
  return { label: 'OK', color: '#4CAF50' };
}

function SensorCard({ icon, title, value, unit, statusKey }) {
  const status = getStatus(statusKey, value);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={22} color={status.color} />
        <Text style={[styles.statusBadge, { backgroundColor: status.color + '20', color: status.color }]}>{status.label}</Text>
      </View>
      <Text style={styles.cardValue}>{value}<Text style={styles.cardUnit}> {unit}</Text></Text>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );
}

export default function EnvironmentScreen() {
  const sensors = useSensorData();
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.updated}>Last updated: {now}</Text>
      <View style={styles.grid}>
        <SensorCard icon="thermometer" title="Temperature" value={sensors.temp} unit="°C" statusKey="temp" />
        <SensorCard icon="water" title="Humidity" value={sensors.humidity} unit="%" statusKey="humidity" />
        <SensorCard icon="volume-medium" title="Noise Level" value={sensors.noise} unit="dB" statusKey="noise" />
        <SensorCard icon="sunny" title="Light Level" value={sensors.light} unit="" statusKey="light" />
      </View>

      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>💡 Ideal Baby Room Conditions</Text>
        <Text style={styles.tip}>• Temperature: 18–22°C</Text>
        <Text style={styles.tip}>• Humidity: 40–60%</Text>
        <Text style={styles.tip}>• Noise: below 40 dB</Text>
        <Text style={styles.tip}>• Light: dim during sleep</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FE' },
  content: { padding: 20 },
  updated: { fontSize: 12, color: '#8E8EA0', marginBottom: 16, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '47%', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardValue: { fontSize: 28, fontWeight: '700', color: '#1A1A2E' },
  cardUnit: { fontSize: 14, fontWeight: '400', color: '#8E8EA0' },
  cardTitle: { fontSize: 12, color: '#8E8EA0', marginTop: 4 },
  tips: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 10 },
  tip: { fontSize: 14, color: '#8E8EA0', lineHeight: 24 },
});
