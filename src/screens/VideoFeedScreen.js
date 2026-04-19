/**
 * @fileoverview Live Camera screen — two-mode WebRTC video feed.
 *
 * Modes:
 *   monitor — Camera phone placed in baby's room. Streams video + audio.
 *   viewer  — Parent phone watching the live feed.
 *
 * Both sides connect to the Socket.io signaling server with a Firebase
 * auth token and join a shared room ID to establish a WebRTC peer connection.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { auth } from '../services/firebase';

const SESSION_LIMIT_MS = 60 * 60 * 1000; // 60 minutes

// ── Config ────────────────────────────────────────────────────────────────────
const SIGNALING_WSS  = process.env.EXPO_PUBLIC_SIGNALING_URL  || 'wss://baby-monitor-server-flp6.onrender.com';
const SIGNALING_HTTP = SIGNALING_WSS.replace('wss://', 'https://').replace('ws://', 'http://');

// ── HTML generators ───────────────────────────────────────────────────────────

/**
 * HTML for the monitor (camera) side.
 * Captures local camera/mic → streams to signaling server via WebRTC.
 */
function buildMonitorHtml(token, roomId) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#000; display:flex; flex-direction:column; align-items:center;
           justify-content:center; height:100vh; font-family:-apple-system,sans-serif; }
    video { width:100%; max-height:72vh; background:#111; border-radius:8px; transform:scaleX(-1); }
    #status { color:#fff; margin:10px; font-size:14px; text-align:center; }
    #room   { color:#888; font-size:11px; margin-top:2px; }
    #error  { color:#ff6b6b; margin:6px; font-size:12px; text-align:center; }
  </style>
</head>
<body>
  <video id="localVideo" autoplay playsinline muted></video>
  <div id="status">Starting camera…</div>
  <div id="room">Room: ${roomId}</div>
  <div id="error"></div>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
(function () {
  var STATUS = document.getElementById('status');
  var ERROR  = document.getElementById('error');
  var video  = document.getElementById('localVideo');

  var ICE = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]};

  var pc = null;
  var socket;
  var localStream;

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  // Create a fresh PC and re-attach local tracks.
  // Called each time a new viewer connects so the session is clean.
  function createPC() {
    if (pc) try { pc.close(); } catch(_) {}
    pc = new RTCPeerConnection(ICE);
    if (localStream) {
      localStream.getTracks().forEach(function(t) { pc.addTrack(t, localStream); });
    }
    pc.onicecandidate = function(e) {
      if (e.candidate && socket && socket.connected) {
        socket.emit('ice-candidate', { candidate: e.candidate });
      }
    };
    pc.oniceconnectionstatechange = function() {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce && pc.restartIce();
      }
    };
    return pc;
  }

  async function startCamera() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      video.srcObject = localStream;
      createPC();
      STATUS.textContent = 'Camera ready — connecting…';
      connectSocket();
    } catch (err) {
      ERROR.textContent = 'Camera error: ' + err.message;
      STATUS.textContent = 'Could not access camera';
      rn('error');
    }
  }

  function connectSocket() {
    socket = io('${SIGNALING_HTTP}', {
      auth: { token: '${token}' },
      transports: ['websocket'],
      reconnection: true,
    });

    socket.on('connect', function () {
      STATUS.textContent = 'Connected — waiting for viewer…';
      socket.emit('join', { roomId: '${roomId}', role: 'camera' });
      rn('socket-connected');
    });

    // Viewer joined — ask the viewer to create the offer.
    // This means the viewer's own device generates the SDP, avoiding
    // any iOS → Android (or Android → iOS) SDP incompatibility.
    socket.on('peer-joined', function (data) {
      if (data.role === 'viewer') {
        STATUS.textContent = 'Viewer joined — setting up stream…';
        createPC();                        // fresh PC with local tracks
        socket.emit('request-offer');      // viewer will send us an offer
      }
    });

    // Viewer sent us their offer — respond with an answer.
    socket.on('offer', async function (data) {
      try {
        await pc.setRemoteDescription(data.sdp);
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { sdp: { type: answer.type, sdp: answer.sdp } });
        STATUS.textContent = '✅ Streaming live';
        rn('streaming');
      } catch (err) {
        ERROR.textContent = 'Stream error: ' + err.message;
      }
    });

    socket.on('ice-candidate', async function (data) {
      if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (_) {}
      }
    });

    socket.on('peer-disconnected', function () {
      STATUS.textContent = 'Viewer left — waiting…';
      rn('viewer-left');
    });

    socket.on('connect_error', function (err) {
      ERROR.textContent = 'Server error: ' + err.message;
    });
  }

  startCamera();
})();
</script>
</body>
</html>`;
}

/**
 * HTML for the viewer (parent) side.
 * Receives the remote video/audio stream from the monitor phone.
 */
function buildViewerHtml(token, roomId) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#000; display:flex; flex-direction:column; align-items:center;
           justify-content:center; height:100vh; font-family:-apple-system,sans-serif; }
    video { width:100%; max-height:72vh; background:#111; border-radius:8px; }
    #status { color:#fff; margin:10px; font-size:14px; text-align:center; }
    #room   { color:#888; font-size:11px; margin-top:2px; }
    #error  { color:#ff6b6b; margin:6px; font-size:12px; text-align:center; }
  </style>
</head>
<body>
  <video id="remoteVideo" autoplay playsinline></video>
  <div id="status">Connecting to room…</div>
  <div id="room">Room: ${roomId}</div>
  <div id="error"></div>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
(function () {
  var STATUS = document.getElementById('status');
  var ERROR  = document.getElementById('error');
  var video  = document.getElementById('remoteVideo');

  var ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  var pc = null;

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  // Strips SDP attributes that cause cross-platform failures between
  // iOS WebKit and Android WebView (e.g. extmap-allow-mixed).
  function sanitizeSDP(sdpObj) {
    if (!sdpObj || !sdpObj.sdp) return sdpObj;
    var clean = sdpObj.sdp
      .split(/\r?\n/)
      .filter(function(line) { return line !== 'a=extmap-allow-mixed'; })
      .join('\r\n');
    return { type: sdpObj.type, sdp: clean };
  }

  // Create a fresh RTCPeerConnection and wire up all handlers.
  // Called on first load and every time the camera reconnects.
  function createPC() {
    if (pc) {
      try { pc.close(); } catch (_) {}
    }
    pc = new RTCPeerConnection(ICE_SERVERS);

    pc.ontrack = function (e) {
      if (e.streams && e.streams[0]) {
        video.srcObject = e.streams[0];
        STATUS.textContent = '✅ Live feed connected';
        ERROR.textContent = '';
        rn('connected');
      }
    };

    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        STATUS.textContent = '⚠️ Connection lost';
        rn('disconnected');
      }
    };

    pc.onicecandidate = function (e) {
      if (e.candidate && socket.connected) {
        socket.emit('ice-candidate', { candidate: e.candidate });
      }
    };

    return pc;
  }

  var socket = io('${SIGNALING_HTTP}', {
    auth: { token: '${token}' },
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', function () {
    STATUS.textContent = 'Connected — joining room…';
    socket.emit('join', { roomId: '${roomId}', role: 'viewer' });
  });

  socket.on('waiting-for-camera', function () {
    STATUS.textContent = '⏳ Waiting for monitor to come online…';
    rn('waiting');
  });

  socket.on('peer-joined', function (data) {
    if (data.role === 'camera') {
      STATUS.textContent = 'Monitor online — waiting for stream…';
    }
  });

  // Monitor asks us to initiate WebRTC — we create the offer.
  // This means Android always uses its OWN SDP format regardless of
  // what platform the monitor is on, avoiding iOS ↔ Android SDP issues.
  socket.on('request-offer', async function () {
    STATUS.textContent = 'Setting up stream…';
    try {
      createPC();
      // Add receive-only transceivers so the offer signals we want audio+video
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (err) {
      ERROR.textContent = 'Setup error: ' + err.message;
      rn('disconnected');
    }
  });

  // Monitor answered our offer — set it as remote description.
  socket.on('answer', async function (data) {
    try {
      await pc.setRemoteDescription(data.sdp);
    } catch (err) {
      ERROR.textContent = 'Connection error: ' + err.message;
      rn('disconnected');
    }
  });

  socket.on('ice-candidate', async function (data) {
    if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (_) {}
    }
  });

  socket.on('peer-disconnected', function () {
    STATUS.textContent = '📷 Monitor stopped — waiting for reconnect…';
    video.srcObject = null;
    rn('disconnected');
  });

  socket.on('connect_error', function (err) {
    ERROR.textContent = 'Server error: ' + err.message;
  });
})();
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideoFeedScreen() {
  useKeepAwake();

  const [mode, setMode]           = useState(null);   // null | 'monitor' | 'viewer'
  const [roomInput, setRoomInput] = useState('');
  const [roomId, setRoomId]       = useState('');
  const [token, setToken]         = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [step, setStep]               = useState('pick'); // 'pick' | 'viewer-code'
  const [viewerStatus, setViewerStatus] = useState('connecting'); // 'connecting'|'waiting'|'live'|'lost'
  const [webViewKey, setWebViewKey]   = useState(0); // bump to force WebView reload
  const webViewRef   = useRef(null);
  const sessionTimer = useRef(null);
  const tickTimer    = useRef(null);

  // Always force-refresh the Firebase token so it's never stale (tokens expire after 1 hour)
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      currentUser.getIdToken(/* forceRefresh= */ true)
        .then(setToken)
        .catch(err => console.warn('VideoFeedScreen: token error', err));
    }
  }, []);

  // Clear timers whenever mode is cleared
  useEffect(() => {
    if (!mode) {
      clearTimeout(sessionTimer.current);
      clearInterval(tickTimer.current);
      setElapsed(0);
    }
  }, [mode]);

  function startSessionTimers() {
    // Tick every second for the on-screen elapsed display
    tickTimer.current = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);

    // Hard stop at 60 minutes
    sessionTimer.current = setTimeout(() => {
      clearInterval(tickTimer.current);
      setMode(null);
      setIsConnected(false);
      Alert.alert(
        '⏱ Session Ended',
        'The stream has been running for 60 minutes and has been stopped to save data and battery.\n\nTap OK to return to the menu and start a new session if needed.',
        [{ text: 'OK' }],
      );
    }, SESSION_LIMIT_MS);
  }

  function handleStart(selectedMode, codeOverride) {
    const code = codeOverride ?? roomInput.trim();
    if (selectedMode === 'viewer' && !code) {
      Alert.alert('Enter a code', 'Please enter the monitor room code first.');
      return;
    }
    // Always get a fresh token before starting so it never arrives expired
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }
    currentUser.getIdToken(true).then(freshToken => {
      setToken(freshToken);
      setRoomId(code);
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
    if (msg === 'connected' || msg === 'streaming') {
      setIsConnected(true);
      setViewerStatus('live');
    }
    if (msg === 'waiting') {
      setViewerStatus('waiting');
    }
    if (msg === 'disconnected') {
      setIsConnected(false);
      setViewerStatus('lost');
    }
    if (msg === 'viewer-left') {
      setIsConnected(false);
    }
    if (msg === 'room-error') {
      Alert.alert('Room Not Found', 'No monitor found with that code. Check the code and try again.');
      handleStop();
    }
  }

  // Reload the WebView to reconnect without leaving the session
  function handleRetry() {
    setIsConnected(false);
    setViewerStatus('connecting');
    setWebViewKey(k => k + 1); // forces WebView to remount with fresh socket
  }

  // Format elapsed seconds → "mm:ss" or "1h 02m" after an hour
  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── Step 1: pick role ────────────────────────────────────────────────────────
  if (!mode && step === 'pick') {
    return (
      <View style={styles.selector}>
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
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#4CAF50' }]}
          onPress={() => {
            if (Platform.OS === 'ios') {
              // Alert.prompt is a native iOS dialog — keyboard can never cover it
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
        </TouchableOpacity>

        <Text style={styles.hint}>Sessions automatically stop after 60 minutes to save data.</Text>
      </View>
    );
  }

  // ── Step 2: enter room code — Android only (iOS uses Alert.prompt above) ─────
  if (!mode && step === 'viewer-code') {
    return (
      <View style={styles.codeScreen}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep('pick')}>
          <Ionicons name="arrow-back" size={20} color="#6C63FF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.codeHeader}>
          <View style={[styles.modeIcon, { backgroundColor: '#E8F5E9', width: 64, height: 64, borderRadius: 18 }]}>
            <Ionicons name="eye" size={32} color="#4CAF50" />
          </View>
          <Text style={styles.codeTitle}>Enter Room Code</Text>
          <Text style={styles.codeSub}>
            Paste or type the code shown on the monitor phone.
          </Text>
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
        <TouchableOpacity style={styles.codeBtn} onPress={() => handleStart('viewer')} activeOpacity={0.85}>
          <Text style={styles.codeBtnText}>Connect as Viewer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────────
  const html = mode === 'monitor'
    ? buildMonitorHtml(token, roomId)
    : buildViewerHtml(token, roomId);

  const showRetryOverlay = mode === 'viewer' && viewerStatus !== 'live';

  return (
    <View style={styles.container}>
      {/* WebView always full-size — Modal floats above it at OS level */}
      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={{ html }}
        style={styles.webView}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={handleMessage}
      />

      {/* Modal renders at OS level — guaranteed above WebView native layer */}
      <Modal
        visible={showRetryOverlay}
        transparent={false}
        animationType="fade"
        onRequestClose={handleStop}
      >
        <View style={styles.retryOverlay}>
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
          {viewerStatus === 'connecting' || viewerStatus === 'waiting'
            ? <ActivityIndicator size="large" color="#6C63FF" style={{ marginBottom: 24 }} />
            : null}
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryStopBtn} onPress={handleStop}>
            <Text style={styles.retryStopText}>Stop Session</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusText} numberOfLines={1}>
            {mode === 'monitor'
              ? (isConnected ? 'Streaming live' : 'Waiting for viewer…')
              : (isConnected ? 'Live feed connected' : viewerStatus === 'lost' ? 'Connection lost' : 'Waiting for monitor…')}
          </Text>
          <Text style={[styles.timerText, elapsed >= 3300 && { color: '#FF9800' }]}>
            {formatElapsed(elapsed)} / 60:00
            {elapsed >= 3300 ? '  ⚠️ stopping soon' : ''}
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

const styles = StyleSheet.create({
  // Active session
  container: { flex: 1, backgroundColor: '#000' },
  webView:   { flex: 1 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1A2E', padding: 10, paddingHorizontal: 16,
  },
  // Retry overlay — full-screen Modal content
  retryOverlay: {
    flex: 1,
    backgroundColor: '#0D0D1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  retryTitle: {
    color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 10, textAlign: 'center',
  },
  retrySubtitle: {
    color: '#aaa', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 28,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#6C63FF', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 32, marginBottom: 14,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  retryStopBtn: { paddingVertical: 8 },
  retryStopText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  dot:       { width: 8, height: 8, borderRadius: 4 },
  statusText:{ color: '#fff', fontSize: 13 },
  timerText: { color: '#8E8EA0', fontSize: 11, marginTop: 1 },
  stopBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stopText:  { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  // Step 1 — role picker
  selector: {
    flex: 1, backgroundColor: '#F8F9FE',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title:    { fontSize: 26, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#8E8EA0', marginBottom: 22, textAlign: 'center' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tokenText: { color: '#8E8EA0', fontSize: 13 },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    width: '100%', marginBottom: 14, borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  modeIcon:  { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modeText:  { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  modeDesc:  { fontSize: 12, color: '#8E8EA0', lineHeight: 17 },
  hint: { fontSize: 12, color: '#B0B0C4', marginTop: 8, textAlign: 'center' },

  // Step 2 — viewer code entry (input is near top, keyboard opens below)
  codeScreen: {
    flex: 1, backgroundColor: '#F8F9FE', paddingHorizontal: 24, paddingTop: 20,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32 },
  backText: { color: '#6C63FF', fontSize: 15, fontWeight: '600' },
  codeHeader: { alignItems: 'center', marginBottom: 32 },
  codeTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginTop: 16, marginBottom: 8 },
  codeSub:   { fontSize: 13, color: '#8E8EA0', textAlign: 'center', lineHeight: 19 },
  codeInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#6C63FF',
    borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15, color: '#1A1A2E',
    marginBottom: 16,
    shadowColor: '#6C63FF', shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
  codeBtn: {
    backgroundColor: '#4CAF50', borderRadius: 14,
    height: 52, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4CAF50', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  codeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
