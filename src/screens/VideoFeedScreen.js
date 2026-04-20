/**
 * @fileoverview Live Camera screen — two-mode WebRTC video feed.
 *
 * Modes:
 *   monitor — Camera phone placed in baby's room. Streams video + audio.
 *   viewer  — Parent phone watching the live feed.
 *
 * The WebView pages are served from the HTTPS server so Android WebView
 * treats them as a secure context and allows getUserMedia() camera access.
 * Credentials (token, roomId, signalingUrl, iceServers) are injected into
 * window.__RN_CFG__ before the page scripts run.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Modal,
  StatusBar, Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { auth } from '../services/firebase';
import NativeMonitorView from './NativeMonitorView';

// Use native WebRTC monitor on Android (bypasses WebView camera restrictions).
// iOS WebView handles getUserMedia fine so WebView monitor is kept there.
const USE_NATIVE_MONITOR = Platform.OS === 'android';

const SESSION_LIMIT_MS = 60 * 60 * 1000; // 60 minutes

// ── Config ────────────────────────────────────────────────────────────────────
const SIGNALING_WSS  = process.env.EXPO_PUBLIC_SIGNALING_URL  || 'wss://baby-monitor-server-flp6.onrender.com';
const SIGNALING_HTTP = SIGNALING_WSS.replace('wss://', 'https://').replace('ws://', 'http://');

const MONITOR_URL = `${SIGNALING_HTTP}/app/monitor`;
const VIEWER_URL  = `${SIGNALING_HTTP}/app/viewer`;

// STUN-only fallback used when TURN credentials can't be fetched
const STUN_ONLY = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Fetches short-lived Cloudflare TURN credentials from the backend.
 * Falls back to STUN-only servers on any error so the app still works.
 */
