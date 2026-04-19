/**
 * @fileoverview Login screen for the Baby Monitor app.
 *
 * Provides email/password authentication and Google Sign-In via the
 * `useAuth()` hook.  Features:
 * - App logo (baby emoji + title) at the top
 * - Inline form validation (email format, password length)
 * - Red error banner for auth failures surfaced from AuthContext
 * - Loading states on both the primary CTA and Google button
 * - Keyboard-avoiding behaviour via `KeyboardAvoidingView`
 * - Link to the SignupScreen
 *
 * @module screens/auth/LoginScreen
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import SocialButton from '../../components/SocialButton';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const THEME = {
  primary: '#6C63FF',
  primaryLight: '#EEF0FF',
  background: '#F8F9FE',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subText: '#8E8EA0',
  border: '#E8E8F0',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  inactive: '#C4C4D4',
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates the login form fields.
 *
 * @param {{ email: string, password: string }} values - Form field values.
 * @returns {{ email?: string, password?: string }} Map of field name to error message.
 *   An empty object means validation passed.
 */
function validateForm({ email, password }) {
  /** @type {{ email?: string, password?: string }} */
  const errors = {};

  if (!email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a labelled text input with an optional inline error message.
 *
 * @param {Object} props
 * @param {string} props.label - Field label shown above the input.
 * @param {string} props.value - Current field value.
 * @param {function(string): void} props.onChangeText - Change handler.
 * @param {string} [props.placeholder] - Placeholder text.
 * @param {string} [props.error] - Inline error message (shown below input).
 * @param {boolean} [props.secureTextEntry] - Whether to obscure input.
 * @param {string} [props.keyboardType] - React Native keyboard type.
 * @param {string} [props.autoCapitalize] - Auto-capitalisation behaviour.
 * @param {boolean} [props.autoComplete] - Auto-complete hint.
 * @param {string} [props.textContentType] - iOS content type hint.
 * @param {function(): void} [props.onSubmitEditing] - Called on keyboard 'Return'.
 * @param {React.Ref} [props.inputRef] - Forwarded ref for focus management.
 * @param {string} [props.returnKeyType] - Return key label.
 * @returns {React.ReactElement}
 */
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'none',
  textContentType,
  onSubmitEditing,
  inputRef,
  returnKeyType = 'next',
}) {
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[fieldStyles.input, error ? fieldStyles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.inactive}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={textContentType}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        blurOnSubmit={returnKeyType === 'done'}
      />
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: THEME.card,
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 15,
    color: THEME.text,
  },
  inputError: {
    borderColor: THEME.error,
    backgroundColor: THEME.errorBg,
  },
  errorText: {
    fontSize: 12,
    color: THEME.error,
    marginTop: 4,
    marginLeft: 2,
  },
});

// ---------------------------------------------------------------------------
// LoginScreen
// ---------------------------------------------------------------------------

/**
 * The main login screen component.
 *
 * @param {Object} props
 * @param {import('@react-navigation/stack').StackNavigationProp<any>} props.navigation
 *   React Navigation stack navigator prop — used to navigate to SignupScreen.
 * @returns {React.ReactElement}
 */
export default function LoginScreen({ navigation }) {
  // ── Auth context ──────────────────────────────────────────────────────
  const { login, loginWithGoogle, loading, error, clearError } = useAuth();

  // ── Local form state ──────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** @type {[{ email?: string, password?: string }, function]} */
  const [fieldErrors, setFieldErrors] = useState({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Ref for password field so we can focus it from the email return key
  const passwordRef = React.useRef(null);

  // Clear auth error when navigating away or when user starts typing
  useEffect(() => () => clearError(), [clearError]);

  // ── Handlers ──────────────────────────────────────────────────────────

  /**
   * Validates the form and, if valid, calls `login()` from AuthContext.
   *
   * @returns {void}
   */
  const handleSignIn = useCallback(async () => {
    const errors = validateForm({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    await login(email.trim(), password);
  }, [email, password, login]);

  /**
   * Initiates the Google Sign-In flow via AuthContext.
   * Manages a local `googleLoading` flag for the button spinner.
   *
   * @returns {Promise<void>}
   */
  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle]);

  /**
   * Clears a specific field's inline error when the user starts editing.
   *
   * @param {'email'|'password'} field
   * @returns {void}
   */
  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── App Header ── */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>👶</Text>
            <Text style={styles.appTitle}>Baby Monitor</Text>
            <Text style={styles.pageTitle}>Welcome back</Text>
            <Text style={styles.pageSubtitle}>Sign in to continue monitoring</Text>
          </View>

          {/* ── Auth Error Banner ── */}
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={THEME.error} />
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={THEME.error} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── Form Card ── */}
          <View style={styles.card}>
            <FormField
              label="Email"
              value={email}
              onChangeText={(v) => { setEmail(v); clearFieldError('email'); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              error={fieldErrors.email}
              onSubmitEditing={() => passwordRef.current?.focus()}
              returnKeyType="next"
            />

            <FormField
              label="Password"
              value={password}
              onChangeText={(v) => { setPassword(v); clearFieldError('password'); }}
              placeholder="Min. 6 characters"
              secureTextEntry
              textContentType="password"
              error={fieldErrors.password}
              inputRef={passwordRef}
              onSubmitEditing={handleSignIn}
              returnKeyType="done"
            />

            {/* ── Sign In button ── */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonLoading]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* ── Divider ── */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* ── Google button ── */}
            <SocialButton
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              disabled={loading || googleLoading}
            />
          </View>

          {/* ── Sign-up link ── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.footerLink}> Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.background,
  },

  kav: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  // ── App Header ────────────────────────────────────────────────────────────

  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
  },

  headerEmoji: {
    fontSize: 52,
    marginBottom: 10,
  },

  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: 0.5,
    marginBottom: 16,
  },

  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 6,
  },

  pageSubtitle: {
    fontSize: 14,
    color: THEME.subText,
    fontWeight: '400',
  },

  // ── Error banner ──────────────────────────────────────────────────────────

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.errorBg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },

  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: THEME.error,
    fontWeight: '500',
  },

  // ── Form card ─────────────────────────────────────────────────────────────

  card: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 24,
  },

  // ── Primary button ────────────────────────────────────────────────────────

  primaryButton: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: THEME.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  primaryButtonLoading: {
    opacity: 0.75,
  },

  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Divider ───────────────────────────────────────────────────────────────

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.border,
  },

  dividerLabel: {
    fontSize: 13,
    color: THEME.subText,
    fontWeight: '500',
    marginHorizontal: 12,
  },

  // ── Footer link ───────────────────────────────────────────────────────────

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  footerText: {
    fontSize: 14,
    color: THEME.subText,
  },

  footerLink: {
    fontSize: 14,
    color: THEME.primary,
    fontWeight: '700',
  },
});
