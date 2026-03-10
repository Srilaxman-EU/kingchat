import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Helper to prevent Web crashes
const RTCView = Platform.OS !== 'web' ? require('react-native-webrtc').RTCView : null;
const RTCPeerConnectionNative = Platform.OS !== 'web' ? require('react-native-webrtc').RTCPeerConnection : null;
const RTCSessionDescriptionNative = Platform.OS !== 'web' ? require('react-native-webrtc').RTCSessionDescription : null;
const RTCIceCandidateNative = Platform.OS !== 'web' ? require('react-native-webrtc').RTCIceCandidate : null;
const mediaDevicesNative = Platform.OS !== 'web' ? require('react-native-webrtc').mediaDevices : null;

const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- VIDEO COMPONENT ---
const VideoStream = ({ stream, isLocal }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return <View style={styles.noVideo}><Text style={{color:'#fff'}}>Camera Off</Text></View>;

  if (Platform.OS === 'web') {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={isLocal ? styles.webSmall : styles.webBig}
      />
    );
  } else {
    return (
      <RTCView
        streamURL={stream.toURL()}
        style={isLocal ? styles.mobileSmall : styles.mobileBig}
        objectFit="cover"
        zOrder={isLocal ? 1 : 0}
      />
    );
  }
};

// --- LOGIN SCREEN ---
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
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Create Account" : "Back to Login"}</Text></TouchableOpacity>
    </View>
  );
}

// --- CHAT & CALL SCREEN ---
function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, connected
  const [incoming, setIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers(data.filter(x => x.username !== me)));
    
    const sub = supabase.channel('realtime_king')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me && sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [sel]);

  const handleSignaling = async (s) => {
    if (s.type === 'offer') setIncoming(s);
    if (s.type === 'hangup') endCall();
    if (s.type === 'answer' && pc.current) {
      setCallStatus('connected');
      const desc = Platform.OS === 'web' ? s.data : new RTCSessionDescriptionNative(s.data);
      await pc.current.setRemoteDescription(desc);
    }
  };

  const startCall = async (isCaller, signal = null) => {
    setCallStatus(isCaller ? 'calling' : 'connected');
    setIncoming(null);
    const stream = await (Platform.OS === 'web' ? navigator.mediaDevices.getUserMedia({video:true, audio:true}) : mediaDevicesNative.getUserMedia({video:true, audio:true}));
    setLocalStream(stream);

    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceConfig) : new RTCPeerConnectionNative(iceConfig);

    if (Platform.OS === 'web') {
      stream.getTracks().forEach(t => pc.current.addTrack(t, stream));
      pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
      pc.current.addStream(stream);
      pc.current.onaddstream = (e) => setRemoteStream(e.stream);
    }

    if (isCaller) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer }]);
    } else {
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new RTCSessionDescriptionNative(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setCallStatus('idle');
    if (pc.current) pc.current.close();
  };

  return (
    <View style={styles.row}>
      {incoming && (
        <View style={styles.notif}><Text style={{color:'#fff'}}>{incoming.caller} Calling...</Text>
        <TouchableOpacity onPress={() => {setSel(incoming.caller); startCall(false, incoming);}} style={styles.acc}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity></View>
      )}

      <View style={styles.side}>
        <Text style={styles.logoSmall}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}><Text style={{fontWeight:'bold'}}>{sel}</Text>
            <TouchableOpacity onPress={() => startCall(true)} style={styles.vBtn}><Text style={{color:'#fff'}}>Video Call</Text></TouchableOpacity></View>
            
            {callStatus !== 'idle' ? (
              <View style={styles.vBox}>
                <VideoStream stream={remoteStream} isLocal={false} />
                <View style={styles.localWrapper}><VideoStream stream={localStream} isLocal={true} /></View>
                <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:sel, type:'hangup'}]); endCall(); }} style={styles.end}><Text style={{color:'#fff'}}>End</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}><Text>{item.content}</Text></View>} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Message..." />
                  <TouchableOpacity onPress={async () => {await supabase.from('messages').insert([{sender_username:me, receiver_username:sel, content:txt}]); setTxt(''); }} style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.center}><Text>Select Contact</Text></View>}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex:1}}><NavigationContainer><Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="Login" component={Login} /><Stack.Screen name="Chat" component={Chat} /></Stack.Navigator></NavigationContainer></GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc' },
  logoSmall: { padding: 20, fontSize: 20, fontWeight: 'bold', color: '#0088cc' },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vBox: { flex: 1, backgroundColor: '#000' },
  webBig: { width: '100%', height: '100%', objectFit: 'cover' },
  webSmall: { width: '100%', height: '100%', objectFit: 'cover' },
  mobileBig: { flex: 1 },
  mobileSmall: { flex: 1 },
  localWrapper: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  end: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  notif: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#0088cc', padding: 20, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between' },
  acc: { backgroundColor: 'green', padding: 10, borderRadius: 5 },
  link: { marginTop: 20, color: '#0088cc' },
  noVideo: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
