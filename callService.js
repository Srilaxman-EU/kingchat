import { Platform } from 'react-native';
import { supabase } from './supabase';

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * Create the platform-appropriate RTCPeerConnection.
 */
const createPeerConnection = () => {
  if (Platform.OS === 'web') {
    return new RTCPeerConnection(iceConfig);
  }
  const WebRTC = require('react-native-webrtc');
  return new WebRTC.RTCPeerConnection(iceConfig);
};

/**
 * Get user media (microphone + optional camera) for the current platform.
 */
export const getUserMedia = async (audio = true, video = false) => {
  const constraints = { audio, video };
  if (Platform.OS === 'web') {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const WebRTC = require('react-native-webrtc');
  return WebRTC.mediaDevices.getUserMedia(constraints);
};

/**
 * Initiate an outgoing audio or video call.
 * Creates an offer, persists it via Supabase, and returns { pc, localStream }.
 */
export const initiateCall = async (caller, receiver, type, onIceCandidate, onRemoteStream) => {
  const pc = createPeerConnection();
  const localStream = await getUserMedia(true, type === 'video');

  if (Platform.OS === 'web') {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => onRemoteStream(e.streams[0]);
  } else {
    pc.addStream(localStream);
    pc.onaddstream = (e) => onRemoteStream(e.stream);
  }

  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      try {
        await supabase.from('calls').insert([{
          caller,
          receiver,
          type: 'candidate',
          data: e.candidate,
        }]);
      } catch (_) { /* non-fatal: ICE trickle can tolerate dropped candidates */ }
      onIceCandidate(e.candidate);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await supabase.from('calls').insert([{
    caller,
    receiver,
    type: 'offer',
    data: offer,
    is_audio: type === 'audio',
  }]);

  return { pc, localStream };
};

/**
 * Answer an incoming call from a signaling payload.
 * Creates an answer, persists it via Supabase, and returns { pc, localStream }.
 */
export const answerCall = async (me, signal, type, onIceCandidate, onRemoteStream) => {
  const WebRTC = Platform.OS !== 'web' ? require('react-native-webrtc') : null;
  const pc = createPeerConnection();
  const localStream = await getUserMedia(true, type === 'video');

  if (Platform.OS === 'web') {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => onRemoteStream(e.streams[0]);
  } else {
    pc.addStream(localStream);
    pc.onaddstream = (e) => onRemoteStream(e.stream);
  }

  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      try {
        await supabase.from('calls').insert([{
          caller: me,
          receiver: signal.caller,
          type: 'candidate',
          data: e.candidate,
        }]);
      } catch (_) { /* non-fatal: ICE trickle can tolerate dropped candidates */ }
      onIceCandidate(e.candidate);
    }
  };

  const remoteDesc = Platform.OS === 'web'
    ? signal.data
    : new WebRTC.RTCSessionDescription(signal.data);
  await pc.setRemoteDescription(remoteDesc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await supabase.from('calls').insert([{
    caller: me,
    receiver: signal.caller,
    type: 'answer',
    data: answer,
  }]);

  return { pc, localStream };
};

/**
 * Apply incoming WebRTC signaling data (answer or ICE candidate) to an existing peer connection.
 */
export const handleSignalingData = async (pc, signal) => {
  const WebRTC = Platform.OS !== 'web' ? require('react-native-webrtc') : null;

  if (signal.type === 'answer') {
    const desc = Platform.OS === 'web'
      ? signal.data
      : new WebRTC.RTCSessionDescription(signal.data);
    await pc.setRemoteDescription(desc);
  }

  if (signal.type === 'candidate') {
    const cand = Platform.OS === 'web'
      ? signal.data
      : new WebRTC.RTCIceCandidate(signal.data);
    await pc.addIceCandidate(cand);
  }
};

/**
 * Clean up a call: stop all local tracks and close the peer connection.
 */
export const cleanupCall = (pc, localStream) => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  if (pc) {
    pc.close();
  }
};

/**
 * Send a hangup signal to the remote peer via Supabase.
 */
export const sendHangup = async (caller, receiver) => {
  await supabase.from('calls').insert([{
    caller,
    receiver,
    type: 'hangup',
  }]);
};

/**
 * Subscribe to incoming call signals for a user.
 * Returns a Supabase channel that can be removed with supabase.removeChannel().
 */
export const subscribeToCallSignals = (me, onSignal) => {
  return supabase
    .channel(`calls_${me}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'calls',
      filter: `receiver=eq.${me}`,
    }, (payload) => {
      onSignal(payload.new);
    })
    .subscribe();
};
