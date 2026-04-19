/**
 * @fileoverview API client for the Baby Monitor backend server.
 *
 * All requests automatically attach an `Authorization: Bearer <token>` header
 * sourced from the currently signed-in Firebase user's ID token.  The token is
 * refreshed on every call so expiry is handled transparently.
 *
 * Error handling strategy:
 * - Network / fetch failures → rethrow as `ApiError` with `code: 'NETWORK_ERROR'`
 * - HTTP 401 Unauthorized → rethrow as `ApiError` with `code: 'UNAUTHORIZED'`
 *   (the AuthContext listener will catch this and redirect to the login screen)
 * - HTTP 5xx Server Errors → log then rethrow as `ApiError` with `code: 'SERVER_ERROR'`
 * - Other 4xx → rethrow as `ApiError` with `code: 'CLIENT_ERROR'`
 *
 * @module services/api
 */

import { auth } from './firebase';
import { apiBaseUrl } from '../config/env';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

/**
 * Structured API error thrown by all api.js helpers.
 *
 * @class ApiError
 * @extends {Error}
 */
export class ApiError extends Error {
  /**
   * @param {string} message - Human-readable description.
   * @param {number} status - HTTP status code (0 for network errors).
   * @param {string} code - Machine-readable code: NETWORK_ERROR | UNAUTHORIZED | SERVER_ERROR | CLIENT_ERROR.
   * @param {unknown} [data] - Optional response body for debugging.
   */
  constructor(message, status, code, data) {
    super(message);
    this.name = 'ApiError';
    /** @type {number} */
    this.status = status;
    /** @type {string} */
    this.code = code;
    /** @type {unknown} */
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Auth token helper
// ---------------------------------------------------------------------------

/**
 * Retrieves a fresh Firebase ID token for the currently authenticated user.
 * Pass `true` to force a token refresh even if the cached token is still valid.
 *
 * @param {boolean} [forceRefresh=false] - Whether to bypass the token cache.
 * @returns {Promise<string>} A signed Firebase JWT.
 * @throws {ApiError} If no user is signed in.
 */
export async function getIdToken(forceRefresh = false) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ApiError('No authenticated user', 401, 'UNAUTHORIZED');
  }
  const token = await currentUser.getIdToken(forceRefresh);
  return token;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Internal fetch wrapper that:
 * 1. Prepends `apiBaseUrl` to the given path.
 * 2. Attaches the Firebase auth token as a Bearer header.
 * 3. Serialises a JSON body when provided.
 * 4. Parses the JSON response.
 * 5. Normalises errors into `ApiError` instances.
 *
 * @param {string} path - API path (e.g. `/api/auth/me`). Must start with `/`.
 * @param {RequestInit & { forceTokenRefresh?: boolean }} [options={}] - Fetch options.
 * @returns {Promise<unknown>} Parsed JSON response body.
 * @throws {ApiError}
 */
async function request(path, options = {}) {
  const { forceTokenRefresh = false, body, headers = {}, ...rest } = options;

  // Obtain a fresh (or cached) Firebase ID token
  let token;
  try {
    token = await getIdToken(forceTokenRefresh);
  } catch (err) {
    // If getIdToken itself throws (no user), propagate as UNAUTHORIZED
    if (err instanceof ApiError) throw err;
    throw new ApiError('Failed to retrieve auth token', 401, 'UNAUTHORIZED', err);
  }

  const url = `${apiBaseUrl}${path}`;
  const requestHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...headers,
  };

  logger.debug(`API ${rest.method || 'GET'} ${path}`);

  let response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    logger.error(`API network error on ${path}`, networkErr);
    throw new ApiError(
      'Network request failed. Please check your connection.',
      0,
      'NETWORK_ERROR',
      networkErr,
    );
  }

  // Parse body (may be empty for 204 No Content)
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
  } else {
    data = null;
  }

  if (response.ok) {
    logger.debug(`API ${path} → ${response.status}`);
    return data;
  }

  // Handle error responses
  if (response.status === 401) {
    logger.warn(`API 401 Unauthorized on ${path} — triggering re-auth`);
    throw new ApiError(
      data?.message || 'Authentication required. Please sign in again.',
      401,
      'UNAUTHORIZED',
      data,
    );
  }

  if (response.status >= 500) {
    logger.error(`API 5xx on ${path}`, { status: response.status, data });
    throw new ApiError(
      data?.message || 'Server error. Please try again later.',
      response.status,
      'SERVER_ERROR',
      data,
    );
  }

  // 4xx other than 401
  logger.warn(`API ${response.status} on ${path}`, data);
  throw new ApiError(
    data?.message || 'Request failed.',
    response.status,
    'CLIENT_ERROR',
    data,
  );
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/**
 * Verifies the Firebase ID token with the backend server, which decodes the JWT,
 * looks up (or creates) the user record, and returns the backend user profile.
 *
 * Called automatically after every Firebase auth state change.
 *
 * @param {string} idToken - Firebase ID token obtained from `getIdToken()`.
 * @returns {Promise<{ uid: string, email: string, displayName: string, role: string }>}
 *   Backend user profile object.
 * @throws {ApiError}
 */
