/**
 * @fileoverview Native WebRTC monitor view using react-native-webrtc.
 *
 * Used instead of the WebView-based monitor on Android, where WebView
 * blocks getUserMedia on certain devices (e.g. Samsung Galaxy S10+).
 *
 * Supports multiple simultaneous viewers — each viewer gets its own
 * RTCPeerConnection so they can all watch independently.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { io } from 'socket.io-client';

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  RTCView,
} from 'react-native-webrtc';

const ICE_CONFIG = (iceServers) => ({
  iceServers: iceServers && iceServers.length > 0
    ? iceServers
    : [{ urls: 'stun:stun.l.google.com:19302' }],
});

/**
 * Native monitor view — captures camera natively and streams via WebRTC.
 *
 * Props:
 *   token        {string}   Firebase ID token for signaling auth
 *   roomId       {string}   Room / Firebase UID to join
 *   signalingUrl {string}   HTTP URL of the signaling server
 *   iceServers   {Array}    ICE server config (STUN + optional TURN)
 *   onStatus     {function} Called with status string updates
 *   onStreaming  {function} Called when first viewer connects
 *   onViewerLeft {function} Called when last viewer disconnects
 */
export default function NativeMonitorView({
  token,
  roomId,
  signalingUrl,
  iceServers,
  onStatus,
  onStreaming,
  onViewerLeft,
}) {
  const [localStream, setLocalStream] = useState(null);
  const [statusText, setStatusText]   = useState('Starting camera…');
  const [errorText, setErrorText]     = useState('');

  const socketRef   = useRef(null);
  const pcsRef      = useRef({});  // { [viewerSocketId]: RTCPeerConnection }
  const streamRef   = useRef(null);
  const viewerCount = useRef(0);

  function status(msg) {
    setStatusText(msg);
    onStatus && onStatus(msg);
  }

  function updateStatus() {
    const n = viewerCount.current;
    if (n === 0) {
      status('Connected — waiting for viewer…');
    } else {
      status(`✅ Streaming (${n} viewer${n !== 1 ? 's' : ''})`);
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      Object.values(pcsRef.current).forEach(pc => { try { pc.close(); } catch (_) {} });
      pcsRef.current = {};
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Start camera then connect ──────────────────────────────────────────────
  useEffect(() => {
    if (!token || !roomId || !signalingUrl) return;
    startMonitor();
  }, [token, roomId, signalingUrl]);

  async function startMonitor() {
    const constraintSets = [
      { video: { facingMode: 'environment', width: 1280, height: 720 }, audio: true },
      { video: { facingMode: 'environment' }, audio: true },
      { video: true, audio: true },
    ];

    let stream = null;
    for (const constraints of constraintSets) {
      try {
        stream = await mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        console.warn('NativeMonitor: getUserMedia failed with', constraints, err.message);
      }
    }

    if (!stream) {
      setErrorText('Could not access camera. Check permissions in Settings.');
      status('Camera error');
      return;
    }

    streamRef.current = stream;
    setLocalStream(stream);
    status('Camera ready — connecting…');
    connectSocket(stream);
  }

  // ── Create a fresh RTCPeerConnection for a specific viewer ────────────────
  function createPCForViewer(viewerSocketId, stream) {
    if (pcsRef.current[viewerSocketId]) {
      try { pcsRef.current[viewerSocketId].close(); } catch (_) {}
    }
    const pc = new RTCPeerConnection(ICE_CONFIG(iceServers));
    pcsRef.current[viewerSocketId] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socketRef.current?.connected) {
        socketRef.current.emit('ice-candidate', { candidate, targetId: viewerSocketId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce?.();
    };

    return pc;
  }

  // ── Signaling ──────────────────────────────────────────────────────────────
  function connectSocket(stream) {
    const socket = io(signalingUrl, {
      auth:         { token },
      transports:   ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      status('Connected — waiting for viewer…');
      socket.emit('join', { roomId, role: 'camera' });
    });

    // New viewer joined — create a dedicated PC and ask them for an offer
    socket.on('peer-joined', ({ role, socketId }) => {
      if (role !== 'viewer') return;
      viewerCount.current += 1;
      status('Viewer joined — setting up stream…');
      createPCForViewer(socketId, stream);
      socket.emit('request-offer', { targetId: socketId });
    });

    // Viewer sent an offer — answer it on their dedicated PC
    // fromId = the viewer's socketId
    socket.on('offer', async ({ sdp, fromId }) => {
      const pc = pcsRef.current[fromId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          sdp: { type: answer.type, sdp: answer.sdp },
          targetId: fromId,
        });
        updateStatus();
        onStreaming && onStreaming();
      } catch (err) {
        setErrorText('Stream error: ' + err.message);
      }
    });

    // ICE candidate from a specific viewer
    socket.on('ice-candidate', async ({ candidate, fromId }) => {
      if (!candidate || !fromId) return;
      const pc = pcsRef.current[fromId];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    });

    // A viewer disconnected — clean up their PC
    socket.on('peer-disconnected', ({ role, socketId }) => {
      if (role !== 'viewer' || !socketId) return;
      if (pcsRef.current[socketId]) {
        try { pcsRef.current[socketId].close(); } catch (_) {}
        delete pcsRef.current[socketId];
      }
      viewerCount.current = Math.max(0, viewerCount.current - 1);
      updateStatus();
      if (viewerCount.current === 0) onViewerLeft && onViewerLeft();
    });

    socket.on('connect_error', (err) => {
      setErrorText('Server error: ' + err.message);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {localStream ? (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.video}
          objectFit="cover"
          mirror={true}
          zOrder={0}
        />
      ) : (
        <View style={styles.placeholder} />
      )}

      <View style={styles.overlay}>
        <Text style={styles.status}>{statusText}</Text>
        <Text style={styles.room}>Room: {roomId}</Text>
        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#000' },
  video:       { flex: 1 },
  placeholder: { flex: 1, backgroundColor: '#111' },
  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 10,
    paddingBottom: 14,
    alignItems: 'center',
    gap: 2,
  },
  status: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  room:   { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  error:  { color: '#ff6b6b', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
