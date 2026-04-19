/**
 * @fileoverview Firebase Web SDK (v10 modular API) initialisation and auth helpers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO GET YOUR FIREBASE CONFIG VALUES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Go to https://console.firebase.google.com and open (or create) your project.
 * 2. Click the gear icon → "Project settings".
 * 3. Under "Your apps" click the "</>" (Web) icon to register a web app.
 * 4. Firebase will display a `firebaseConfig` object — copy those values into
 *    your `.env` file at the project root:
 *
 *      EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
 *      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
 *      EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-app
 *      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
 *      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
 *      EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc...
 *
 * 5. For Google Sign-In you also need your Expo OAuth Client ID:
 *    - Create an OAuth 2.0 client in Google Cloud Console for your project.
 *    - Add the Expo proxy redirect URI: https://auth.expo.io/@<username>/<slug>
 *      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE ON GOOGLE SIGN-IN IN EXPO GO:
 * `@react-native-firebase` requires a native build (EAS Build / bare workflow).
 * For Expo Go compatibility we use `expo-auth-session` with the Google provider
 * which performs OAuth through the system browser and hands back an ID token
 * that we exchange with Firebase using `signInWithCredential`.
 *
 * @module services/firebase
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  deleteUser as firebaseDeleteUser,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Safely import GoogleSignin — it requires a native build and won't exist in Expo Go on iOS.
let GoogleSignin = null;
let GoogleStatusCodes = {};
const isGoogleSignInAvailable = !!NativeModules.RNGoogleSignin;

if (isGoogleSignInAvailable) {
  try {
    const gsModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = gsModule.GoogleSignin;
    GoogleStatusCodes = gsModule.statusCodes;
  } catch (_e) {
    // Native module not available (Expo Go on iOS)
  }
}

import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Expo Web Browser warm-up (required for expo-auth-session)
// ---------------------------------------------------------------------------

/**
 * Warms up the device browser so the OAuth flow opens faster.
 * Must be called before `useGoogleAuthRequest` is invoked.
 */
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Firebase app initialisation
// ---------------------------------------------------------------------------

/**
 * Firebase project configuration.
 * All values are read from Expo public environment variables so that
 * no secrets are hard-coded in source control.
 *
 * @type {import('firebase/app').FirebaseOptions}
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Singleton Firebase app instance.
 * We guard against double-initialisation (can happen with Fast Refresh).
 *
 * @type {import('firebase/app').FirebaseApp}
 */
const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

/**
 * Firebase Authentication instance bound to the singleton app.
 *
 * We always attempt `initializeAuth` with AsyncStorage persistence so that
 * the session survives app restarts on iOS and Android.
 *
 * If the auth instance was already created (Fast Refresh / module hot-reload),
 * `initializeAuth` throws — we catch that and fall back to `getAuth` which
 * returns the existing instance.  This is safer than the `isNewApp` flag
 * approach because Firebase's internal app registry can persist across Fast
 * Refresh cycles while the JS module scope does not.
 *
 * @type {import('firebase/auth').Auth}
 */
let auth;
try {
  auth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (_e) {
  // Auth already initialised — reuse the existing instance.
  auth = getAuth(firebaseApp);
}
export { auth };

// ---------------------------------------------------------------------------
// Email / Password helpers
// ---------------------------------------------------------------------------

/**
 * Signs an existing user in using email and password.
 *
 * @param {string} email - The user's email address.
 * @param {string} password - The user's plain-text password.
 * @returns {Promise<import('firebase/auth').UserCredential>} Firebase UserCredential.
 * @throws {import('firebase/auth').AuthError} On invalid credentials or network failure.
 */
export async function signInWithEmail(email, password) {
  logger.info('signInWithEmail: attempting sign-in', { email });
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    logger.info('signInWithEmail: success', { uid: credential.user.uid });
    return credential;
  } catch (err) {
    logger.error('signInWithEmail: failed', err);
    throw err;
  }
}

