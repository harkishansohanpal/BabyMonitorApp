/**
 * @fileoverview Settings screen — Apple-style grouped settings UI.
 *
 * Sections:
 *   MONITOR      — Default Room, Video Quality
 *   DETECTION    — Sensitivity, Cry Cooldown
 *   NOTIFICATIONS — Push Alerts, Vibration
 *   ABOUT        — Version, App name
 *
 * @module screens/SettingsScreen
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2F2F7',
  card:        '#FFFFFF',
  primary:     '#6C63FF',
  text:        '#000000',
  secondary:   '#8E8EA0',
  separator:   '#E5E5EA',
  destructive: '#FF3B30',
  green:       '#34C759',
};

// ── Reusable sub-components ───────────────────────────────────────────────────

/**
 * Section container with ALL-CAPS header label.
 */
function Section({ label, children }) {
  return (
    <View style={styles.section}>
      {label ? <Text style={styles.sectionHeader}>{label}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * A standard row with icon, label, and a right-side control.
 * Shows a separator below unless `last` is true.
 */
function Row({ icon, iconColor = C.primary, iconBg, label, sublabel, last, children }) {
  const bg = iconBg ?? iconColor + '22';
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.rowLabel}>
        <Text style={styles.rowText}>{label}</Text>
        {sublabel ? <Text style={styles.rowSubText}>{sublabel}</Text> : null}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

/**
 * Segmented control rendered inline inside a settings row.
 */
function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        const isFirst = i === 0;
        const isLast  = i === options.length - 1;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.segBtn,
              isFirst && styles.segBtnFirst,
              isLast  && styles.segBtnLast,
              active  && styles.segBtnActive,
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const { user, logout, deleteAccount } = useAuth();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase();

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  }

  function handleDeleteAccount() {
    // Two-step confirmation — first alert explains the consequences
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  }

  async function confirmDelete() {
    const result = await deleteAccount();
    if (result.requiresReauth) {
      Alert.alert(
        'Sign In Required',
        'For security, deleting your account requires a recent sign-in. You\'ve been signed out — please sign back in and try again.',
        [{ text: 'OK' }]
      );
    }
  }

  const qualityOptions = [
    { label: 'Low',    value: 'low'    },
    { label: 'Medium', value: 'medium' },
    { label: 'High',   value: 'high'   },
  ];

  const sensitivityOptions = [
    { label: 'Low',    value: 'low'    },
    { label: 'Medium', value: 'medium' },
    { label: 'High',   value: 'high'   },
  ];

  const cooldownOptions = [
    { label: '8s',  value: 8  },
    { label: '15s', value: 15 },
    { label: '30s', value: 30 },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ACCOUNT ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            {user?.displayName ? (
              <Text style={styles.profileName}>{user.displayName}</Text>
            ) : null}
            <Text style={styles.profileEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <Section>
          <TouchableOpacity
            style={[styles.row, !false && styles.rowBorder, { minHeight: 52, paddingHorizontal: 14, gap: 12 }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="log-out-outline" size={17} color={C.destructive} />
            </View>
            <Text style={[styles.rowText, { color: C.destructive, fontWeight: '500' }]}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, { minHeight: 52, paddingHorizontal: 14, gap: 12 }]}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="trash-outline" size={17} color={C.destructive} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: C.destructive, fontWeight: '500' }]}>Delete Account</Text>
              <Text style={styles.rowSubText}>Permanently removes your account and data</Text>
            </View>
          </TouchableOpacity>
        </Section>

        {/* ── MONITOR ── */}
        <Section label="MONITOR">
          {/* Default Room */}
          <Row icon="home" iconColor="#6C63FF" label="Default Room">
            <TextInput
              style={styles.textInput}
              value={settings.defaultRoom}
              onChangeText={(v) => updateSetting('defaultRoom', v)}
              placeholder="nursery"
              placeholderTextColor={C.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              textAlign="right"
            />
          </Row>

          {/* Video Quality */}
          <Row icon="videocam" iconColor="#5856D6" label="Video Quality" last>
            <Segmented
              options={qualityOptions}
              value={settings.videoQuality}
              onChange={(v) => updateSetting('videoQuality', v)}
            />
          </Row>
        </Section>

        {/* ── DETECTION ── */}
        <Section label="DETECTION">
          {/* Sensitivity */}
          <Row icon="ear" iconColor="#FF9500" label="Sensitivity">
            <Segmented
              options={sensitivityOptions}
              value={settings.sensitivity}
              onChange={(v) => updateSetting('sensitivity', v)}
            />
          </Row>

          {/* Cry Cooldown */}
          <Row icon="timer-outline" iconColor="#FF3B30" label="Cry Cooldown" last>
            <Segmented
              options={cooldownOptions}
              value={settings.cryCooldown}
              onChange={(v) => updateSetting('cryCooldown', v)}
            />
          </Row>
        </Section>

        {/* ── NOTIFICATIONS ── */}
        <Section label="NOTIFICATIONS">
          {/* Push Alerts */}
          <Row icon="notifications" iconColor="#34C759" label="Push Alerts">
            <Switch
              value={settings.pushNotifications}
              onValueChange={(v) => updateSetting('pushNotifications', v)}
              trackColor={{ false: C.separator, true: C.green }}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </Row>

          {/* Vibration */}
          <Row icon="phone-portrait-outline" iconColor="#007AFF" label="Vibration" last>
            <Switch
              value={settings.vibration}
              onValueChange={(v) => updateSetting('vibration', v)}
              trackColor={{ false: C.separator, true: '#007AFF' }}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </Row>
        </Section>

        {/* ── ABOUT ── */}
        <Section label="ABOUT">
          {/* Version */}
          <Row icon="information-circle" iconColor="#8E8EA0" iconBg="#F2F2F7" label="Version">
            <Text style={styles.rowValue}>1.0.0</Text>
          </Row>

          {/* App name */}
          <Row icon="heart" iconColor="#FF2D55" label="Baby Monitor App" last>
            <Text style={styles.rowValue}>Made with love</Text>
          </Row>
        </Section>

        <Text style={styles.footer}>Baby Monitor App © 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingVertical: 20, paddingHorizontal: 16, paddingBottom: 40 },

  section:       { marginBottom: 8 },
  sectionHeader: {
    fontSize:      12,
    fontWeight:    '600',
    color:         C.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom:  6,
    marginLeft:    4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius:    12,
    overflow:        'hidden',
    shadowColor:     '#000',
    shadowOpacity:   0.06,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       2,
  },

  row: {
    flexDirection:  'row',
    alignItems:     'center',
    minHeight:      52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.separator,
  },
  rowIcon: {
    width:         32,
    height:        32,
    borderRadius:  8,
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
  },
  rowLabel: { flex: 1 },
  rowText:    { fontSize: 15, color: C.text, fontWeight: '400' },
  rowSubText: { fontSize: 12, color: C.secondary, marginTop: 1 },
  rowControl: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '55%' },
  rowValue:   { fontSize: 14, color: C.secondary },

  textInput: {
    fontSize:  14,
    color:     C.text,
    minWidth:  80,
    textAlign: 'right',
  },

  segmented: {
    flexDirection:  'row',
    borderRadius:   8,
    borderWidth:    1,
    borderColor:    C.separator,
    overflow:       'hidden',
    backgroundColor:'#F2F2F7',
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRightWidth:  0.5,
    borderRightColor:  C.separator,
  },
  segBtnFirst: { borderLeftWidth: 0 },
  segBtnLast:  { borderRightWidth: 0 },
  segBtnActive: {
    backgroundColor: C.primary,
  },
  segBtnText: {
    fontSize:   12,
    fontWeight: '600',
    color:      C.secondary,
  },
  segBtnTextActive: { color: '#fff' },

  footer: {
    textAlign:   'center',
    color:       C.secondary,
    fontSize:    12,
    marginTop:   24,
  },

  profileCard: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            14,
    backgroundColor: C.card,
    borderRadius:   16,
    padding:        16,
    marginBottom:   8,
    shadowColor:    '#000',
    shadowOpacity:  0.06,
    shadowRadius:   8,
    shadowOffset:   { width: 0, height: 2 },
    elevation:      2,
  },
  profileAvatar: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: '#6C63FF',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  profileInitials: {
    color:      '#fff',
    fontSize:   19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color:    C.secondary,
  },
});
