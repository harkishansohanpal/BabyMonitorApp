/**
 * @fileoverview Authentication context for the Baby Monitor app.
 *
 * Provides a React context and `AuthProvider` component that manages:
 * - Firebase auth state (the raw `firebaseUser` object)
 * - Backend user profile (the `user` object returned by our API)
 * - Loading state during async auth resolution
 * - Error state for surfacing auth failures to the UI
 *
 * All auth actions (login, signup, Google login, logout) are exposed through
 * the context so any component can trigger them without prop-drilling.
 *
 * Usage:
 *   // Wrap the root of your app:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 *
 *   // Consume in any child component:
 *   const { user, login, logout } = useAuth();
 *
 * @module context/AuthContext
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  auth,
  onAuthStateChanged,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogleNative,
  GoogleStatusCodes,
  signOut as firebaseSignOut,
  deleteAccount as firebaseDeleteAccount,
} from '../services/firebase';
import { verifyWithServer, getProfile } from '../services/api';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AuthState
 * @property {import('../services/api').BackendUser|null} user
 *   The backend user profile (null when not signed in or still loading).
 * @property {import('firebase/auth').User|null} firebaseUser
 *   The raw Firebase user object (null when not signed in).
 * @property {boolean} loading
 *   True while Firebase is resolving the initial auth state or while an
 *   auth action (login / signup / logout) is in progress.
 * @property {string|null} error
 *   Human-readable error message from the last failed auth action, or null.
 */

/**
 * @typedef {Object} AuthActions
 * @property {function(string, string): Promise<void>} login
 *   Signs in with email and password.
 * @property {function(string, string, string): Promise<void>} signup
 *   Creates a new account with email, password, and display name.
 * @property {function(): Promise<void>} loginWithGoogle
 *   Initiates the Google OAuth flow via expo-auth-session.
 * @property {function(): Promise<void>} logout
 *   Signs out the current user and clears all auth state.
 * @property {function(): void} clearError
 *   Resets the error state to null (call when navigating away from an error).
 */

/**
 * Combined auth context type.
 *
 * @typedef {AuthState & AuthActions} AuthContextValue
 */

/**
 * The React context object.  Never consumed directly — use `useAuth()`.
 *
 * @type {React.Context<AuthContextValue>}
 */
const AuthContext = createContext(/** @type {AuthContextValue} */ ({}));

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

/**
 * `AuthProvider` wraps the application and keeps Firebase auth state in sync
 * with the backend.  Place it as high in the tree as possible (typically in
 * `App.js`).
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components that can access auth.
 * @returns {React.ReactElement}
 */