/**
 * Creates a new Firebase account with email, password, and an optional
 * display name.  The display name is set via `updateProfile` immediately
 * after account creation.
 *
 * @param {string} email - The new user's email address.
 * @param {string} password - The desired password (min 6 chars enforced by Firebase).
 * @param {string} [displayName=''] - Human-readable name shown in the UI.
 * @returns {Promise<import('firebase/auth').UserCredential>} Firebase UserCredential.
 * @throws {import('firebase/auth').AuthError} On duplicate email, weak password, etc.
 */
export async function signUpWithEmail(email, password, displayName = '') {
  logger.info('signUpWithEmail: creating account', { email, displayName });
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    logger.info('signUpWithEmail: success', { uid: credential.user.uid });
    return credential;
  } catch (err) {
    logger.error('signUpWithEmail: failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Google Sign-In (native — @react-native-google-signin/google-signin)
// ---------------------------------------------------------------------------

// Configure once at module load time (only when native module is available).
if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId:   process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId:   process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
    scopes:        ['profile', 'email'],
  });
}

export { GoogleStatusCodes, isGoogleSignInAvailable };

/**
 * Native Google Sign-In using @react-native-google-signin/google-signin.
 * Shows the system Google account picker, gets an ID token, and exchanges
 * it for a Firebase credential. Requires a dev/production build (not Expo Go).
 *
 * @returns {Promise<import('firebase/auth').UserCredential>}
 * @throws If the user cancels (code === GoogleStatusCodes.SIGN_IN_CANCELLED) or on error.
 */
export async function signInWithGoogleNative() {
  if (!GoogleSignin || !isGoogleSignInAvailable) {
    throw Object.assign(
      new Error('Google Sign-In is not available in Expo Go on iOS. Please use email/password sign-in, or install the full app build.'),
      { code: 'NOT_AVAILABLE' },
    );
  }
  logger.info('signInWithGoogleNative: starting');
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success') {
    throw Object.assign(new Error('Google sign-in cancelled'), {
      code: GoogleStatusCodes.SIGN_IN_CANCELLED,
    });
  }
  const { idToken } = response.data;
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, googleCredential);
  logger.info('signInWithGoogleNative: success', { uid: userCredential.user.uid });
  return userCredential;
}

// ---------------------------------------------------------------------------
// Sign-out
// ---------------------------------------------------------------------------

/**
 * Signs the currently authenticated user out of Firebase.
 *
 * @returns {Promise<void>}
 * @throws {import('firebase/auth').AuthError} On unexpected Firebase errors.
 */
/**
 * Permanently deletes the currently authenticated Firebase user account.
 * Throws `auth/requires-recent-login` if the session is older than ~5 minutes —
 * the caller should sign the user out and prompt them to re-authenticate.
 *
 * @returns {Promise<void>}
 * @throws {import('firebase/auth').AuthError}
 */
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  logger.info('deleteAccount: deleting user', { uid: user.uid });
  try {
    await firebaseDeleteUser(user);
    logger.info('deleteAccount: success');
  } catch (err) {
    logger.error('deleteAccount: failed', err);
    throw err;
  }
}

export async function signOut() {
  logger.info('signOut: signing out current user');
  try {
    await firebaseSignOut(auth);
    logger.info('signOut: success');
  } catch (err) {
    logger.error('signOut: failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Auth state listener
// ---------------------------------------------------------------------------

/**
 * Subscribes to Firebase authentication state changes.
 * Returns an unsubscribe function — call it to remove the listener
 * (important in `useEffect` cleanup).
 *
 * @param {function(import('firebase/auth').User|null): void} callback
 *   Called with the current Firebase `User` when signed in, or `null` on sign-out.
 * @returns {import('firebase/auth').Unsubscribe} Unsubscribe function.
 *
 * @example
 * useEffect(() => {
 *   const unsubscribe = onAuthStateChanged((user) => {
 *     setCurrentUser(user);
 *   });
 *   return unsubscribe;
 * }, []);
 */
export function onAuthStateChanged(callback) {
  return firebaseOnAuthStateChanged(auth, callback);
}

export default firebaseApp;