export async function verifyWithServer(idToken) {
  logger.info('api.verifyWithServer: verifying token with backend');
  const url = `${apiBaseUrl}/api/auth/verify`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ idToken }),
    });
  } catch (networkErr) {
    logger.error('api.verifyWithServer: network error', networkErr);
    throw new ApiError('Network error during token verification', 0, 'NETWORK_ERROR', networkErr);
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    logger.error('api.verifyWithServer: server rejected token', { status: response.status, data });
    throw new ApiError(
      data?.message || 'Token verification failed',
      response.status,
      response.status === 401 ? 'UNAUTHORIZED' : 'SERVER_ERROR',
      data,
    );
  }

  logger.info('api.verifyWithServer: token verified', { uid: data?.uid });
  return data;
}

/**
 * Fetches the authenticated user's backend profile.
 *
 * @returns {Promise<{ uid: string, email: string, displayName: string, role: string, createdAt: string }>}
 * @throws {ApiError}
 */
export async function getProfile() {
  logger.info('api.getProfile: fetching user profile');
  return request('/api/auth/me', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Room endpoints
// ---------------------------------------------------------------------------

/**
 * Creates a new monitoring room on the backend.
 * Rooms are the logical pairing between the parent device (viewer) and
 * the baby device (broadcaster) via the WebRTC signaling server.
 *
 * @param {string} roomId - Client-generated unique identifier (e.g. UUID v4).
 * @returns {Promise<{ roomId: string, createdAt: string, ownerId: string }>}
 * @throws {ApiError}
 */
export async function createRoom(roomId) {
  logger.info('api.createRoom', { roomId });
  return request('/api/rooms', {
    method: 'POST',
    body: { roomId },
  });
}

/**
 * Retrieves metadata for an existing monitoring room.
 *
 * @param {string} roomId - The room identifier to look up.
 * @returns {Promise<{ roomId: string, createdAt: string, ownerId: string, participantCount: number }>}
 * @throws {ApiError}
 */
export async function getRoom(roomId) {
  logger.info('api.getRoom', { roomId });
  return request(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'GET' });
}

/**
 * Removes the authenticated user from a room and, if the room is empty,
 * deletes it from the backend.
 *
 * @param {string} roomId - The room to leave.
 * @returns {Promise<void>}
 * @throws {ApiError}
 */
export async function leaveRoom(roomId) {
  logger.info('api.leaveRoom', { roomId });
  return request(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Alerts endpoints
// ---------------------------------------------------------------------------

/**
 * Creates a new cry/noise alert from the monitor device.
 *
 * @param {{ roomId: string, type?: string, intensity: string, soundLevel?: number }} data
 * @returns {Promise<object>} Created alert record.
 */
export async function createAlert(data) {
  return request('/api/alerts', { method: 'POST', body: data });
}

/**
 * Fetches alert history for a room.
 *
 * @param {string} roomId
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getAlerts(roomId, limit = 50) {
  return request(`/api/alerts?roomId=${encodeURIComponent(roomId)}&limit=${limit}`, { method: 'GET' });
}

/**
 * Marks an alert as resolved.
 *
 * @param {number} id - Alert ID.
 * @returns {Promise<object>}
 */
export async function resolveAlert(id) {
  return request(`/api/alerts/${id}`, { method: 'PUT' });
}

/**
 * Clears all alerts for a room.
 *
 * @param {string} roomId
 * @returns {Promise<void>}
 */
export async function clearAlerts(roomId) {
  return request(`/api/alerts?roomId=${encodeURIComponent(roomId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// TURN credentials
// ---------------------------------------------------------------------------

/**
 * Fetches fresh Cloudflare TURN credentials from the backend.
 * Returns an ICE server object: { urls, username, credential }
 *
 * @returns {Promise<{ urls: string[], username: string, credential: string }>}
 */
export async function getTurnCredentials() {
  return request('/api/turn', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Default export (convenient object access)
// ---------------------------------------------------------------------------

const api = {
  getIdToken,
  verifyWithServer,
  getProfile,
  createRoom,
  getRoom,
  leaveRoom,
  createAlert,
  getAlerts,
  resolveAlert,
  clearAlerts,
  getTurnCredentials,
};

export default api;
