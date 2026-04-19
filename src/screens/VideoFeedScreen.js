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
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { auth } from '../services/firebase';

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

  var pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  });

  var socket;
  var localStream;

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  async function startCamera() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      video.srcObject = localStream;
      localStream.getTracks().forEach(function(t) { pc.addTrack(t, localStream); });
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

    socket.on('peer-joined', async function (data) {
      if (data.role === 'viewer') {
        STATUS.textContent = 'Viewer joined — starting stream…';
        try {
          var offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { sdp: offer });
        } catch (err) {
          ERROR.textContent = 'Offer error: ' + err.message;
        }
      }
    });

    socket.on('answer', async function (data) {
      try {
        await pc.setRemoteDescription(data.sdp);
        STATUS.textContent = '✅ Streaming live';
        rn('streaming');
      } catch (err) {
        ERROR.textContent = 'Answer error: ' + err.message;
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

    pc.onicecandidate = function (e) {
      if (e.candidate && socket.connected) {
        socket.emit('ice-candidate', { candidate: e.candidate });
      }
    };

    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed') {
        STATUS.textContent = 'Connection failed — retrying…';
        pc.restartIce && pc.restartIce();
      }
    };
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

  var pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  });

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  pc.ontrack = function (e) {
    if (e.streams && e.streams[0]) {
      video.srcObject = e.streams[0];
      STATUS.textContent = '✅ Live feed connected';
      rn('connected');
    }
  };

  pc.oniceconnectionstatechange = function () {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      STATUS.textContent = '⚠️ Connection lost';
      rn('disconnected');
    }
  };

  var socket = io('${SIGNALING_HTTP}', {
    auth: { token: '${token}' },
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', function () {
    STATUS.textContent = 'Connected — waiting for camera…';
    socket.emit('join', { roomId: '${roomId}', role: 'viewer' });
  });

  socket.on('offer', async function (data) {
    STATUS.textContent = 'Camera found — connecting…';
    try {
      await pc.setRemoteDescription(data.sdp);
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { sdp: answer });
    } catch (err) {
      ERROR.textContent = 'Offer error: ' + err.message;
    }
  });

  socket.on('ice-candidate', async function (data) {
    if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (_) {}
    }
  });

  socket.on('peer-disconnected', function () {
    STATUS.textContent = '📷 Camera disconnected';
    video.srcObject = null;
    rn('disconnected');
  });

  socket.on('connect_error', function (err) {
    ERROR.textContent = 'Server error: ' + err.message;
  });

  pc.onicecandidate = function (e) {
    if (e.candidate && socket.connected) {
      socket.emit('ice-candidate', { candidate: e.candidate });
    }
  };
})();
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideoFeedScreen() {
  useKeepAwake();

  const [mode, setMode]           = useState(null);   // null | 'monitor' | 'viewer'
  const [roomInput, setRoomInput] = useState('nursery');
  const [roomId, setRoomId]       = useState('nursery');
  const [token, setToken]         = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const webViewRef = useRef(null);

  // Fetch Firebase ID token on mount (refresh if needed)
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      currentUser.getIdToken(/* forceRefresh */ false)
        .then(setToken)
        .catch(err => console.warn('VideoFeedScreen: token error', err));
    }
  }, []);

  function handleStart(selectedMode) {
    if (!token) {
      Alert.alert('Not ready', 'Auth token is still loading. Please wait a moment.');
      return;
    }
    setRoomId(roomInput.trim() || 'nursery');
    setIsConnected(false);
    setMode(selectedMode);
  }

  function handleStop() {
    setMode(null);
    setIsConnected(false);
  }

  function handleMessage(e) {
    const msg = e.nativeEvent.data;
    if (msg === 'connected' || msg === 'streaming') setIsConnected(true);
    if (msg === 'disconnected' || msg === 'viewer-left') setIsConnected(false);
  }

  // ── Mode selector ───────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <View style={styles.selector}>
        <Ionicons name="videocam" size={52} color="#6C63FF" style={{ marginBottom: 14 }} />
        <Text style={styles.title}>Baby Monitor</Text>
        <Text style={styles.subtitle}>Choose your role for this session</Text>

        {/* Room ID */}
        <View style={styles.roomRow}>
          <Ionicons name="home-outline" size={18} color="#8E8EA0" />
          <TextInput
            style={styles.roomInput}
            value={roomInput}
            onChangeText={setRoomInput}
            placeholder="Room name (e.g. nursery)"
            placeholderTextColor="#8E8EA0"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {!token && (
          <View style={styles.tokenRow}>
            <ActivityIndicator size="small" color="#6C63FF" />
            <Text style={styles.tokenText}>Getting auth token…</Text>
          </View>
        )}

        {/* Monitor card */}
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
              Place this phone in the baby's room. It streams video and audio to the parent.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Viewer card */}
        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#4CAF50' }]}
          onPress={() => handleStart('viewer')}
          activeOpacity={0.85}
        >
          <View style={[styles.modeIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="eye" size={28} color="#4CAF50" />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>I'm the Parent</Text>
            <Text style={styles.modeDesc}>
              Watch the live feed from the monitor phone in real time.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Both devices must use the same room name.
        </Text>
      </View>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────────
  const html = mode === 'monitor'
    ? buildMonitorHtml(token, roomId)
    : buildViewerHtml(token, roomId);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webView}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={handleMessage}
      />

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
        <Text style={styles.statusText} numberOfLines={1}>
          {mode === 'monitor'
            ? (isConnected ? 'Streaming live' : 'Monitor — waiting for parent…')
            : (isConnected ? 'Live feed connected' : 'Waiting for camera…')}
        </Text>
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
  dot:        { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1, color: '#fff', fontSize: 13 },
  stopBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stopText:   { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  // Mode selector
  selector: {
    flex: 1, backgroundColor: '#F8F9FE',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  title:    { fontSize: 26, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#8E8EA0', marginBottom: 22, textAlign: 'center' },

  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    width: '100%', marginBottom: 18,
    borderWidth: 1, borderColor: '#E8E8F0',
  },
  roomInput: { flex: 1, fontSize: 14, color: '#1A1A2E' },

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
});
