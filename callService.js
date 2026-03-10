import { Platform } from 'react-native';
import { supabase } from './supabase';

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * Create a platform-appropriate RTCPeerConnection
 */
const createPeerConnection = () => {
  if (Platform.OS === 'web') {
    return new RTCPeerConnection(iceConfig);
  }
  const { RTCPeerConnection } = require('react-native-webrtc');
  return new RTCPeerConnection(iceConfig);
};

/**
 * Get local media stream for audio or video call
 */
const getLocalStream = async (isVideo) => {
  const constraints = { audio: true, video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false };
  if (Platform.OS === 'web') {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const { mediaDevices } = require('react-native-webrtc');
  return mediaDevices.getUserMedia(constraints);
};

/**
 * Initiate an audio call to a recipient
 * Returns { peerConnection, localStream, callId }
 */
export const initiateAudioCall = async (caller, recipient) => {
  return _initiateCall(caller, recipient, 'audio');
};

/**
 * Initiate a video call to a recipient
 * Returns { peerConnection, localStream, callId }
 */
export const initiateVideoCall = async (caller, recipient) => {
  return _initiateCall(caller, recipient, 'video');
};

const _initiateCall = async (caller, recipient, type) => {
  const localStream = await getLocalStream(type === 'video');
  const peerConnection = createPeerConnection();

  if (Platform.OS === 'web') {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  } else {
    peerConnection.addStream(localStream);
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const { data, error } = await supabase.from('calls').insert([{
    caller,
    recipient,
    offer_sdp: JSON.stringify(offer),
    status: 'ringing',
    type,
    started_at: new Date().toISOString(),
  }]).select().single();

  if (error) {
    localStream.getTracks().forEach((t) => t.stop());
    peerConnection.close();
    throw error;
  }

  return { peerConnection, localStream, callId: data.id };
};

/**
 * Answer an incoming call
 * Returns { peerConnection, localStream }
 */
export const answerCall = async (callRecord, onRemoteStream) => {
  const type = callRecord.type;
  const localStream = await getLocalStream(type === 'video');
  const peerConnection = createPeerConnection();

  if (Platform.OS === 'web') {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (e) => onRemoteStream && onRemoteStream(e.streams[0]);
  } else {
    peerConnection.addStream(localStream);
    peerConnection.onaddstream = (e) => onRemoteStream && onRemoteStream(e.stream);
  }

  const offerDesc = JSON.parse(callRecord.offer_sdp);
  if (Platform.OS !== 'web') {
    const { RTCSessionDescription } = require('react-native-webrtc');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDesc));
  } else {
    await peerConnection.setRemoteDescription(offerDesc);
  }

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  const { error } = await supabase.from('calls')
    .update({ answer_sdp: JSON.stringify(answer), status: 'accepted' })
    .eq('id', callRecord.id);
  if (error) {
    localStream.getTracks().forEach((t) => t.stop());
    peerConnection.close();
    throw error;
  }

  return { peerConnection, localStream };
};

/**
 * End (hang up) a call
 */
export const endCall = async (callId, localStream, peerConnection) => {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
  if (callId) {
    await supabase.from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId);
  }
};

/**
 * List incoming (ringing) calls for a user
 */
export const getIncomingCalls = async (username) => {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('recipient', username)
    .eq('status', 'ringing');
  if (error) throw error;
  return data || [];
};

/**
 * Subscribe to incoming calls for a user
 * Returns the Supabase channel — call channel.unsubscribe() to clean up
 */
export const subscribeToIncomingCalls = (username, onIncomingCall) => {
  const channel = supabase
    .channel(`incoming_calls:${username}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'calls', filter: `recipient=eq.${username}` },
      (payload) => {
        if (payload.new.status === 'ringing') {
          onIncomingCall(payload.new);
        }
      }
    )
    .subscribe();
  return channel;
};

/**
 * Subscribe to updates on a specific call (e.g., answer, end)
 * Returns the Supabase channel — call channel.unsubscribe() to clean up
 */
export const subscribeToCallUpdates = (callId, onUpdate) => {
  const channel = supabase
    .channel(`call_updates:${callId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
  return channel;
};

/**
 * Add a local ICE candidate to a call record
 */
export const addIceCandidate = async (callId, candidate, isLocal) => {
  const field = isLocal ? 'local_ice' : 'remote_ice';
  const { data: existing } = await supabase
    .from('calls')
    .select(field)
    .eq('id', callId)
    .single();

  const current = existing && existing[field] ? JSON.parse(existing[field]) : [];
  current.push(candidate);

  const { error } = await supabase
    .from('calls')
    .update({ [field]: JSON.stringify(current) })
    .eq('id', callId);
  if (error) throw error;
};

/**
 * Retrieve ICE candidates for a call
 */
export const getIceCandidates = async (callId, isLocal) => {
  const field = isLocal ? 'local_ice' : 'remote_ice';
  const { data, error } = await supabase
    .from('calls')
    .select(field)
    .eq('id', callId)
    .single();
  if (error) throw error;
  if (!data || !data[field]) return [];
  return JSON.parse(data[field]);
};
