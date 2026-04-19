/**
 * @fileoverview Cry Alerts screen — microphone monitoring + alert history.
 *
 * Reads sensitivity, vibration, pushNotifications, and cryCooldown
 * from the global SettingsContext so preferences are managed in SettingsScreen.
 *
 * @module screens/AlertsScreen
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Vibration,
  Alert,
  Animated,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { getAlerts, createAlert, resolveAlert as resolveAlertApi, clearAlerts } from '../src/services/api';
import { useSettings } from '../src/context/SettingsContext';

// ── Design tokens ─────────────────────────────────────────────────────────────

const THEME = {
  primary:      '#6C63FF',
  primaryLight: '#EEF0FF',
  background:   '#F2F2F7',
  card:         '#FFFFFF',
  text:         '#1A1A2E',
  subText:      '#8E8EA0',
  green:        '#34C759',
  orange:       '#FF9500',
  red:          '#FF3B30',
  separator:    '#E5E5EA',
};

// ── Helper: format backend alert → UI shape ───────────────────────────────────

function formatAlert(a) {
  const d   = new Date(a.created_at);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return {
    id:         String(a.id),
    type:       a.type || 'cry',
    intensity:  a.intensity || 'Medium',
    time,
    duration:   '--',
    resolved:   a.resolved,
    soundLevel: a.sound_level,
  };
}

const INTENSITY_COLOR = { High: THEME.red,    Medium: THEME.orange, Low: THEME.green };
const INTENSITY_BG    = { High: '#FEECEC',    Medium: '#FFF3E0',    Low: '#E8F5E9'  };

// ── Waveform visualizer ───────────────────────────────────────────────────────

function Waveform({ active }) {
  const bars = Array.from({ length: 16 }, () => useRef(new Animated.Value(0.2)).current);

  useEffect(() => {
    if (!active) {
      bars.forEach((b) =>
        Animated.timing(b, { toValue: 0.2, duration: 200, useNativeDriver: true }).start()
      );
      return;
    }
    bars.forEach((bar, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue:  0.3 + Math.random() * 0.7,
            duration: 200 + i * 30,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue:  0.1 + Math.random() * 0.3,
            duration: 200 + i * 30,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [active]);

  return (
    <View style={styles.waveform}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              backgroundColor: active ? THEME.primary : THEME.separator,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Alert Item ────────────────────────────────────────────────────────────────

function AlertItem({ item, onResolve }) {
  const color = INTENSITY_COLOR[item.intensity] ?? THEME.orange;
  const bg    = INTENSITY_BG[item.intensity]    ?? '#FFF3E0';
  return (
    <View style={[styles.alertItem, item.resolved && styles.alertItemResolved]}>
      <View style={[styles.alertIcon, { backgroundColor: bg }]}>
        <Ionicons
          name={item.type === 'cry' ? 'sad' : 'volume-high'}
          size={18}
          color={color}
        />
      </View>
      <View style={styles.alertBody}>
        <View style={styles.alertTopRow}>
          <Text style={styles.alertType}>
            {item.type === 'cry' ? 'Baby Crying' : 'Loud Noise'}
          </Text>
          <View style={[styles.intensityBadge, { backgroundColor: bg }]}>
            <Text style={[styles.intensityText, { color }]}>{item.intensity}</Text>
          </View>
        </View>
        <Text style={styles.alertMeta}>{item.time} · {item.duration}</Text>
      </View>
      {!item.resolved ? (
        <TouchableOpacity onPress={() => onResolve(item.id)} style={styles.resolveBtn}>
          <Ionicons name="checkmark" size={16} color="#fff" />
        </TouchableOpacity>
      ) : (
        <Ionicons name="checkmark-circle" size={20} color={THEME.green} />
      )}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyAlerts() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="notifications-off-outline" size={32} color={THEME.subText} />
      </View>
      <Text style={styles.emptyTitle}>No alerts yet</Text>
      <Text style={styles.emptySubtitle}>
        Start monitoring to detect crying sounds and see alerts here.
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const { settings } = useSettings();

  // Destructure settings we care about
  const sensitivityKey   = settings.sensitivity   ?? 'medium';
  const vibrateEnabled   = settings.vibration     ?? true;
  const pushEnabled      = settings.pushNotifications ?? true;
  const cryCooldownSec   = settings.cryCooldown   ?? 8;

  // Sensitivity threshold map (lowercase keys to match settings values)
  const SENSITIVITY_THRESHOLD = { low: 0.4, medium: 0.6, high: 0.75 };
  const sensitivityThreshold = SENSITIVITY_THRESHOLD[sensitivityKey] ?? 0.6;

  const [isListening,   setIsListening]  = useState(false);
  const [soundLevel,    setSoundLevel]   = useState(0);
  const [alerts,        setAlerts]       = useState([]);
  const [roomId,        setRoomId]       = useState(settings.defaultRoom || 'nursery');
  const [roomInput,     setRoomInput]    = useState(settings.defaultRoom || 'nursery');
  const [isRefreshing,  setIsRefreshing] = useState(false);

  const recordingRef  = useRef(null);
  const pollRef       = useRef(null);
  const lastAlertRef  = useRef(0); // timestamp of last triggered alert

  // ── Backend: fetch alerts ─────────────────────────────────────────────────

  const fetchAlerts = useCallback(async (room = roomId, silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const rows = await getAlerts(room, 50);
      setAlerts(rows.map(formatAlert));
    } catch (err) {
      if (!silent) console.warn('fetchAlerts error', err.message);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [roomId]);

  // Poll every 10 s
  useEffect(() => {
    fetchAlerts(roomId, false);
    pollRef.current = setInterval(() => fetchAlerts(roomId, true), 10000);
    return () => clearInterval(pollRef.current);
  }, [roomId]);

  function applyRoom() {
    const r = roomInput.trim() || 'nursery';
    setRoomId(r);
  }

  // ── Microphone monitoring ─────────────────────────────────────────────────

  const startListening = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: { extension: '.m4a', outputFormat: 2, audioEncoder: 3, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100, numberOfChannels: 1, bitRate: 128000,
          linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false,
        },
        web: {},
      });
      rec.setOnRecordingStatusUpdate((status) => {
        if (status.metering != null) {
          const level = Math.max(0, Math.min(1, (status.metering + 80) / 80));
          setSoundLevel(level);
          if (level > sensitivityThreshold) triggerCryAlert(level);
        }
      });
      rec.setProgressUpdateInterval(100);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsListening(true);
    } catch (e) {
      Alert.alert('Permission Error', 'Microphone access is required for cry detection.');
    }
  };

  const stopListening = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
    setIsListening(false);
    setSoundLevel(0);
  };

  const triggerCryAlert = async (level) => {
    const now = Date.now();
    const cooldownMs = (cryCooldownSec || 8) * 1000;
    if (now - lastAlertRef.current < cooldownMs) return;
    lastAlertRef.current = now;

    const intensity = level > 0.75 ? 'High' : level > 0.6 ? 'Medium' : 'Low';

    // Optimistic UI
    const tempId    = 'temp-' + now;
    const optimistic = {
      id: tempId, type: 'cry', intensity,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: '--', resolved: false,
    };
    setAlerts((prev) => [optimistic, ...prev]);

    // Persist to backend
    try {
      await createAlert({ roomId, type: 'cry', intensity, soundLevel: level });
      fetchAlerts(roomId, true);
    } catch (err) {
      console.warn('createAlert error', err.message);
    }

    if (vibrateEnabled) Vibration.vibrate([0, 300, 100, 300]);
    if (pushEnabled) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Baby Crying!',
          body:  `${intensity} intensity cry detected. Check on your baby.`,
          sound: true,
        },
        trigger: null,
      });
    }
  };

  const resolveAlert = async (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true } : a)));
    try {
      await resolveAlertApi(id);
    } catch (err) {
      console.warn('resolveAlert error', err.message);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: false } : a)));
    }
  };

  const handleClearAll = () => {
    Alert.alert('Clear Alerts', 'Remove all alerts for this room?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          setAlerts([]);
          try { await clearAlerts(roomId); } catch (err) { console.warn('clearAlerts error', err.message); }
        },
      },
    ]);
  };

  useEffect(() => () => {
    stopListening();
    clearInterval(pollRef.current);
  }, []);

  const unresolved = alerts.filter((a) => !a.resolved).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchAlerts(roomId, false)}
            tintColor={THEME.primary}
          />
        }
        ListEmptyComponent={<EmptyAlerts />}
        ListHeaderComponent={() => (
          <View style={styles.header}>

            {/* Monitoring Card */}
            <View style={[styles.card, styles.monitorCard, isListening && styles.monitorCardActive]}>
              <View style={styles.monitorInfo}>
                <View style={[styles.monitorIconCircle, { backgroundColor: isListening ? THEME.primaryLight : '#F2F2F7' }]}>
                  <Ionicons name="mic" size={20} color={isListening ? THEME.primary : THEME.subText} />
                </View>
                <View>
                  <Text style={styles.monitorTitle}>Sound Monitoring</Text>
                  <Text style={styles.monitorSubtitle}>
                    {isListening ? `Listening · ${sensitivityKey} sensitivity` : 'Tap to start monitoring'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.monitorToggle, isListening ? styles.monitorStop : styles.monitorStart]}
                onPress={isListening ? stopListening : startListening}
                activeOpacity={0.8}
              >
                <Ionicons name={isListening ? 'stop' : 'mic'} size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Waveform Card */}
            <View style={[styles.card, styles.waveformCard]}>
              <Waveform active={isListening} />
              <View style={styles.soundBarRow}>
                <Text style={styles.soundBarLabel}>Sound Level</Text>
                <View style={styles.soundBarBg}>
                  <View
                    style={[
                      styles.soundBarFill,
                      {
                        width: `${Math.round(soundLevel * 100)}%`,
                        backgroundColor: soundLevel > 0.75
                          ? THEME.red
                          : soundLevel > 0.5
                            ? THEME.orange
                            : THEME.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.soundBarValue}>{Math.round(soundLevel * 100)}%</Text>
              </View>
            </View>

            {/* Room selector */}
            <View style={[styles.card, styles.roomCard]}>
              <Ionicons name="home-outline" size={16} color={THEME.subText} />
              <TextInput
                style={styles.roomInput}
                value={roomInput}
                onChangeText={setRoomInput}
                placeholder="Room name"
                placeholderTextColor={THEME.subText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={applyRoom}
              />
              <TouchableOpacity style={styles.roomApplyBtn} onPress={applyRoom}>
                <Text style={styles.roomApplyText}>Go</Text>
              </TouchableOpacity>
            </View>

            {/* Alert list header */}
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Alert History</Text>
              {unresolved > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unresolved} unresolved</Text>
                </View>
              )}
              {alerts.length > 0 && (
                <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
                  <Ionicons name="trash-outline" size={15} color={THEME.red} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        renderItem={({ item }) => <AlertItem item={item} onResolve={resolveAlert} />}
        contentContainerStyle={styles.content}
        style={styles.list}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: THEME.background },
  list:    { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header:  { gap: 12, marginBottom: 8 },

  // Shared card shell
  card: {
    backgroundColor: THEME.card,
    borderRadius:    16,
    shadowColor:     '#000',
    shadowOpacity:   0.05,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       2,
  },

  // Monitor card
  monitorCard: {
    padding:        18,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderWidth:    1.5,
    borderColor:    'transparent',
  },
  monitorCardActive: {
    borderColor:     THEME.primary,
    backgroundColor: '#F5F4FF',
  },
  monitorInfo: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    flex:          1,
  },
  monitorIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  monitorTitle:    { fontSize: 15, fontWeight: '700', color: THEME.text,    marginBottom: 2 },
  monitorSubtitle: { fontSize: 12, color: THEME.subText },
  monitorToggle: {
    width: 50, height: 50, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  monitorStart: { backgroundColor: THEME.primary },
  monitorStop:  { backgroundColor: THEME.red },

  // Waveform card
  waveformCard: { padding: 16, gap: 12 },
  waveform: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, height: 48, paddingHorizontal: 4,
  },
  waveBar: {
    flex: 1, height: 48, borderRadius: 3,
  },
  soundBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  soundBarLabel: { fontSize: 12, color: THEME.subText, width: 80 },
  soundBarBg: {
    flex: 1, height: 8,
    backgroundColor: '#F0F0F8', borderRadius: 4, overflow: 'hidden',
  },
  soundBarFill:  { height: '100%', borderRadius: 4 },
  soundBarValue: { fontSize: 12, fontWeight: '700', color: THEME.primary, width: 34, textAlign: 'right' },

  // Room card
  roomCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: THEME.separator,
  },
  roomInput: { flex: 1, fontSize: 14, color: THEME.text },
  roomApplyBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
  },
  roomApplyText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Alert list header
  listHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: THEME.text, flex: 1 },
  badge: {
    backgroundColor: THEME.red,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  clearBtn: { padding: 4 },

  // Alert item
  alertItem: {
    backgroundColor: THEME.card,
    borderRadius:    14,
    padding:         14,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    marginBottom:    8,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 1 },
    elevation:       1,
  },
  alertItemResolved: { opacity: 0.6 },
  alertIcon: {
    width: 42, height: 42, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  alertBody:  { flex: 1, gap: 3 },
  alertTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertType:  { fontSize: 14, fontWeight: '700', color: THEME.text },
  alertMeta:  { fontSize: 12, color: THEME.subText },
  intensityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  intensityText:  { fontSize: 11, fontWeight: '700' },
  resolveBtn: {
    backgroundColor: THEME.green,
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: '#F2F2F7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: THEME.text,    marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: THEME.subText, textAlign: 'center', lineHeight: 20 },
});
