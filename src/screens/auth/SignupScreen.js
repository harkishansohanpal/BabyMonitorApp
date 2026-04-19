/**
 * @fileoverview Sign-up screen for the Baby Monitor app.
 *
 * Allows new users to create an account using email/password or Google Sign-In.
 * Features:
 * - Full Name, Email, Password (with show/hide toggle), Confirm Password inputs
 * - Inline field validation with descriptive error messages
 * - Auth error banner surfaced from AuthContext
 * - "Continue with Google" via SocialButton
 * - Loading states on both CTAs
 * - Keyboard-avoiding layout via KeyboardAvoidingView
 * - Link back to LoginScreen
 *
 * @module screens/auth/SignupScreen
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
 * Validates all sign-up form fields.
 *
 * @param {{ name: string, email: string, password: string, confirmPassword: string }} values
 * @returns {{ name?: string, email?: string, password?: string, confirmPassword?: string }}
 *   Map of field name → error message.  Empty object means all valid.
 */
function validateForm({ name, email, password, confirmPassword }) {
  /** @type {Record<string, string>} */
  const errors = {};

  if (!name.trim()) {
    errors.name = 'Full name is required.';
  } else if (name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }

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

  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// FormField sub-component
// ---------------------------------------------------------------------------

/**
 * Labelled text input with optional inline error and an optional right-side
 * action slot (used for the show/hide password toggle).
 *
 * @param {Object} props
 * @param {string} props.label - Field label text.
 * @param {string} props.value - Controlled input value.
 * @param {function(string): void} props.onChangeText - Change handler.
 * @param {string} [props.placeholder] - Placeholder hint text.
 * @param {string} [props.error] - Inline error string.
 * @param {boolean} [props.secureTextEntry] - Obscures input when true.
 * @param {string} [props.keyboardType] - React Native keyboard type.
 * @param {string} [props.autoCapitalize] - Capitalisation hint.
 * @param {string} [props.textContentType] - iOS content type hint.
 * @param {function(): void} [props.onSubmitEditing] - Return key callback.
 * @param {React.Ref<TextInput>} [props.inputRef] - Forwarded ref.
 * @param {string} [props.returnKeyType] - Return key label.
 * @param {React.ReactNode} [props.rightElement] - Optional node rendered inside right of input.
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
  rightElement,
}) {
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.inputWrapper, error ? fieldStyles.inputWrapperError : null]}>
        <TextInput
          ref={inputRef}
          style={fieldStyles.input}
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
        {rightElement || null}
      </View>
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.card,
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
  },
  inputWrapperError: {
    borderColor: THEME.error,
    backgroundColor: THEME.errorBg,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: THEME.text,
    height: '100%',
  },
  errorText: {
    fontSize: 12,
    color: THEME.error,
    marginTop: 4,
    marginLeft: 2,
  },
});

// ---------------------------------------------------------------------------
// SignupScreen
// ---------------------------------------------------------------------------

/**
 * The account creation screen.
 *
 * @param {Object} props
 * @param {import('@react-navigation/stack').StackNavigationProp<any>} props.navigation
 *   Stack navigator prop — used to navigate back to LoginScreen.
 * @returns {React.ReactElement}
 */
export default function SignupScreen({ navigation }) {
  // ── Auth context ──────────────────────────────────────────────────────
  const { signup, loginWithGoogle, loading, error, clearError } = useAuth();

  // ── Form state ────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  /** @type {[Record<string, string>, function]} */
  const [fieldErrors, setFieldErrors] = useState({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Field refs for sequential focus on return key
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  // Clear auth errors on unmount
  useEffect(() => () => clearError(), [clearError]);

  // ── Handlers ──────────────────────────────────────────────────────────

  /**
   * Validates the form and calls `signup()` on success.
   *
   * @returns {Promise<void>}
   */
  const handleCreateAccount = useCallback(async () => {
    const errors = validateForm({ name, email, password, confirmPassword });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    await signup(email.trim(), password, name.trim());
  }, [name, email, password, confirmPassword, signup]);

  /**
   * Opens the Google OAuth browser flow.
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
   * @param {string} field - Field name key.
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
            <Text style={styles.pageTitle}>Create account</Text>
            <Text style={styles.pageSubtitle}>Start monitoring your baby today</Text>
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
            {/* Full Name */}
            <FormField
              label="Full Name"
              value={name}
              onChangeText={(v) => { setName(v); clearFieldError('name'); }}
              placeholder="Jane Smith"
              autoCapitalize="words"
              textContentType="name"
              error={fieldErrors.name}
              onSubmitEditing={() => emailRef.current?.focus()}
              returnKeyType="next"
            />

            {/* Email */}
            <FormField
              label="Email"
              value={email}
              onChangeText={(v) => { setEmail(v); clearFieldError('email'); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              error={fieldErrors.email}
              inputRef={emailRef}
              onSubmitEditing={() => passwordRef.current?.focus()}
              returnKeyType="next"
            />

            {/* Password with show/hide toggle */}
            <FormField
              label="Password"
              value={password}
              onChangeText={(v) => { setPassword(v); clearFieldError('password'); }}
              placeholder="Min. 6 characters"
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              error={fieldErrors.password}
              inputRef={passwordRef}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              returnKeyType="next"
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={THEME.subText}
                  />
                </TouchableOpacity>
              }
            />

            {/* Confirm Password with show/hide toggle */}
            <FormField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearFieldError('confirmPassword'); }}
              placeholder="Re-enter your password"
              secureTextEntry={!showConfirmPassword}
              textContentType="newPassword"
              error={fieldErrors.confirmPassword}
              inputRef={confirmPasswordRef}
              onSubmitEditing={handleCreateAccount}
              returnKeyType="done"
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={THEME.subText}
                  />
                </TouchableOpacity>
              }
            />

            {/* ── Create Account button ── */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonLoading]}
              onPress={handleCreateAccount}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create Account"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
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

          {/* ── Sign-in link ── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.footerLink}> Sign In</Text>
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

  // ── Header ────────────────────────────────────────────────────────────────

  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
  },

  headerEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },

  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: 0.5,
    marginBottom: 14,
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