export function AuthProvider({ children }) {
  // ── State ──────────────────────────────────────────────────────────────
  /** @type {[import('../services/api').BackendUser|null, function]} */
  const [user, setUser] = useState(null);

  /** @type {[import('firebase/auth').User|null, function]} */
  const [firebaseUser, setFirebaseUser] = useState(null);

  /** @type {[boolean, function]} */
  const [loading, setLoading] = useState(true);

  /** @type {[string|null, function]} */
  const [error, setError] = useState(null);

  // (Google Sign-In is handled natively via @react-native-google-signin/google-signin)

  /**
   * Ref to track whether the component is still mounted, preventing state
   * updates on an unmounted provider (rare but possible during dev HMR).
   *
   * @type {React.MutableRefObject<boolean>}
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Firebase auth state listener ────────────────────────────────────────

  /**
   * Syncs Firebase auth state changes to context state.
   * When a user is detected:
   *   1. Gets a fresh ID token.
   *   2. Calls `verifyWithServer` to upsert the backend profile.
   *   3. Updates `user` and `firebaseUser` state.
   * When signed out, clears all user state.
   */
  useEffect(() => {
    logger.info('AuthContext: subscribing to Firebase auth state');

    const unsubscribe = onAuthStateChanged(async (fbUser) => {
      if (!mountedRef.current) return;

      if (fbUser) {
        logger.info('AuthContext: Firebase user detected', { uid: fbUser.uid });

        // Always set the Firebase user immediately so the app is usable.
        if (mountedRef.current) {
          setFirebaseUser(fbUser);
          setError(null);
        }

        // Attempt to sync with backend. If the server is not yet deployed
        // (NETWORK_ERROR, 404, 5xx) we fall back to a Firebase-only profile
        // so the app remains functional without a running backend.
        try {
          const idToken = await fbUser.getIdToken();
          const backendProfile = await verifyWithServer(idToken);
          if (mountedRef.current) {
            setUser(backendProfile);
          }
        } catch (err) {
          const isAuthError = err?.code === 'UNAUTHORIZED' || err?.status === 401;
          if (isAuthError) {
            // Server explicitly rejected the token — sign out.
            logger.error('AuthContext: server rejected token, signing out', err);
            if (mountedRef.current) {
              await firebaseSignOut(auth).catch(() => {});
              setFirebaseUser(null);
              setUser(null);
              setError('Session verification failed. Please sign in again.');
            }
          } else {
            // Backend unreachable (not deployed yet) — use Firebase profile.
            logger.warn('AuthContext: backend unavailable, using Firebase profile', err);
            if (mountedRef.current) {
              setUser({
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: fbUser.displayName || fbUser.email,
                role: 'parent',
                _source: 'firebase',
              });
            }
          }
        }
      } else {
        logger.info('AuthContext: no Firebase user (signed out)');
        if (mountedRef.current) {
          setFirebaseUser(null);
          setUser(null);
        }
      }

      if (mountedRef.current) {
        setLoading(false);
      }
    });

    return () => {
      logger.info('AuthContext: unsubscribing from Firebase auth state');
      unsubscribe();
    };
  }, []);


  // ── Auth actions ────────────────────────────────────────────────────────

  /**
   * Signs the user in using email and password.
   * Sets `loading` during the async call; surfaces errors via `error` state.
   *
   * @param {string} email - The user's email address.
   * @param {string} password - The user's password.
   * @returns {Promise<void>}
   */
  const login = useCallback(async (email, password) => {
    logger.info('AuthContext.login', { email });
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      // onAuthStateChanged handles setUser / setLoading(false)
    } catch (err) {
      logger.error('AuthContext.login: failed', err);
      if (mountedRef.current) {
        setError(humaniseFirebaseError(err));
        setLoading(false);
      }
    }
  }, []);

  /**
   * Creates a new account and signs the user in.
   *
   * @param {string} email - The new user's email address.
   * @param {string} password - Desired password (min 6 characters).
   * @param {string} displayName - The user's full name.
   * @returns {Promise<void>}
   */
  const signup = useCallback(async (email, password, displayName) => {
    logger.info('AuthContext.signup', { email, displayName });
    setError(null);
    setLoading(true);
    try {
      await signUpWithEmail(email, password, displayName);
      // onAuthStateChanged handles setUser / setLoading(false)
    } catch (err) {
      logger.error('AuthContext.signup: failed', err);
      if (mountedRef.current) {
        setError(humaniseFirebaseError(err));
        setLoading(false);
      }
    }
  }, []);

  /**
   * Native Google Sign-In via @react-native-google-signin/google-signin.
   * Shows the system account picker, exchanges the ID token with Firebase.
   *
   * @returns {Promise<void>}
   */
  const loginWithGoogle = useCallback(async () => {
    logger.info('AuthContext.loginWithGoogle: starting native sign-in');
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogleNative();
      // onAuthStateChanged handles setUser / setLoading(false)
    } catch (err) {
      // Ignore cancellation — user just closed the picker
      if (err?.code === GoogleStatusCodes.SIGN_IN_CANCELLED) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      logger.error('AuthContext.loginWithGoogle: failed', err);
      if (mountedRef.current) {
        setError(humaniseFirebaseError(err) || 'Google sign-in failed. Please try again.');
        setLoading(false);
      }
    }
  }, []);

  /**
   * Signs the currently authenticated user out of both Firebase and clears
   * all local auth state.
   *
   * @returns {Promise<void>}
   */
  const logout = useCallback(async () => {
    logger.info('AuthContext.logout');
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will clear user/firebaseUser and setLoading(false)
    } catch (err) {
      logger.error('AuthContext.logout: failed', err);
      if (mountedRef.current) {
        setError('Sign out failed. Please try again.');
        setLoading(false);
      }
    }
  }, []);

  /**
   * Permanently deletes the current user's Firebase account.
   *
   * Firebase requires a recent sign-in (within ~5 minutes) to delete an account.
   * If the session is stale, Firebase throws `auth/requires-recent-login`.
   * We handle that by signing the user out so they can re-authenticate, then
   * try again — the returned boolean tells the caller which path was taken.
   *
   * @returns {Promise<{ deleted: boolean, requiresReauth: boolean }>}
   */
  const deleteAccount = useCallback(async () => {
    logger.info('AuthContext.deleteAccount');
    setLoading(true);
    try {
      await firebaseDeleteAccount();
      // onAuthStateChanged fires → clears user state automatically
      return { deleted: true, requiresReauth: false };
    } catch (err) {
      logger.error('AuthContext.deleteAccount: failed', err);
      if (err?.code === 'auth/requires-recent-login') {
        // Sign them out so they can re-authenticate and try again
        await firebaseSignOut(auth).catch(() => {});
        if (mountedRef.current) {
          setFirebaseUser(null);
          setUser(null);
          setLoading(false);
        }
        return { deleted: false, requiresReauth: true };
      }
      if (mountedRef.current) {
        setError('Could not delete account. Please try again.');
        setLoading(false);
      }
      return { deleted: false, requiresReauth: false };
    }
  }, []);

  /**
   * Clears the current error message.  Call this when the user dismisses an
   * error banner or navigates to a new screen.
   *
   * @returns {void}
   */
  const clearError = useCallback(() => setError(null), []);

  // ── Memoised context value ──────────────────────────────────────────────

  /**
   * The value provided to all consumers of AuthContext.
   * Memoised to prevent unnecessary re-renders when unrelated state changes.
   */
  const contextValue = useMemo(
    () => ({
      // State
      user,
      firebaseUser,
      loading,
      error,
      // Actions
      login,
      signup,
      loginWithGoogle,
      logout,
      deleteAccount,
      clearError,
    }),
    [user, firebaseUser, loading, error, login, signup, loginWithGoogle, logout, deleteAccount, clearError],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the current authentication context value.
 * Must be called inside a component tree wrapped by `AuthProvider`.
 *
 * @returns {AuthContextValue} The current auth state and action functions.
 * @throws {Error} If called outside of `AuthProvider`.
 *
 * @example
 * function ProfileButton() {
 *   const { user, logout } = useAuth();
 *   return <Button title={user?.displayName} onPress={logout} />;
 * }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx || ctx.login === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps Firebase auth error codes to friendly, user-facing messages.
 *
 * @param {import('firebase/auth').AuthError|Error} err - The caught error.
 * @returns {string} A human-readable error message.
 */
function humaniseFirebaseError(err) {
  /** @type {Record<string, string>} */
  const messages = {
    'auth/invalid-email': 'The email address is badly formatted.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/user-not-found': 'No account found with that email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests': 'Too many failed attempts. Please wait and try again.',
    'auth/popup-closed-by-user': 'Sign-in cancelled.',
    'auth/cancelled-popup-request': 'Sign-in cancelled.',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
  };

  const code = err?.code;
  return (code && messages[code]) || err?.message || 'An unexpected error occurred.';
}

export default AuthContext;
