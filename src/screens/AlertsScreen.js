import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_ALERTS = [
  { id: '1', type: 'cry', message: 'Cry detected (loud)', time: '2 min ago', level: 'high' },
  { id: '2', type: 'cry', message: 'Cry detected (soft)', time: '1 hr ago', level: 'medium' },
  { id: '3', type: 'sleep', message: 'Baby fell asleep', time: '2 hr ago', level: 'info' },
  { id: '4', type: 'temp', message: 'Room temperature high (26°C)', time: '3 hr ago', level: 'medium' },
  { id: '5', type: 'cry', message: 'Cry detected (loud)', time: '5 hr ago', level: 'high' },
  { id: '6', type: 'sleep', message: 'Wake-up detected', time: '6 hr ago', level: 'info' },
];

const ICON_MAP = { cry: 'alert-circle', sleep: 'moon', temp: 'thermometer' };
const COLOR_MAP = { high: '#FF6B6B', medium: '#FF9800', info: '#4ECDC4' };

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  const renderItem = ({ item }) => (
    <View style={[styles.alertRow, { borderLeftColor: COLOR_MAP[item.level], borderLeftWidth: 4 }]}>
      <Ionicons name={ICON_MAP[item.type]} size={22} color={COLOR_MAP[item.level]} />
      <View style={styles.alertInfo}>
        <Text style={styles.alertMessage}>{item.message}</Text>
        <Text style={styles.alertTime}>{item.time}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recent Alerts</Text>
        <TouchableOpacity onPress={() => setAlerts([])}>
          <Text style={styles.clearBtn}>Clear All</Text>
        </TouchableOpacity>
      </View>
      {alerts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#C4C4D4" />
          <Text style={styles.emptyText}>No alerts — all clear!</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FE' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F8' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  clearBtn: { fontSize: 14, color: '#FF6B6B', fontWeight: '600' },
  list: { padding: 16 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  alertInfo: { flex: 1 },
  alertMessage: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  alertTime: { fontSize: 12, color: '#8E8EA0', marginTop: 2 },
  separator: { height: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: '#8E8EA0' },
});
