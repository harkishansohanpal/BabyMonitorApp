/**
 * @fileoverview Environment-aware configuration for the Baby Monitor app.
 *
 * Reads from Expo public environment variables (EXPO_PUBLIC_* prefix) which
 * are inlined at build time and safe to embed in the JS bundle.  Falls back
 * to sensible defaults for local development so the app works out-of-the-box
 * with `expo start`.
 *
 * Usage:
 *   import { apiBaseUrl, signalingUrl, isDev } from '../config/env';
 *
 * Setting env vars:
 *   Create a `.env` file at the project root (next to package.json):
 *     EXPO_PUBLIC_API_BASE_URL=https://your-api.onrender.com
 *     EXPO_PUBLIC_SIGNALING_URL=wss://your-api.onrender.com
 *     EXPO_PUBLIC_ENV=production
 *
 * @module config/env
 */

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/**
 * Raw environment string from the Expo public env var.
 * Falls back to 'development' when the variable is absent.
 *
 * @type {string}
 */
const RAW_ENV = process.env.EXPO_PUBLIC_ENV || 'development';

/**
 * Whether the current runtime is a React Native development build.
 * `__DEV__` is a global boolean injected by Metro bundler — it is `true`
 * whenever the app is running in Expo Go, a debug build, or `expo start`.
 *
 * @type {boolean}
 */
const isDevRuntime = typeof __DEV__ !== 'undefined' ? __DEV__ : RAW_ENV === 'development';

// ---------------------------------------------------------------------------
// Per-environment base URLs
// ---------------------------------------------------------------------------

/**
 * URL map keyed by environment name.
 * Override any of these via the EXPO_PUBLIC_API_BASE_URL env var.
 *
 * @type {Record<string, { api: string, signaling: string }>}
 */
const ENV_URLS = {
  development: {
    api: 'http://localhost:3000',
    signaling: 'ws://localhost:3000',
  },
  test: {
    api: 'https://babymonitor-test.onrender.com',
    signaling: 'wss://babymonitor-test.onrender.com',
  },
  production: {
    api: 'https://babymonitor-api.onrender.com',  // TODO: replace with real Render URL
    signaling: 'wss://babymonitor-api.onrender.com',
  },
};

/**
 * Resolved URLs for the active environment.
 * Explicit EXPO_PUBLIC_ overrides always win.
 *
 * @type {{ api: string, signaling: string }}
 */
const resolvedUrls = ENV_URLS[RAW_ENV] || ENV_URLS.development;

// ---------------------------------------------------------------------------
// Exported configuration object
// ---------------------------------------------------------------------------

/**
 * The active environment name: 'development' | 'test' | 'production'.
 *
 * @type {string}
 */
export const environment = RAW_ENV;

/**
 * `true` when running in a development build (Expo Go / metro dev server).
 *
 * @type {boolean}
 */
export const isDev = isDevRuntime;

/**
 * `true` when running a production build.
 *
 * @type {boolean}
 */
export const isProd = RAW_ENV === 'production' && !isDevRuntime;

/**
 * Base URL for all REST API calls.
 * Can be overridden at build time via `EXPO_PUBLIC_API_BASE_URL`.
 *
 * @type {string}
 * @example "https://babymonitor-api.onrender.com"
 */
export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL || resolvedUrls.api;

/**
 * WebSocket / WebRTC signaling server URL.
 * Can be overridden at build time via `EXPO_PUBLIC_SIGNALING_URL`.
 *
 * @type {string}
 * @example "wss://babymonitor-api.onrender.com"
 */
export const signalingUrl =
  process.env.EXPO_PUBLIC_SIGNALING_URL || resolvedUrls.signaling;

/**
 * Convenience default export — mirrors all named exports as a single object.
 *
 * @type {{ apiBaseUrl: string, signalingUrl: string, environment: string, isDev: boolean, isProd: boolean }}
 */
const config = {
  apiBaseUrl,
  signalingUrl,
  environment,
  isDev,
  isProd,
};

export default config;
