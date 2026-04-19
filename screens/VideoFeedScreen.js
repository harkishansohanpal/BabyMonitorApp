/**
 * @fileoverview Live Camera screen — two-mode WebRTC video feed.
 *
 * Modes:
 *   monitor — Camera phone placed in baby's room. Streams video + audio.
 *   viewer  — Parent phone watching the live feed.
 *
 * Both sides connect to the Socket.io signaling server with a Firebase
 * auth token and join a shared room ID to establish a WebRTC peer connection.
 *
 * Settings integration:
 *   - defaultRoom   → initial room name
 *   - videoQuality  → getUserMedia constraints (low/medium/high)
 *   - nightMode     → initial night vision state
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, PermissionsAndroid, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { auth } from '../src/services/firebase';
import { createAlert, getTurnCredentials } from '../src/services/api';
import { useSettings } from '../src/context/SettingsContext';

// ── Config ────────────────────────────────────────────────────────────────────
const SIGNALING_WSS  = process.env.EXPO_PUBLIC_SIGNALING_URL  || 'wss://baby-monitor-server-flp6.onrender.com';
const SIGNALING_HTTP = SIGNALING_WSS.replace('wss://', 'https://').replace('ws://', 'http://');

// ── Video quality presets ─────────────────────────────────────────────────────

function qualityConstraints(quality) {
  switch (quality) {
    case 'low':    return { width: { ideal: 854  }, height: { ideal: 480  }, frameRate: { ideal: 15 } };
    case 'medium': return { width: { ideal: 1280 }, height: { ideal: 720  }, frameRate: { ideal: 24 } };
    case 'high':
    default:       return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  }
}

// ── HTML generators ───────────────────────────────────────────────────────────

/**
 * HTML for the monitor (camera) side.
 * Captures local camera/mic → streams to signaling server via WebRTC.
 * quality: 'low' | 'medium' | 'high'
 * initialNightMode: boolean — if true, activates night mode right after camera starts
 */
function buildMonitorHtml(token, roomId, iceServers, quality, initialNightMode) {
  const vq = qualityConstraints(quality || 'high');
  const videoConstraints = JSON.stringify({ facingMode: 'environment', ...vq });
  const iceJson = JSON.stringify(iceServers);
  const initNight = initialNightMode ? 'true' : 'false';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#000; overflow:hidden; font-family:-apple-system,sans-serif; }
    video {
      position:fixed; top:0; left:0;
      width:100vw; height:100vh;
      object-fit:cover;
      background:#000;
      transform:scaleX(-1);
    }
    #overlay {
      position:fixed; bottom:0; left:0; right:0;
      padding:10px 16px;
      background:linear-gradient(transparent, rgba(0,0,0,0.6));
      display:flex; align-items:center; gap:8px;
    }
    #status { color:#fff; font-size:13px; flex:1; }
    #room   { color:#bbb; font-size:11px; }
    #error  { position:fixed; top:10px; left:0; right:0; text-align:center;
              color:#ff6b6b; font-size:12px; padding:0 12px; }
  </style>
  <!-- SVG night-vision filter: gamma-based shadow boost with green tint.
       GPU-accelerated unlike CSS brightness. Red/blue channels attenuated,
       green channel amplified — matches the spectral response of NV devices. -->
  <svg style="display:none" xmlns="http://www.w3.org/2000/svg">
    <filter id="nv" color-interpolation-filters="sRGB">
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="0.7"  exponent="0.35" offset="0.02"/>
        <feFuncG type="gamma" amplitude="1.2"  exponent="0.32" offset="0.02"/>
        <feFuncB type="gamma" amplitude="0.45" exponent="0.45" offset="0.01"/>
      </feComponentTransfer>
    </filter>
  </svg>
</head>
<body>
  <video id="localVideo" autoplay playsinline muted></video>
  <div id="error"></div>
  <div id="overlay">
    <span id="status">Starting camera…</span>
    <span id="room">Room: ${roomId}</span>
  </div>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
