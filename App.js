import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Hybrid Native/Web WebRTC logic
let WebRTC = {};
if (Platform.OS !== 'web') {
  WebRTC = require('react-native-webrtc');
}

const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- WEB/NATIVE VIDEO RENDERER ---
const MediaStreamView = ({ stream, isLocal, audioOnly }) => {
  const vRef = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && vRef.current && stream) vRef.current.srcObject = stream;
  }, [stream]);

  if (audioOnly && !isLocal) return <View style={styles.audioCenter}><Text style={styles.logo}>📞 Audio Call...</Text></View>;
  if (!stream) return null;

  return Platform.OS === 'web' ? (
    <video ref={vRef} autoPlay playsInline muted={isLocal} style={isLocal ? styles.webLocal : styles.webRemote} />
  ) : (
    <WebRTC.RTCView streamURL={stream.toURL()} style={isLocal ? styles.localV : styles.remoteV} objectFit="cover" zOrder={isLocal ? 1 : 0} />
  );
};

// --- CHAT & CALLING LOGIC ---
function ChatScreen({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  // Call States
  const [callType, setCallType] = useState('none'); // 'video', 'audio'
  const [status, setStatus] = useState('idle'); // idle, calling, connected
  const [incoming, setIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers(data.filter(u => u.username !== me)));

    const sub = supabase.channel('signaling')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignal(p.new);
      }).subscribe();

    return () => supabase.removeChannel(sub);
  }, []);

  const handleSignal = async (s) => {
    if (s.type === 'offer') setIncoming(s);
    if (s.type === 'hangup') endCall();
    if (s.type === 'answer' && pc.current) {
      setStatus('connected');
      const desc = Platform.OS === 'web' ? s.data : new WebRTC.RTCSessionDescription(s.data);
      await pc.current.setRemoteDescription(desc);
    }
  };

  const startCall = async (type, isCaller, signal = null) => {
    setCallType(type);
    setStatus(isCaller ? 'calling' : 'connected');
    setIncoming(null);

    const stream = await (Platform.OS === 'web' 
      ? navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true }) 
      : WebRTC.mediaDevices.getUserMedia({ video: type === 'video', audio: true }));
    setLocalStream(stream);

    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceConfig) : new WebRTC.RTCPeerConnection(iceConfig);
    
    if (Platform.OS === 'web') {
      stream.getTracks().forEach(t => pc.current.addTrack(t, stream));
      pc.current.ontrack = e => setRemoteStream(e.streams[0]);
    } else {
      pc.current.addStream(stream);
      pc.current.onaddstream = e => setRemoteStream(e.stream);
    }

    if (isCaller) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer, is_audio_only: type === 'audio' }]);
    } else {
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new WebRTC.RTCSessionDescription(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setStatus('idle'); setCallType('none');
    if (pc.current) pc.current.close();
  };

  return (
    <View style={styles.row}>
      {/* INCOMING MODAL */}
      <Modal visible={!!incoming} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{incoming?.caller}</Text>
            <Text>{incoming?.is_audio_only ? '📞 Audio Call...' : '📹 Video Call...'}</Text>
            <View style={{flexDirection:'row', marginTop:20}}>
              <TouchableOpacity onPress={() => startCall(incoming.is_audio_only ? 'audio' : 'video', false, incoming)} style={styles.acc}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:incoming.caller, type:'hangup'}]); setIncoming(null); }} style={styles.dec}><Text style={{color:'#fff'}}>Decline</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SIDEBAR */}
      <View style={styles.side}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* CHAT AREA */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <Text style={{fontWeight:'bold'}}>{sel}</Text>
              <View style={{flexDirection:'row'}}>
                <TouchableOpacity onPress={() => startCall('audio', true)} style={styles.aBtn}><Text style={{color:'#fff'}}>Audio</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => startCall('video', true)} style={styles.vBtn}><Text style={{color:'#fff'}}>Video</Text></TouchableOpacity>
              </View>
            </View>

            {status !== 'idle' ? (
              <View style={styles.vWindow}>
                {status === 'calling' && <Text style={styles.statusLabel}>Calling {sel}...</Text>}
                <MediaStreamView stream={remoteStream} isLocal={false} audioOnly={callType === 'audio'} />
                {callType === 'video' && (
                  <View style={styles.localWrapper}>
                    <MediaStreamView stream={localStream} isLocal={true} audioOnly={false} />
                  </View>
                )}
                <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:sel, type:'hangup'}]); endCall(); }} style={styles.end}><Text style={{color:'#fff'}}>Hang Up</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{flex:1}}><Text style={{textAlign:'center', marginTop:20}}>History Loading...</Text></View>
            )}
          </View>
        ) : <View style={styles.center}><Text>Select Contact</Text></View>}
      </View>
    </View>
  );
}

// ... (Keep Welcome, Login, and Export default as before) ...

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 30, fontWeight: 'bold', color: '#0088cc' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f9f9f9', borderRightWidth: 1, borderColor: '#eee', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15, marginLeft: 5 },
  aBtn: { backgroundColor: '#007bff', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vWindow: { flex: 1, backgroundColor: '#000', position: 'relative' },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  remoteV: { flex: 1 },
  localV: { flex: 1 },
  localWrapper: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  end: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 30, borderRadius: 20, alignItems: 'center' },
  cardTitle: { fontSize: 22, fontWeight: 'bold' },
  acc: { backgroundColor: 'green', padding: 10, borderRadius: 10, marginRight: 10 },
  dec: { backgroundColor: 'red', padding: 10, borderRadius: 10 },
  statusLabel: { color: '#fff', position: 'absolute', top: 50, alignSelf: 'center', fontSize: 18, zIndex: 5 },
  audioCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default function App() {
    // Wrap with Stack.Navigator and NavigationContainer as usual
}
