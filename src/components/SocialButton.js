/**
 * @fileoverview Reusable Google Sign-In button component for the Baby Monitor app.
 *
 * Renders a pill-shaped button with a stylised Google "G" lettermark on the
 * left and a "Continue with Google" label on the right.  Shows an activity
 * indicator when `loading` is true.  Fully accessible — uses a
 * `TouchableOpacity` with appropriate `accessibilityRole` and
 * `accessibilityState`.
 *
 * Usage:
 *   <SocialButton
 *     onPress={loginWithGoogle}
 *     loading={isLoading}
 *     disabled={isLoading}
 *   />
 *
 * @module components/SocialButton
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Theme constants
// ---------------------------------------------------------------------------

const THEME = {
  primary: '#6C63FF',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subText: '#8E8EA0',
  border: '#E8E8F0',
  disabled: '#C4C4D4',
};

// ---------------------------------------------------------------------------
// Google "G" logo — approximated with styled Text
// ---------------------------------------------------------------------------

/**
 * A simple stylised "G" lettermark that approximates the Google logo.
 * Because React Native cannot import SVG directly without a transformer,
 * we render a bold letter inside a multi-coloured ring using borders.
 *
 * @returns {React.ReactElement}
 */
function GoogleLogo() {
  return (
    <View style={styles.googleLogoContainer}>
      {/* Coloured arc segments simulated via layered borders */}
      <View style={styles.googleLogoRing}>
        <Text style={styles.googleLogoLetter}>G</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SocialButton component
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SocialButtonProps
 * @property {function(): void} onPress - Callback invoked when the button is pressed.
 * @property {boolean} [loading=false] - When true, replaces the content with a spinner.
 * @property {boolean} [disabled=false] - When true, prevents interaction and dims the button.
 * @property {string} [label='Continue with Google'] - Override the button label text.
 */

/**
 * Google-branded social sign-in button.
 *
 * @param {SocialButtonProps} props
 * @returns {React.ReactElement}
 */
export default function SocialButton({
  onPress,
  loading = false,
  disabled = false,
  label = 'Continue with Google',
}) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        // ── Loading state ──────────────────────────────────────────────────
        <ActivityIndicator
          size="small"
          color={THEME.primary}
          accessibilityLabel="Signing in with Google…"
        />
      ) : (
        // ── Default state ──────────────────────────────────────────────────
        <>
          <GoogleLogo />
          <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  /** Outer pill button */
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.card,
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 20,
    gap: 12,
    // Elevation / shadow to match card depth
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  /** Dimmed when disabled */
  buttonDisabled: {
    opacity: 0.55,
  },

  // ── Google "G" logo ──────────────────────────────────────────────────────

  googleLogoContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /**
   * Circular ring using a thick border; the gradient-like appearance of the
   * real Google logo is approximated by using the brand's blue for the ring.
   */
  googleLogoRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },

  googleLogoLetter: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4285F4',
    lineHeight: 14,
    includeFontPadding: false,
  },

  // ── Label ────────────────────────────────────────────────────────────────

  label: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
    letterSpacing: 0.2,
  },

  labelDisabled: {
    color: THEME.disabled,
  },
});
