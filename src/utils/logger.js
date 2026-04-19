/**
 * @fileoverview Client-side logger utility for the Baby Monitor app.
 *
 * Provides levelled logging with a consistent `[BabyMonitor]` prefix.
 * In development builds every level is printed to the console with a colour
 * hint (via ANSI codes on metro/Node, ignored gracefully on device).
 * In production builds `debug` and `info` calls are silenced; only `warn` and
 * `error` are emitted so the end-user console stays clean.
 *
 * Errors are also forwarded to the backend `/api/logs` endpoint
 * (fire-and-forget, no await) so the ops team can monitor issues in the wild
 * without requiring a native crash reporter.
 *
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.debug('WebRTC peer created', { peerId });
 *   logger.error('Auth failed', error);
 *
 * @module utils/logger
 */

import { apiBaseUrl, isDev } from '../config/env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix prepended to every log message. */
const PREFIX = '[BabyMonitor]';

/**
 * ANSI colour codes — only meaningful when metro prints to a real TTY.
 * In Hermes / JavaScriptCore they are ignored by the native console.
 *
 * @enum {string}
 */
const COLOUR = {
  reset: '\x1b[0m',
  grey: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/**
 * Log levels understood by the logger, in ascending severity order.
 *
 * @enum {string}
 */
export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Formats a log entry with a timestamp, level badge, and optional metadata.
 *
 * @param {string} level - One of the LOG_LEVEL values.
 * @param {string} colour - ANSI colour string for the level badge.
 * @param {string} msg - Human-readable log message.
 * @param {unknown} [meta] - Optional structured metadata (object, Error, etc.).
 * @returns {[string, ...unknown[]]} Spread-ready args array for `console.*`.
 */
function buildArgs(level, colour, msg, meta) {
  const ts = new Date().toISOString();
  const badge = isDev
    ? `${colour}${level.toUpperCase()}${COLOUR.reset}`
    : level.toUpperCase();
  const header = `${COLOUR.grey}${ts}${COLOUR.reset} ${PREFIX} ${badge} ${msg}`;

  return meta !== undefined ? [header, meta] : [header];
}

/**
 * Sends an error report to the backend logging endpoint.
 * This is intentionally fire-and-forget — failures are silently swallowed
 * to avoid infinite error loops.
 *
 * @param {string} level - Log level that triggered the remote call.
 * @param {string} msg - Log message.
 * @param {unknown} [meta] - Optional metadata / Error object.
 * @returns {void}
 */
function sendToServer(level, msg, meta) {
  try {
    const endpoint = `${apiBaseUrl}/api/logs`;
    const body = JSON.stringify({
      level,
      message: msg,
      meta: meta instanceof Error
        ? { name: meta.name, message: meta.message, stack: meta.stack }
        : meta,
      ts: new Date().toISOString(),
      platform: 'react-native',
    });

    // Fire and forget — no await, no .catch chaining beyond a no-op
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      // Intentionally swallowed — remote logging should never crash the app
    });
  } catch (_) {
    // Swallow synchronous JSON / URL errors
  }
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Logger
 * @property {function(string, unknown=): void} debug  - Verbose diagnostic messages (dev only).
 * @property {function(string, unknown=): void} info   - General informational messages (dev only).
 * @property {function(string, unknown=): void} warn   - Warnings that should be reviewed.
 * @property {function(string, unknown=): void} error  - Errors; forwarded to remote logging.
 */

/**
 * The singleton logger instance used throughout the application.
 *
 * @type {Logger}
 */
const logger = {
  /**
   * Logs a verbose debug message. Suppressed in production builds.
   *
   * @param {string} msg - Message to log.
   * @param {unknown} [meta] - Optional structured metadata.
   * @returns {void}
   */
  debug(msg, meta) {
    if (!isDev) return;
    console.debug(...buildArgs(LOG_LEVEL.DEBUG, COLOUR.grey, msg, meta));
  },

  /**
   * Logs an informational message. Suppressed in production builds.
   *
   * @param {string} msg - Message to log.
   * @param {unknown} [meta] - Optional structured metadata.
   * @returns {void}
   */
  info(msg, meta) {
    if (!isDev) return;
    console.info(...buildArgs(LOG_LEVEL.INFO, COLOUR.cyan, msg, meta));
  },

  /**
   * Logs a warning. Printed in both development and production.
   *
   * @param {string} msg - Message to log.
   * @param {unknown} [meta] - Optional structured metadata.
   * @returns {void}
   */
  warn(msg, meta) {
    console.warn(...buildArgs(LOG_LEVEL.WARN, COLOUR.yellow, msg, meta));
  },

  /**
   * Logs an error and forwards it to the remote logging endpoint.
   * Always printed regardless of environment.
   *
   * @param {string} msg - Message to log.
   * @param {unknown} [meta] - Optional metadata; ideally an Error object.
   * @returns {void}
   */
  error(msg, meta) {
    console.error(...buildArgs(LOG_LEVEL.ERROR, COLOUR.red, msg, meta));
    // Forward to server (fire and forget)
    sendToServer(LOG_LEVEL.ERROR, msg, meta);
  },
};

export default logger;