// Polyfill getUserMedia for Android WebView
if (!navigator.mediaDevices) { navigator.mediaDevices = {}; }
if (!navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia = function(c) {
    var gum = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (!gum) return Promise.reject(new Error('getUserMedia not supported'));
    return new Promise(function(res, rej) { gum.call(navigator, c, res, rej); });
  };
}
</script>
<script>
(function () {
  var STATUS = document.getElementById('status');
  var ERROR  = document.getElementById('error');
  var video  = document.getElementById('localVideo');

  var ICE_SERVERS = ${iceJson};

  var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  var socket;
  var localStream;

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  // ── H264 preference optimisation ───────────────────────────────────────────
  function preferH264(sdp) {
    var lines = sdp.split('\\n');
    var mVideoIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=video')) { mVideoIdx = i; break; }
    }
    if (mVideoIdx === -1) return sdp;

    // Find H264 payload type numbers
    var h264Payloads = [];
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('H264') !== -1) {
        var m = lines[j].match(/a=rtpmap:(\\d+)/);
        if (m) h264Payloads.push(m[1]);
      }
    }
    if (!h264Payloads.length) return sdp;

    // Reorder m=video line to put H264 payloads first
    var mLine = lines[mVideoIdx].split(' ');
    var prefix = mLine.slice(0, 3);
    var payloads = mLine.slice(3);
    var h264First = h264Payloads.filter(function(p) { return payloads.indexOf(p) !== -1; });
    var rest = payloads.filter(function(p) { return h264First.indexOf(p) === -1; });
    lines[mVideoIdx] = prefix.concat(h264First).concat(rest).join(' ');
    return lines.join('\\n');
  }

  // ── Cry detection via Web Audio API ────────────────────────────────────────
  var lastCryAt = 0;
  var CRY_COOLDOWN_MS = 8000; // min 8s between alerts
  var CRY_THRESHOLD   = 0.30; // 0–1 volume threshold
  var audioCtx, analyser, dataArray;

  function startAudioAnalysis(stream) {
    try {
      audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      analyser  = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      var source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      checkAudioLevel();
    } catch (e) {
      console.warn('Audio analysis unavailable:', e.message);
    }
  }

  function checkAudioLevel() {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);
    var sum = 0;
    for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
    var level = (sum / dataArray.length) / 255;

    // Send level to React Native every tick for sound meter display
    rn('level:' + level.toFixed(3));

    // Cry detected if above threshold and cooldown elapsed
    var now = Date.now();
    if (level > CRY_THRESHOLD && (now - lastCryAt) > CRY_COOLDOWN_MS) {
      lastCryAt = now;
      var intensity = level > 0.6 ? 'High' : level > 0.4 ? 'Medium' : 'Low';
      rn('cry:' + intensity + ':' + level.toFixed(3));
    }

    requestAnimationFrame(checkAudioLevel);
  }

  async function startCamera() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: ${videoConstraints},
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      video.srcObject = localStream;
      localStream.getTracks().forEach(function(t) { pc.addTrack(t, localStream); });
      startAudioAnalysis(localStream);
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
          var optimized = preferH264(offer.sdp);
          await pc.setLocalDescription(new RTCSessionDescription({ type: offer.type, sdp: optimized }));
          socket.emit('offer', { sdp: pc.localDescription });
        } catch (err) {
          ERROR.textContent = 'Offer error: ' + err.message;
        }
      }
    });

    // Buffer candidates that arrive before remote description is set
    var pendingCandidates = [];
    var remoteReady = false;

    function addCandidate(candidate) {
      if (remoteReady) {
        pc.addIceCandidate(candidate).catch(function() {});
      } else {
        pendingCandidates.push(candidate);
      }
    }

    function flushCandidates() {
      remoteReady = true;
      pendingCandidates.forEach(function(c) { pc.addIceCandidate(c).catch(function() {}); });
      pendingCandidates = [];
    }

    socket.on('answer', async function (data) {
      try {
        await pc.setRemoteDescription(data.sdp);
        flushCandidates();
        STATUS.textContent = 'Streaming live';
        rn('streaming');

        // Set max bitrate after answer received
        pc.getSenders().forEach(async function(sender) {
          if (sender.track && sender.track.kind === 'video') {
            try {
              var params = sender.getParameters();
              if (!params.encodings || !params.encodings.length) params.encodings = [{}];
              params.encodings[0].maxBitrate = 2000000;
              params.encodings[0].maxFramerate = 30;
              await sender.setParameters(params);
            } catch(e) {}
          }
        });
      } catch (err) {
        ERROR.textContent = 'Answer error: ' + err.message;
      }
    });

    socket.on('ice-candidate', function (data) {
      if (data.candidate) addCandidate(data.candidate);
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

  // ── Night mode — called from React Native via injectJavaScript ─────────────
  // Two-pronged approach — no torch (would wake the baby):
  //   1. Exposure/ISO: requests max sensor gain from hardware (silent, no light)
  //   2. SVG gamma filter: GPU-accelerated non-linear shadow lifting so the
  //      monitor user can see detail in dark areas without washing out highlights.
  //      Much better than CSS brightness which amplifies noise equally.
  window.setNightMode = function(enabled) {
    video.style.filter = enabled ? 'url(#nv)' : 'none';
    if (!localStream) return;
    var track = localStream.getVideoTracks()[0];
    if (!track) return;

    if (enabled) {
      // Max exposure time for frame rate (33333µs = ~30fps), high ISO — no light emitted
      track.applyConstraints({
        advanced: [{ exposureMode: 'manual', exposureTime: 33333, iso: 3200 }]
      }).catch(function(){});
    } else {
      // Restore auto exposure
      track.applyConstraints({
        advanced: [{ exposureMode: 'continuous' }]
      }).catch(function(){});
    }
  };

  // Apply initial night mode state after camera has had time to start
  if (${initNight}) {
    setTimeout(function() { window.setNightMode(true); }, 1500);
  }
})();
</script>
</body>
</html>`;
}

/**
 * HTML for the viewer (parent) side.
 * Receives the remote video/audio stream from the monitor phone.
 */
function buildViewerHtml(token, roomId, iceServers, initialNightMode) {
  const iceJson = JSON.stringify(iceServers);
  const initNight = initialNightMode ? 'true' : 'false';
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#000; overflow:hidden; font-family:-apple-system,sans-serif; }
    video {
      position:fixed; top:0; left:0;
      width:100vw; height:100vh;
      object-fit:cover;
      background:#000;
    }
    #overlay {
      position:fixed; bottom:0; left:0; right:0;
      padding:10px 16px;
      background:linear-gradient(transparent, rgba(0,0,0,0.6));
      display:flex; align-items:center; gap:8px;
    }
    #status { color:#fff; font-size:13px; flex:1; }
    #room   { color:#bbb; font-size:11px; }
    #error  { position:fixed; top:10px; left:0; right:0; text-align:center;
              color:#ff6b6b; font-size:12px; padding:0 12px; }
  </style>
  <!-- Same SVG night-vision gamma filter as monitor side -->
  <svg style="display:none" xmlns="http://www.w3.org/2000/svg">
    <filter id="nv" color-interpolation-filters="sRGB">
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="0.7"  exponent="0.35" offset="0.02"/>
        <feFuncG type="gamma" amplitude="1.2"  exponent="0.32" offset="0.02"/>
        <feFuncB type="gamma" amplitude="0.45" exponent="0.45" offset="0.01"/>
      </feComponentTransfer>
    </filter>
  </svg>
</head>
<body>
  <video id="remoteVideo" autoplay playsinline></video>
  <div id="error"></div>
  <div id="overlay">
    <span id="status">Connecting to room…</span>
    <span id="room">Room: ${roomId}</span>
  </div>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
(function () {
  var STATUS = document.getElementById('status');
  var ERROR  = document.getElementById('error');
  var video  = document.getElementById('remoteVideo');

  var ICE_SERVERS = ${iceJson};

  var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  function rn(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
  }

  // ── H264 preference optimisation ───────────────────────────────────────────
  function preferH264(sdp) {
    var lines = sdp.split('\\n');
    var mVideoIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=video')) { mVideoIdx = i; break; }
    }
    if (mVideoIdx === -1) return sdp;
    var h264Payloads = [];
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('H264') !== -1) {
        var m = lines[j].match(/a=rtpmap:(\\d+)/);
        if (m) h264Payloads.push(m[1]);
      }
    }
    if (!h264Payloads.length) return sdp;
    var mLine = lines[mVideoIdx].split(' ');
    var prefix = mLine.slice(0, 3);
    var payloads = mLine.slice(3);
    var h264First = h264Payloads.filter(function(p) { return payloads.indexOf(p) !== -1; });
    var rest = payloads.filter(function(p) { return h264First.indexOf(p) === -1; });
    lines[mVideoIdx] = prefix.concat(h264First).concat(rest).join(' ');
    return lines.join('\\n');
  }

  pc.ontrack = function (e) {
    if (e.streams && e.streams[0]) {
      video.srcObject = e.streams[0];
      STATUS.textContent = 'Live feed connected';
      rn('connected');
    }
  };

  pc.oniceconnectionstatechange = function () {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      STATUS.textContent = 'Connection lost';
      rn('disconnected');
    }
  };

  var socket = io('${SIGNALING_HTTP}', {
    auth: { token: '${token}' },
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', function () {
    STATUS.textContent = 'Connected — verifying code…';
    socket.emit('join', { roomId: '${roomId}', role: 'viewer' });
  });

  socket.on('room-error', function (data) {
    ERROR.textContent = data.message || 'Invalid room code';
    STATUS.textContent = 'Could not connect';
    rn('room-error');
  });

  // Buffer candidates that arrive before remote description is set
  var pendingCandidates = [];
  var remoteReady = false;

  function addCandidate(candidate) {
    if (remoteReady) {
      pc.addIceCandidate(candidate).catch(function() {});
    } else {
      pendingCandidates.push(candidate);
    }
  }

  function flushCandidates() {
    remoteReady = true;
    pendingCandidates.forEach(function(c) { pc.addIceCandidate(c).catch(function() {}); });
    pendingCandidates = [];
  }

  socket.on('offer', async function (data) {
    STATUS.textContent = 'Camera found — connecting…';
    try {
      await pc.setRemoteDescription(data.sdp);
      flushCandidates();
      var answer = await pc.createAnswer();
      var optimized = preferH264(answer.sdp);
      await pc.setLocalDescription(new RTCSessionDescription({ type: answer.type, sdp: optimized }));
      socket.emit('answer', { sdp: pc.localDescription });
    } catch (err) {
      ERROR.textContent = 'Offer error: ' + err.message;
    }
  });

  socket.on('ice-candidate', function (data) {
    if (data.candidate) addCandidate(data.candidate);
  });

  socket.on('peer-disconnected', function () {
    STATUS.textContent = 'Camera disconnected';
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

  // ── Night mode (viewer side) — SVG gamma filter only, no camera control ──
  window.setNightMode = function(enabled) {
    video.style.filter = enabled ? 'url(#nv)' : 'none';
  };

  if (${initNight}) {
    setTimeout(function() { window.setNightMode(true); }, 500);
  }
})();
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VideoFeedScreen() {
  useKeepAwake();

  const { settings } = useSettings();

  const [mode, setMode]               = useState(null); // null | 'monitor' | 'viewer'
  const [viewerCode, setViewerCode]   = useState('');   // code the viewer types in
  const [roomId, setRoomId]           = useState('');
  const [token, setToken]             = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [soundLevel, setSoundLevel]   = useState(0);
  const [isStarting, setIsStarting]   = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nightMode, setNightMode]     = useState(settings.nightMode || false);
  const [iceServers, setIceServers]   = useState([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);
  const webViewRef = useRef(null);

  // The monitor's room code IS their Firebase UID — server enforces this.
  const uid = auth.currentUser?.uid ?? '';
  // Display UID in 4 groups of 7 chars for readability
  const formattedCode = uid.match(/.{1,7}/g)?.join(' – ') ?? '…';

  // Fetch Firebase ID token on mount
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      currentUser.getIdToken(false)
        .then(setToken)
        .catch(err => console.warn('VideoFeedScreen: token error', err));
    }
  }, []);

  async function handleShare() {
    try {
      await Share.share({ message: `My Baby Monitor room code: ${uid}` });
    } catch (_) {}
  }

  async function handleStart(selectedMode) {
    if (!token) {
      Alert.alert('Not ready', 'Auth token is still loading. Please wait a moment.');
      return;
    }
    if (selectedMode === 'viewer') {
      const code = viewerCode.trim();
      if (!code) {
        Alert.alert('Enter a code', 'Paste the room code from the monitor phone.');
        return;
      }
      setRoomId(code);
    } else {
      // Monitor: room = own UID (server enforces this regardless of what we send)
      setRoomId(uid);
    }

    setIsStarting(true);
    if (selectedMode === 'monitor' && Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }

    try {
      const turnCred = await getTurnCredentials();
      if (turnCred && turnCred.urls) {
        setIceServers([
          { urls: 'stun:stun.l.google.com:19302' },
          turnCred,
        ]);
      }
    } catch (err) {
      console.warn('Could not fetch TURN credentials, using STUN only:', err.message);
    }

    setIsConnected(false);
    setIsStarting(false);
    setMode(selectedMode);
  }

  async function toggleFullscreen() {
    const entering = !isFullscreen;
    setIsFullscreen(entering);
    try {
      await ScreenOrientation.lockAsync(
        entering
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch (_) {
      // Native module not available in dev build — fullscreen still works, just no rotation
    }
  }

  function toggleNightMode() {
    const next = !nightMode;
    setNightMode(next);
    // Calls window.setNightMode inside the WebView:
    //   Monitor side: boosts camera ISO/exposure (no torch — would wake baby)
    //                 + SVG gamma filter on preview
    //   Viewer side:  SVG gamma filter on incoming video
    webViewRef.current?.injectJavaScript(
      `typeof window.setNightMode === 'function' && window.setNightMode(${next}); true;`
    );
  }

  function handleStop() {
    try {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (_) {}
    setIsFullscreen(false);
    setNightMode(false);
    setMode(null);
    setIsConnected(false);
  }

  function handleMessage(e) {
    const msg = e.nativeEvent.data;

    if (msg === 'connected' || msg === 'streaming') { setIsConnected(true); return; }
    if (msg === 'disconnected' || msg === 'viewer-left') { setIsConnected(false); return; }
    if (msg === 'room-error') {
      Alert.alert('Invalid Code', 'No monitor was found with that code. Make sure the monitor phone is running first, then try again.');
      handleStop();
      return;
    }

    // Sound level updates from the Web Audio analyser (monitor mode only)
    if (msg.startsWith('level:')) {
      const lvl = parseFloat(msg.slice(6)) || 0;
      setSoundLevel(lvl);
      return;
    }

    // Cry detected: "cry:High:0.450"
    if (msg.startsWith('cry:')) {
      const parts = msg.split(':');            // ['cry', 'High', '0.450']
      const intensity  = parts[1] || 'Medium';
      const soundLvl   = parseFloat(parts[2]) || 0;
      console.log(`[CryDetect] intensity=${intensity} level=${soundLvl} room=${roomId}`);
      createAlert({ roomId, type: 'cry', intensity, soundLevel: soundLvl })
        .catch(err => console.warn('[CryDetect] createAlert failed', err.message));
      return;
    }
  }

  // ── Mode selector ───────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <SafeAreaView style={styles.selector}>
        {/* Header */}
        <View style={styles.selectorHeader}>
          <View style={styles.logoCircle}>
            <Ionicons name="videocam" size={32} color="#6C63FF" />
          </View>
          <Text style={styles.title}>Baby Monitor</Text>
          <Text style={styles.subtitle}>Secure, private video monitoring</Text>
        </View>

        {/* ── MONITOR SECTION ── */}
        <View style={styles.sectionLabel}>
          <Ionicons name="shield-checkmark" size={13} color="#8E8EA0" />
          <Text style={styles.sectionLabelText}>YOUR ROOM CODE</Text>
        </View>
        <View style={styles.codeCard}>
          <Text style={styles.codeText} selectable>{formattedCode}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.75}>
            <Ionicons name="share-outline" size={16} color="#6C63FF" />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.codeHint}>Share this code with whoever you want to give camera access to.</Text>

        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#6C63FF', opacity: isStarting ? 0.6 : 1 }]}
          onPress={() => handleStart('monitor')}
          activeOpacity={0.82}
          disabled={isStarting || !token}
        >
          <View style={[styles.modeIcon, { backgroundColor: '#EEF0FF' }]}>
            <Ionicons name="camera" size={26} color="#6C63FF" />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Start as Monitor</Text>
            <Text style={styles.modeDesc}>Place this phone in the baby's room to stream video and audio.</Text>
          </View>
          {isStarting
            ? <ActivityIndicator size="small" color="#6C63FF" />
            : <Ionicons name="chevron-forward" size={18} color="#C4C4D4" />}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or connect as viewer</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── VIEWER SECTION ── */}
        <View style={styles.roomRow}>
          <Ionicons name="key-outline" size={18} color="#8E8EA0" />
          <TextInput
            style={styles.roomInput}
            value={viewerCode}
            onChangeText={setViewerCode}
            placeholder="Paste room code from monitor phone"
            placeholderTextColor="#8E8EA0"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>

        <TouchableOpacity
          style={[styles.modeCard, { borderColor: '#4CAF50', opacity: (isStarting || !viewerCode.trim()) ? 0.5 : 1 }]}
          onPress={() => handleStart('viewer')}
          activeOpacity={0.82}
          disabled={isStarting || !token || !viewerCode.trim()}
        >
          <View style={[styles.modeIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="eye" size={26} color="#4CAF50" />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Connect as Viewer</Text>
            <Text style={styles.modeDesc}>Watch the live feed from the monitor phone in real time.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C4C4D4" />
        </TouchableOpacity>

        {!token && (
          <View style={styles.selectorFooter}>
            <ActivityIndicator size="small" color="#8E8EA0" />
            <Text style={styles.tokenText}>Loading…</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────────
  const html = mode === 'monitor'
    ? buildMonitorHtml(token, roomId, iceServers, settings.videoQuality, nightMode)
    : buildViewerHtml(token, roomId, iceServers, nightMode);

  return (
    <View style={styles.container}>
      <StatusBar hidden={isFullscreen} />

      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'http://localhost' }}
        style={styles.webView}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsProtectedMedia
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={handleMessage}
        onPermissionRequest={(request) => request.grant(request.resources)}
      />

      {/* Fullscreen overlay — minimal controls shown over video */}
      {isFullscreen ? (
        <View style={styles.fullscreenOverlay}>
          {/* Night mode indicator */}
          {nightMode && (
            <View style={styles.nightIndicator}>
              <Text style={styles.nightIndicatorText}>Night</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.fsBtn, nightMode && styles.fsBtnActive]}
            onPress={toggleNightMode}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name={nightMode ? 'moon' : 'moon-outline'} size={20} color={nightMode ? '#FFD60A' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fsBtn}
            onPress={toggleFullscreen}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="contract" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fsBtn, styles.fsBtnStop]}
            onPress={handleStop}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="stop-circle" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      ) : (
        /* Normal status bar */
        <SafeAreaView edges={['bottom']} style={styles.statusBarWrap}>
          <View style={styles.statusBar}>
            {/* Left: dot + status text */}
            <View style={[styles.dot, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
            <Text style={styles.statusText} numberOfLines={1}>
              {mode === 'monitor'
                ? (isConnected ? `Streaming  ${Math.round(soundLevel * 100)}%` : 'Waiting for parent…')
                : (isConnected ? 'Live feed connected' : 'Waiting for camera…')}
            </Text>
            {nightMode && (
              <View style={styles.nightBadge}>
                <Text style={styles.nightBadgeText}>Night</Text>
              </View>
            )}

            {/* Middle: night mode toggle */}
            <TouchableOpacity
              style={[styles.nightBtn, nightMode && styles.nightBtnActive]}
              onPress={toggleNightMode}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={nightMode ? 'moon' : 'moon-outline'}
                size={18}
                color={nightMode ? '#FFD60A' : '#8E8EA0'}
              />
            </TouchableOpacity>

            {/* Right: expand + stop */}
            <TouchableOpacity
              style={styles.fsIconBtn}
              onPress={toggleFullscreen}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="expand" size={20} color="#E0E0F0" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={handleStop}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="stop-circle" size={22} color="#FF6B6B" />
              <Text style={styles.stopText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Active session ──
  container:     { flex: 1, backgroundColor: '#000' },
  webView:       { flex: 1 },
  statusBarWrap: { backgroundColor: '#0D0D1A' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  dot:      { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  statusText: { flex: 1, color: '#E0E0F0', fontSize: 13, fontWeight: '500' },

  nightBadge: {
    backgroundColor: 'rgba(255,214,10,0.2)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nightBadgeText: { color: '#FFD60A', fontSize: 10, fontWeight: '700' },

  nightBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  nightBtnActive: { backgroundColor: 'rgba(255,214,10,0.15)' },

  fsIconBtn: { padding: 4 },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,107,107,0.15)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  stopText: { color: '#FF6B6B', fontSize: 13, fontWeight: '700' },

  // Fullscreen overlay
  fullscreenOverlay: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', gap: 8,
    alignItems: 'center',
  },
  nightIndicator: {
    backgroundColor: 'rgba(255,214,10,0.2)',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
  },
  nightIndicatorText: { color: '#FFD60A', fontSize: 10, fontWeight: '700' },
  fsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  fsBtnActive: { backgroundColor: 'rgba(255,214,10,0.2)' },
  fsBtnStop: { backgroundColor: 'rgba(0,0,0,0.5)' },

  // ── Mode selector ──
  selector: {
    flex: 1, backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  selectorHeader: {
    alignItems: 'center', paddingTop: 36, paddingBottom: 24,
  },
  logoCircle: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: '#EEF0FF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6C63FF', shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  title:    { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#8E8EA0', textAlign: 'center', lineHeight: 19 },

  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: 8, marginLeft: 2,
  },
  sectionLabelText: {
    fontSize: 11, fontWeight: '700', color: '#8E8EA0', letterSpacing: 0.7,
  },

  codeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F4F3FF', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#D8D5FF',
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 6, gap: 10,
  },
  codeText: {
    flex: 1, fontSize: 13, fontWeight: '700',
    color: '#3D35C8', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.5,
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D8D5FF',
  },
  shareBtnText: { fontSize: 13, fontWeight: '600', color: '#6C63FF' },
  codeHint: {
    fontSize: 11, color: '#A0A0B8', lineHeight: 16,
    marginBottom: 16, marginLeft: 2,
  },

  divider: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EDEDF5' },
  dividerText: { fontSize: 12, color: '#B0B0C4', fontWeight: '500' },

  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8F8FB', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 12,
    borderWidth: 1.5, borderColor: '#E8E8F0',
  },
  roomInput: { flex: 1, fontSize: 14, color: '#1A1A2E', fontWeight: '500' },

  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12, borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  modeIcon:  { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeText:  { flex: 1 },
  modeTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 3 },
  modeDesc:  { fontSize: 12, color: '#8E8EA0', lineHeight: 17 },

  selectorFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingTop: 8,
  },
  tokenText: { color: '#8E8EA0', fontSize: 13 },
});
