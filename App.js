/**
 * @fileoverview Root application component for Baby Monitor.
 *
 * Responsibilities:
 *  1. Wrap the entire app in required providers:
 *     - GestureHandlerRootView  (react-native-gesture-handler)
 *     - SafeAreaProvider        (react-native-safe-area-context)
 *     - AuthProvider            (our Firebase auth context)
 *     - NavigationContainer     (@react-navigation)
 *
 *  2. Gate navigation based on auth state:
 *     - Loading  → LoadingScreen   (while Firebase resolves the session)
 *     - No user  → AuthNavigator   (Login / Signup)
 *     - User     → AppNavigator    (the 5-tab main app)
 *
 * This file contains no business logic — it only wires together top-level
 * providers and decides which navigator to render.
 *
 * @module App
 */

import React, { useEffect } from 'react';
import { NavigationContainer }      from '@react-navigation/native';
import { SafeAreaProvider }         from 'react-native-safe-area-context';
import { GestureHandlerRootView }   from 'react-native-gesture-handler';
import * as Notifications           from 'expo-notifications';

import { AuthProvider, useAuth }    from './src/context/AuthContext';
import { SettingsProvider }         from './src/context/SettingsContext';
import AppNavigator                 from './src/navigation/AppNavigator';
import AuthNavigator                from './src/navigation/AuthNavigator';
import LoadingScreen                from './src/components/LoadingScreen';

// Tell expo-notifications how to handle incoming notifications when the app is foregrounded.
// Without this, scheduled notifications are silently dropped on iOS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation theme — matches the app's purple palette so the background
// between screens does not flash white during transitions.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_THEME = {
  dark:   false,
  colors: {
    primary:      '#6C63FF',
    background:   '#F8F9FE',
    card:         '#FFFFFF',
    text:         '#1A1A2E',
    border:       '#E8E8F0',
    notification: '#F44336',
  },
  // React Navigation v7 requires a `fonts` field in the theme object.
  // Without it, HeaderTitle.js crashes accessing `fonts.bold`.
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium:  { fontFamily: 'System', fontWeight: '500' },
    bold:    { fontFamily: 'System', fontWeight: '700' },
    heavy:   { fontFamily: 'System', fontWeight: '900' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RootNavigator
// Reads auth state from context and renders the appropriate navigator.
// Must be rendered inside AuthProvider so useAuth() has access to the context.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RootNavigator — decides which navigator to show based on auth state.
 *
 * Rendering is split from App so that AuthProvider is always above
 * the consumers in the component tree.
 *
 * @returns {React.ReactElement}
 */
function RootNavigator() {
  const { user, loading } = useAuth();

  // While Firebase is resolving the persisted auth session, show a splash screen.
  // This prevents a flash of the Login screen for already-logged-in users.
  if (loading) return <LoadingScreen />;

  // `user` is the backend profile object (set after verifyWithServer succeeds).
  // If null, the user is not authenticated → show auth flow.
  return user ? <AppNavigator /> : <AuthNavigator />;
}

// ─────────────────────────────────────────────────────────────────────────────
// App — Root component exported to Expo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * App — the top-level component registered with Expo.
 *
 * Provider order matters:
 *  1. GestureHandlerRootView — outermost, required for gesture recognition.
 *  2. SafeAreaProvider       — provides safe area insets to all descendants.
 *  3. AuthProvider           — initialises Firebase listener, exposes auth state.
 *  4. NavigationContainer    — manages navigation state.
 *  5. RootNavigator          — conditionally renders auth or app navigator.
 *
 * @returns {React.ReactElement}
 */
export default function App() {
  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <NavigationContainer theme={NAV_THEME}>
              <RootNavigator />
            </NavigationContainer>
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
