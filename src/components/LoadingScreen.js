/**
 * @fileoverview Full-screen loading/splash component for the Baby Monitor app.
 *
 * Displayed while Firebase resolves the initial auth state on app launch.
 * Renders a purple background with a large baby emoji, the app title, and a
 * subtle `ActivityIndicator` to signal that work is in progress.
 *
 * Usage (in App.js):
 *   if (loading) return <LoadingScreen />;
 *
 * @module components/LoadingScreen
 */

import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const THEME = {
  primary: '#6C63FF',
  primaryDark: '#5A52E0',
  white: '#FFFFFF',
  whiteAlpha60: 'rgba(255,255,255,0.6)',
};

// ---------------------------------------------------------------------------
// LoadingScreen component
// ---------------------------------------------------------------------------

/**
 * Full-screen loading component shown during the auth state resolution phase.
 *
 * Features a gentle fade-in animation on mount so the transition from the
 * native splash screen feels smooth.
 *
 * @returns {React.ReactElement}
 */
export default function LoadingScreen() {
  /**
   * Animated value driving the fade-in of the entire card.
   * @type {Animated.Value}
   */
  const fadeAnim = useRef(new Animated.Value(0)).current;

  /**
   * Animated value driving the subtle floating movement of the emoji.
   * @type {Animated.Value}
   */
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Infinite gentle float for the emoji
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim, floatAnim]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.View
        style={[styles.content, { opacity: fadeAnim }]}
        accessibilityLabel="Baby Monitor loading"
        accessibilityRole="progressbar"
      >
        {/* ── Baby emoji ── */}
        <Animated.Text
          style={[styles.emoji, { transform: [{ translateY: floatAnim }] }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          👶
        </Animated.Text>

        {/* ── App title ── */}
        <Text style={styles.title}>Baby Monitor</Text>
        <Text style={styles.subtitle}>Keeping watch, so you can rest</Text>

        {/* ── Spinner ── */}
        <ActivityIndicator
          size="small"
          color={THEME.whiteAlpha60}
          style={styles.spinner}
          accessibilityLabel="Loading, please wait"
        />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  emoji: {
    fontSize: 72,
    marginBottom: 24,
    // Text shadow to give the emoji a slight lift effect
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.white,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: THEME.whiteAlpha60,
    textAlign: 'center',
    marginBottom: 48,
    letterSpacing: 0.3,
  },

  spinner: {
    transform: [{ scale: 1.2 }],
  },
});
