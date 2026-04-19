/**
 * @fileoverview Settings context — persists app preferences to AsyncStorage.
 *
 * Provides SettingsProvider and useSettings hook.
 * All settings are loaded on mount and saved immediately on each update.
 *
 * @module context/SettingsContext
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY = '@baby_monitor_settings_v1';

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  defaultRoom:       'nursery',
  videoQuality:      'high',    // 'low' | 'medium' | 'high'
  nightMode:         false,
  sensitivity:       'medium',  // 'low' | 'medium' | 'high'
  vibration:         true,
  pushNotifications: true,
  cryCooldown:       8,         // seconds between cry alerts
};

// ── Context ───────────────────────────────────────────────────────────────────

const SettingsContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * SettingsProvider — loads persisted settings from AsyncStorage on mount.
 * Wraps children with the settings context.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded]     = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            // Merge with defaults so new keys added in future releases are included
            setSettings((prev) => ({ ...prev, ...parsed }));
          } catch (_) {
            // Corrupted data — fall back to defaults
          }
        }
      })
      .catch((err) => console.warn('[Settings] load error:', err.message))
      .finally(() => setLoaded(true));
  }, []);

  /**
   * Update a single setting key and persist immediately.
   *
   * @param {string} key   - A key from DEFAULT_SETTINGS
   * @param {*}      value - New value for that key
   */
  function updateSetting(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) =>
        console.warn('[Settings] save error:', err.message)
      );
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useSettings — returns the current settings object and an updater function.
 *
 * Must be used inside a SettingsProvider.
 *
 * @returns {{ settings: object, updateSetting: function, loaded: boolean }}
 */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
