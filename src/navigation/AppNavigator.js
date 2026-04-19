/**
 * @fileoverview Main app bottom-tab navigator for authenticated users.
 *
 * Tabs:
 *   Live Camera — WebRTC video feed
 *   Cry Alerts  — Sound monitoring & alert history
 *   Settings    — App settings, profile, and sign out
 *
 * @module navigation/AppNavigator
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

// ── Screen imports ────────────────────────────────────────────────────────────
import VideoFeedScreen from '../../screens/VideoFeedScreen';
import AlertsScreen    from '../../screens/AlertsScreen';
import SettingsScreen  from '../../screens/SettingsScreen';

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEME = {
  primary:  '#6C63FF',
  card:     '#FFFFFF',
  inactive: '#C4C4D4',
};

function tabIcon(routeName, focused) {
  const map = {
    'Live Camera': focused ? 'videocam'      : 'videocam-outline',
    Alerts:        focused ? 'notifications' : 'notifications-outline',
    Settings:      focused ? 'settings'      : 'settings-outline',
  };
  return map[routeName] ?? 'ellipse-outline';
}

// ── Navigator ─────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  true,
      }),
    });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          // ── Header ────────────────────────────────────────────────────────
          headerStyle: {
            backgroundColor: THEME.primary,
            shadowOpacity:   0,
            elevation:       0,
          },
          headerTintColor:  '#fff',
          headerTitleStyle: { fontWeight: '700', fontSize: 17, letterSpacing: 0.3 },

          // ── Tab bar ───────────────────────────────────────────────────────
          tabBarStyle: {
            backgroundColor: THEME.card,
            borderTopWidth:  0,
            height:          56 + insets.bottom,
            paddingBottom:   insets.bottom,
            paddingTop:      8,
            shadowColor:     '#000',
            shadowOpacity:   0.08,
            shadowRadius:    12,
            shadowOffset:    { width: 0, height: -3 },
            elevation:       12,
          },
          tabBarActiveTintColor:   THEME.primary,
          tabBarInactiveTintColor: THEME.inactive,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
          tabBarHideOnKeyboard: true,

          // ── Icon ──────────────────────────────────────────────────────────
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
              <Ionicons name={tabIcon(route.name, focused)} size={22} color={color} />
            </View>
          ),
        })}
      >
        <Tab.Screen
          name="Live Camera"
          component={VideoFeedScreen}
          options={{ title: 'Live Camera' }}
        />
        <Tab.Screen
          name="Alerts"
          component={AlertsScreen}
          options={{ title: 'Cry Alerts' }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  iconWrapper: {
    width:          44,
    height:         28,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: '#EEF0FF',
  },
});