async function fetchIceServers(token) {
  try {
    const res = await fetch(`${SIGNALING_HTTP}/api/turn`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const data = await res.json();
    const servers = Array.isArray(data) ? data : [data];
    return [{ urls: 'stun:stun.l.google.com:19302' }, ...servers];
  } catch (err) {
    console.warn('TURN fetch failed, using STUN only:', err.message);
    return STUN_ONLY;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideoFeedScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();

  // Camera & mic permissions — must be granted before WebView can call getUserMedia
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission,    requestMicPermission]    = useMicrophonePermissions();

  const [mode, setMode]             = useState(null);   // null | 'monitor' | 'viewer'
  const [roomInput, setRoomInput]   = useState('');
  const [roomId, setRoomId]         = useState('');
  const [token, setToken]           = useState(null);
  const [iceServers, setIceServers] = useState(STUN_ONLY);
  const [isConnected, setIsConnected]   = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [step, setStep]                 = useState('pick'); // 'pick' | 'viewer-code'
  const [viewerStatus, setViewerStatus] = useState('connecting');
  const [webViewKey, setWebViewKey]     = useState(0);

  const webViewRef   = useRef(null);
  const sessionTimer = useRef(null);
  const tickTimer    = useRef(null);

  // Force-refresh Firebase token on mount
  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      u.getIdToken(true).then(setToken).catch(e => console.warn('Token error', e));
    }
  }, []);

  // Clear timers when session ends
  useEffect(() => {
    if (!mode) {
      clearTimeout(sessionTimer.current);
      clearInterval(tickTimer.current);
      setElapsed(0);
    }
  }, [mode]);

  function startSessionTimers() {
    tickTimer.current = setInterval(() => setElapsed(s => s + 1), 1000);
    sessionTimer.current = setTimeout(() => {
      clearInterval(tickTimer.current);
      setMode(null);
      setIsConnected(false);
      Alert.alert(
        '⏱ Session Ended',
        'The 60-minute session limit was reached. Start a new session when ready.',
        [{ text: 'OK' }],
      );
    }, SESSION_LIMIT_MS);
  }

  async function handleStart(selectedMode, codeOverride) {
    const code = codeOverride ?? roomInput.trim();
    if (selectedMode === 'viewer' && !code) {
      Alert.alert('Enter a code', 'Please enter the monitor room code first.');
      return;
    }

    // Request camera + mic permissions before starting monitor mode
    if (selectedMode === 'monitor') {
      const cam = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      const mic = micPermission?.granted    ? micPermission    : await requestMicPermission();
      if (!cam?.granted || !mic?.granted) {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone access are needed to stream.\n\nPlease allow them in your phone\'s Settings → Apps → BabyMonitorApp → Permissions.',
          [{ text: 'OK' }],
        );
        return;
      }
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    currentUser.getIdToken(true).then(async freshToken => {
      const ice = await fetchIceServers(freshToken);
      setToken(freshToken);
      setIceServers(ice);
      setRoomId(selectedMode === 'monitor' ? currentUser.uid : code);
      setIsConnected(false);
      setViewerStatus('connecting');
      setWebViewKey(k => k + 1);
      setMode(selectedMode);
      startSessionTimers();
    }).catch(() => {
      Alert.alert('Auth error', 'Could not refresh your session. Please sign out and back in.');
    });
  }

  function handleStop() {
    clearTimeout(sessionTimer.current);
    clearInterval(tickTimer.current);
    setMode(null);
    setIsConnected(false);
    setElapsed(0);
    setStep('pick');
    setViewerStatus('connecting');
  }

  function handleMessage(e) {
    const msg = e.nativeEvent.data;
    // Log everything from the WebView so camera errors are visible in the terminal
    if (msg.startsWith('camera-')) {
      console.log('[WebView camera]', msg);
      if (msg.startsWith('camera-error:')) {
        const detail = msg.replace('camera-error:', '');
        Alert.alert(
          'Camera Error',
          `Could not start camera:\n\n${detail}\n\nCheck that camera permission is allowed in Settings → Apps → BabyMonitorApp → Permissions.`,
          [{ text: 'OK', onPress: handleStop }],
        );
      }
      return;
    }
    if (msg === 'connected' || msg === 'streaming') { setIsConnected(true); setViewerStatus('live'); }
    if (msg === 'waiting')      { setViewerStatus('waiting'); }
    if (msg === 'disconnected') { setIsConnected(false); setViewerStatus('lost'); }
    if (msg === 'viewer-left')  { setIsConnected(false); }
    if (msg === 'room-error') {
      Alert.alert('Room Not Found', 'No monitor found with that code. Check the code and try again.');
      handleStop();
    }
  }

  function handleRetry() {
    setIsConnected(false);
    setViewerStatus('connecting');
    setWebViewKey(k => k + 1);
  }

  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Config injected into the WebView page before its scripts run.
  // window.__RN_CFG__ is read by the monitor/viewer HTML served from the server.
  // Pass config in the URL hash — fragments are never sent to the server
  // (token stays private) but are immediately available via window.location.hash,
  // bypassing injectedJavaScript timing issues on Android WebView.
  const configHash = token
    ? '#' + encodeURIComponent(JSON.stringify({
        token,
        roomId,
        signalingUrl: SIGNALING_HTTP,
        iceServers,
      }))
    : '';

  // ── Role picker ──────────────────────────────────────────────────────────────
  if (!mode && step === 'pick') {
    return (
      <View style={[styles.selector, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FE" />

        <Ionicons name="videocam" size={52} color="#6C63FF" style={{ marginBottom: 14 }} />
        <Text style={styles.title}>Baby Monitor</Text>
        <Text style={styles.subtitle}>Choose your role for this session</Text>

        {!token && (
          <View style={styles.tokenRow}>
            <ActivityIndicator size="small" color="#6C63FF" />
            <Text style={styles.tokenText}>Getting auth token…</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#6C63FF' }]}
          onPress={() => handleStart('monitor')}
          activeOpacity={0.85}
        >
          <View style={[styles.modeIcon, { backgroundColor: '#EEF0FF' }]}>
            <Ionicons name="camera" size={28} color="#6C63FF" />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>I'm the Monitor</Text>
            <Text style={styles.modeDesc}>
              Place this phone in the baby's room. It streams video and audio to the viewer.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C0C0D0" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#4CAF50' }]}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Alert.prompt(
                'Enter Room Code',
                'Paste or type the code shown on the monitor phone',
                (code) => {
                  const trimmed = code?.trim();
                  if (trimmed) { setRoomInput(trimmed); handleStart('viewer', trimmed); }
                },
                'plain-text',
                roomInput,
              );
            } else {
              setStep('viewer-code');
            }
          }}
          activeOpacity={0.85}
        >
          <View style={[styles.modeIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="eye" size={28} color="#4CAF50" />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>I'm the Viewer</Text>
            <Text style={styles.modeDesc}>
              Watch the live feed. You'll need the room code from the monitor phone.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C0C0D0" />
        </TouchableOpacity>

        <Text style={styles.hint}>Sessions automatically stop after 60 minutes to save data.</Text>
      </View>
    );
  }

  // ── Enter room code — Android only ───────────────────────────────────────────
  if (!mode && step === 'viewer-code') {
    return (
      <View style={[styles.codeScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FE" />

        <TouchableOpacity style={styles.backBtn} onPress={() => setStep('pick')}>
          <Ionicons name="arrow-back" size={20} color="#6C63FF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.codeHeader}>
          <View style={[styles.modeIcon, { backgroundColor: '#E8F5E9', width: 64, height: 64, borderRadius: 18 }]}>
            <Ionicons name="eye" size={32} color="#4CAF50" />
          </View>
          <Text style={styles.codeTitle}>Enter Room Code</Text>
          <Text style={styles.codeSub}>Paste or type the code shown on the monitor phone.</Text>
        </View>

        <TextInput
          style={styles.codeInput}
          value={roomInput}
          onChangeText={setRoomInput}
          placeholder="Room code…"
          placeholderTextColor="#B0B0C4"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => handleStart('viewer')}
        />

        <TouchableOpacity
          style={styles.codeBtn}
          onPress={() => handleStart('viewer')}
          activeOpacity={0.85}
        >
          <Text style={styles.codeBtnText}>Connect as Viewer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Active session ───────────────────────────────────────────────────────────
  const webViewUri = (mode === 'monitor' ? MONITOR_URL : VIEWER_URL) + configHash;
  const showRetryOverlay = mode === 'viewer' && viewerStatus !== 'live';

  // Android monitor uses native WebRTC (react-native-webrtc) to bypass WebView
  // camera restrictions on Samsung and other Android devices.
  const useNativeMonitor = USE_NATIVE_MONITOR && mode === 'monitor';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {useNativeMonitor ? (
        <NativeMonitorView
          token={token}
          roomId={roomId}
          signalingUrl={SIGNALING_HTTP}
          iceServers={iceServers}
          onStatus={(s) => console.log('[NativeMonitor]', s)}
          onStreaming={() => setIsConnected(true)}
          onViewerLeft={() => setIsConnected(false)}
        />
      ) : (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: webViewUri }}
          style={styles.webView}
          injectedJavaScriptBeforeContentLoaded={token ? `window.__RN_CFG__ = ${JSON.stringify({ token, roomId, signalingUrl: SIGNALING_HTTP, iceServers })};true;` : undefined}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          mixedContentMode="always"
          originWhitelist={['*']}
          onPermissionRequest={(request) => {
            const CAMERA_RESOURCES = [
              'android.webkit.resource.VIDEO_CAPTURE',
              'android.webkit.resource.AUDIO_CAPTURE',
            ];
            const toGrant = (request.resources && request.resources.length > 0)
              ? request.resources : CAMERA_RESOURCES;
            request.grant(toGrant);
          }}
          onMessage={handleMessage}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={styles.webViewLoadingText}>Loading…</Text>
            </View>
          )}
          startInLoadingState
        />
      )}

      {/* Retry overlay — Modal renders at OS level, above WebView native layer */}
      <Modal
        visible={showRetryOverlay}
        transparent={false}
        animationType="fade"
        onRequestClose={handleStop}
      >
        <View style={[styles.retryOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Ionicons
            name={viewerStatus === 'lost' ? 'wifi-outline' : 'time-outline'}
            size={56}
            color="#6C63FF"
            style={{ marginBottom: 20 }}
          />
          <Text style={styles.retryTitle}>
            {viewerStatus === 'lost' ? 'Connection Lost' : 'Waiting for Monitor…'}
          </Text>
          <Text style={styles.retrySubtitle}>
            {viewerStatus === 'lost'
              ? 'The camera feed dropped. Tap Retry to reconnect.'
              : 'Start Baby Monitor on the camera phone, then tap Retry.'}
          </Text>
          {(viewerStatus === 'connecting' || viewerStatus === 'waiting') && (
            <ActivityIndicator size="large" color="#6C63FF" style={{ marginBottom: 24 }} />
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryStopBtn} onPress={handleStop}>
            <Text style={styles.retryStopText}>Stop Session</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Status bar at the bottom */}
      <View style={[styles.statusBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusText} numberOfLines={1}>
            {mode === 'monitor'
              ? (isConnected ? 'Streaming live' : 'Waiting for viewer…')
              : (isConnected ? 'Live feed connected' : viewerStatus === 'lost' ? 'Connection lost' : 'Waiting for monitor…')}
          </Text>
          <Text style={[styles.timerText, elapsed >= 3300 && { color: '#FF9800' }]}>
            {formatElapsed(elapsed)} / 60:00{elapsed >= 3300 ? '  ⚠️ stopping soon' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
          <Ionicons name="stop-circle" size={20} color="#FF6B6B" />
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

const styles = StyleSheet.create({
  // ── Active session
  container: { flex: 1, backgroundColor: '#000' },
  webView:   { flex: 1, backgroundColor: '#000' },

  webViewLoading: {
    position: 'absolute', inset: 0,
    backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  webViewLoadingText: { color: '#888', fontSize: 13 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1A1A2E',
    paddingTop: 10, paddingHorizontal: 16,
  },
  dot:        { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusText: { color: '#fff', fontSize: 13 },
  timerText:  { color: '#8E8EA0', fontSize: 11, marginTop: 1 },
  stopBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  stopText:   { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  // ── Retry overlay
  retryOverlay: {
    flex: 1, backgroundColor: '#0D0D1A',
    alignItems: 'center', justifyContent: 'center', padding: 36,
  },
  retryTitle: {
    color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 10, textAlign: 'center',
  },
  retrySubtitle: {
    color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#6C63FF', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 36, marginBottom: 14,
  },
  retryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  retryStopBtn:  { paddingVertical: 10 },
  retryStopText: { color: '#FF6B6B', fontSize: 14, fontWeight: '600' },

  // ── Role picker
  selector: {
    flex: 1, backgroundColor: '#F8F9FE',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Math.min(24, SCREEN_W * 0.06),
  },
  title:    { fontSize: 26, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#8E8EA0', marginBottom: 24, textAlign: 'center' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tokenText: { color: '#8E8EA0', fontSize: 13 },

  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    width: '100%', marginBottom: 14, borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  modeIcon:  { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modeText:  { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  modeDesc:  { fontSize: 12, color: '#8E8EA0', lineHeight: 17 },
  hint:      { fontSize: 12, color: '#B0B0C4', marginTop: 8, textAlign: 'center' },

  // ── Viewer code entry (Android)
  codeScreen: {
    flex: 1, backgroundColor: '#F8F9FE',
    paddingHorizontal: Math.min(24, SCREEN_W * 0.06),
  },
  backBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  backText:  { color: '#6C63FF', fontSize: 15, fontWeight: '600' },
  codeHeader: { alignItems: 'center', marginBottom: 32 },
  codeTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginTop: 16, marginBottom: 8 },
  codeSub:   { fontSize: 13, color: '#8E8EA0', textAlign: 'center', lineHeight: 19 },
  codeInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#6C63FF',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#1A1A2E', marginBottom: 16,
    shadowColor: '#6C63FF', shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
  codeBtn: {
    backgroundColor: '#4CAF50', borderRadius: 14,
    height: 52, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4CAF50', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  codeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
