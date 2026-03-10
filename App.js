import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// --- PLATFORM SAFE WEBRTC IMPORTS ---
const WebRTC = Platform.OS !== 'web' ? require('react-native-webrtc') : null;

const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- TELEGRAM-STYLE VIDEO COMPONENT ---
const VideoPlayer = ({ stream, isLocal, audioOnly }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  if (audioOnly && !isLocal) return (
    <View style={styles.audioPlaceholder}><Text style={styles.audioIcon}>📞</Text><Text style={{color:'#fff'}}>Audio Call Active</Text></View>
  );
  if (!stream) return null;

  return Platform.OS === 'web' ? (
    <video ref={videoRef} autoPlay playsInline muted={isLocal} style={isLocal ? styles.webLocal : styles.webRemote} />
  ) : (
    <WebRTC.RTCView streamURL={stream.toURL()} style={isLocal ? styles.mobileLocal : styles.mobileRemote} objectFit="cover" zOrder={isLocal ? 1 : 0} />
  );
};

// --- SCREENS ---
function Login({ navigation }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [isR, setR] = useState(false);
  const auth = async () => {
    if (isR) {
      const { error } = await supabase.from('users_table').insert([{ username: u, password: p }]);
      if (error) alert("Username taken"); else { alert("User Created!"); setR(false); }
    } else {
      const { data } = await supabase.from('users_table').select('*').eq('username', u).eq('password', p).single();
      if (data) navigation.navigate('Chat', { me: u }); else alert("Invalid Login");
    }
  };
  return (
    <View style={styles.center}><Text style={styles.logo}>👑 King Chat</Text>
      <TextInput placeholder="Username" style={styles.input} onChangeText={setU} autoCapitalize="none" />
      <TextInput placeholder="Password" style={styles.input} onChangeText={setP} secureTextEntry />
      <TouchableOpacity style={styles.btn} onPress={auth}><Text style={styles.btnText}>{isR ? "Register" : "Login"}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Create Account" : "Login instead"}</Text></TouchableOpacity>
    </View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  const [callState, setCallState] = useState('idle'); // idle, ringing, connected
  const [incoming, setIncoming] = useState(null);
  const [isAudio, setIsAudio] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers(data.filter(x => x.username !== me)));

    // Real-time: Global Listener for Calls and Messages
    const channel = supabase.channel('global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me && sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [sel]);

  // Load History when switching users
  useEffect(() => {
    if (sel) {
      supabase.from('messages').select('*')
        .or(`and(sender_username.eq.${me},receiver_username.eq.${sel}),and(sender_username.eq.${sel},receiver_username.eq.${me})`)
        .order('created_at', { ascending: true })
        .then(({data}) => setMsgs(data || []));
    }
  }, [sel]);

  const handleSignaling = async (s) => {
    if (s.type === 'offer') { setIncoming(s); setIsAudio(s.is_audio); }
    if (s.type === 'hangup') endCall();
    if (s.type === 'answer' && pc.current) {
      setCallState('connected');
      const desc = Platform.OS === 'web' ? s.data : new WebRTC.RTCSessionDescription(s.data);
      await pc.current.setRemoteDescription(desc);
    }
    if (s.type === 'candidate' && pc.current) {
      const cand = Platform.OS === 'web' ? s.data : new WebRTC.RTCIceCandidate(s.data);
      await pc.current.addIceCandidate(cand);
    }
  };

  const startCall = async (type, isCaller, signal = null) => {
    setIsAudio(type === 'audio');
    setCallState(isCaller ? 'ringing' : 'connected');
    setIncoming(null);

    const stream = await (Platform.OS === 'web' ? navigator.mediaDevices.getUserMedia({video: type==='video', audio:true}) : WebRTC.mediaDevices.getUserMedia({video: type==='video', audio:true}));
    setLocalStream(stream);

    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceConfig) : new WebRTC.RTCPeerConnection(iceConfig);
    
    if (Platform.OS === 'web') {
      stream.getTracks().forEach(t => pc.current.addTrack(t, stream));
      pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
      pc.current.addStream(stream);
      pc.current.onaddstream = (e) => setRemoteStream(e.stream);
    }

    pc.current.onicecandidate = (e) => {
      if (e.candidate) supabase.from('calls').insert([{ caller: me, receiver: isCaller ? sel : signal.caller, type: 'candidate', data: e.candidate }]);
    };

    if (isCaller) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer, is_audio: type === 'audio' }]);
    } else {
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new WebRTC.RTCSessionDescription(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setCallState('idle');
    if (pc.current) pc.current.close();
  };

  return (
    <View style={styles.row}>
      {/* 1. INCOMING CALL MODAL */}
      <Modal visible={!!incoming} transparent animationType="fade">
        <View style={styles.modal}>
          <View style={styles.card}>
            <Text style={styles.callFrom}>{incoming?.caller}</Text>
            <Text style={{marginBottom: 20}}>{incoming?.is_audio ? 'Audio Call...' : 'Video Call...'}</Text>
            <View style={{flexDirection: 'row'}}>
              <TouchableOpacity onPress={() => {setSel(incoming.caller); startCall(incoming.is_audio ? 'audio' : 'video', false, incoming);}} style={styles.acc}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => {supabase.from('calls').insert([{caller:me, receiver:incoming.caller, type:'hangup'}]); setIncoming(null);}} style={styles.dec}><Text style={{color:'#fff'}}>Decline</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. SIDEBAR (30%) */}
      <View style={styles.side}>
        <Text style={styles.logoSide}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* 3. CHAT AREA (70%) */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <Text style={{fontWeight:'bold'}}>{sel}</Text>
              <View style={{flexDirection:'row'}}>
                <TouchableOpacity onPress={() => startCall('audio', true)} style={styles.audioBtn}><Text style={{color:'#fff'}}>Audio</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => startCall('video', true)} style={styles.videoBtn}><Text style={{color:'#fff'}}>Video</Text></TouchableOpacity>
              </View>
            </View>

            {callState !== 'idle' ? (
              <View style={styles.vStage}>
                {callState === 'ringing' && <View style={styles.ringing}><Text style={{color:'#fff', fontSize: 20}}>Calling {sel}...</Text></View>}
                <VideoPlayer stream={remoteStream} isLocal={false} audioOnly={isAudio} />
                {!isAudio && <View style={styles.pip}><VideoPlayer stream={localStream} isLocal={true} audioOnly={false} /></View>}
                <TouchableOpacity onPress={() => {supabase.from('calls').insert([{caller:me, receiver:sel, type:'hangup'}]); endCall();}} style={styles.hang}><Text style={{color:'#fff', fontWeight:'bold'}}>Hang up</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}><Text>{item.content}</Text></View>} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Message..." />
                  <TouchableOpacity onPress={async() => {await supabase.from('messages').insert([{sender_username:me, receiver_username:sel, content:txt}]); setTxt(''); }} style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.center}><Text>Select a contact to chat</Text></View>}
      </View>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  logoSide: { padding: 20, fontSize: 18, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  videoBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15, marginLeft: 5 },
  audioBtn: { backgroundColor: '#007bff', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vStage: { flex: 1, backgroundColor: '#000', position: 'relative' },
  pip: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#222' },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  mobileRemote: { flex: 1 },
  mobileLocal: { flex: 1 },
  hang: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  ringing: { position: 'absolute', top: '40%', width: '100%', alignItems: 'center', zIndex: 10 },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 40, borderRadius: 20, alignItems: 'center' },
  callFrom: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  acc: { backgroundColor: 'green', padding: 15, borderRadius: 10, marginRight: 10 },
  dec: { backgroundColor: 'red', padding: 15, borderRadius: 10 },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  audioPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioIcon: { fontSize: 60, marginBottom: 20 },
  link: { marginTop: 20, color: '#0088cc' }
});

export default function App() {
  return (
    <GestureHandlerRootView style={{flex:1}}><NavigationContainer><Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="Login" component={Login} /><Stack.Screen name="Chat" component={Chat} /></Stack.Navigator></NavigationContainer></GestureHandlerRootView>
  );
}
