import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

const Stack = createStackNavigator();
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- PLATFORM SAFE HELPERS ---
const getMediaDevices = () => Platform.OS === 'web' ? navigator.mediaDevices : require('react-native-webrtc').mediaDevices;
const getRTCPeerConnection = (config) => Platform.OS === 'web' ? new RTCPeerConnection(config) : new (require('react-native-webrtc').RTCPeerConnection)(config);

const VideoPlayer = ({ stream, isLocal }) => {
  const videoRef = useRef(null);
  useEffect(() => { if (Platform.OS === 'web' && videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  if (!stream) return <View style={styles.noStream}><Text style={{color:'#fff'}}>Camera Off</Text></View>;

  return Platform.OS === 'web' ? (
    <video ref={videoRef} autoPlay playsInline muted={isLocal} style={isLocal ? styles.smallVideo : styles.bigVideo} />
  ) : (
    <require('react-native-webrtc').RTCView streamURL={stream.toURL()} style={isLocal ? styles.smallVideo : styles.bigVideo} objectFit="cover" zOrder={isLocal ? 1 : 0} />
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
      <TouchableOpacity style={styles.btn} onPress={auth}><Text style={styles.btnTxt}>{isR ? "Register" : "Login"}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Create Account" : "Go to Login"}</Text></TouchableOpacity>
    </View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  // Signaling States
  const [incoming, setIncoming] = useState(null);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers(data.filter(x => x.username !== me)));

    // REAL-TIME ENGINE: Messages & Calls
    const channel = supabase.channel('king_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me) {
          if (sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
          else alert(`New message from ${p.new.sender_username}`);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleCallSignal(p.new);
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [sel]);

  const fetchHistory = async (userB) => {
    const { data } = await supabase.from('messages').select('*')
      .or(`and(sender_username.eq.${me},receiver_username.eq.${userB}),and(sender_username.eq.${userB},receiver_username.eq.${me})`)
      .order('created_at', { ascending: true });
    setMsgs(data || []);
  };

  const handleCallSignal = async (s) => {
    if (s.type === 'offer') setIncoming(s);
    if (s.type === 'hangup') endCall();
    if (s.type === 'answer' && pc.current) {
        await pc.current.setRemoteDescription(Platform.OS === 'web' ? s.data : new (require('react-native-webrtc').RTCSessionDescription)(s.data));
    }
    if (s.type === 'candidate' && pc.current) {
        await pc.current.addIceCandidate(Platform.OS === 'web' ? s.data : new (require('react-native-webrtc').RTCIceCandidate)(s.data));
    }
  };

  const startCall = async (type, isCaller, signal = null) => {
    setCallType(type);
    setIncoming(null);
    const stream = await getMediaDevices().getUserMedia({ audio: true, video: type === 'video' });
    setLocalStream(stream);

    pc.current = getRTCPeerConnection(ICE_SERVERS);
    
    // Add Stream
    if (Platform.OS === 'web') {
      stream.getTracks().forEach(t => pc.current.addTrack(t, stream));
      pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
      pc.current.addStream(stream);
      pc.current.onaddstream = (e) => setRemoteStream(e.stream);
    }

    // ICE Candidates
    pc.current.onicecandidate = (e) => {
      if (e.candidate) supabase.from('calls').insert([{ caller: me, receiver: isCaller ? sel : signal.caller, type: 'candidate', data: e.candidate }]);
    };

    if (isCaller) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer, is_audio: type === 'audio' }]);
    } else {
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new (require('react-native-webrtc').RTCSessionDescription)(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setCallType(null);
    if (pc.current) pc.current.close();
  };

  return (
    <View style={styles.row}>
      {/* INCOMING CALL NOTIFICATION */}
      {incoming && (
        <View style={styles.notify}><Text style={{color:'#fff'}}>{incoming.caller} calling...</Text>
          <TouchableOpacity onPress={() => { setSel(incoming.caller); startCall(incoming.is_audio ? 'audio' : 'video', false, incoming); }} style={styles.acc}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:incoming.caller, type:'hangup'}]); setIncoming(null); }} style={styles.dec}><Text style={{color:'#fff'}}>Decline</Text></TouchableOpacity>
        </View>
      )}

      {/* 30% SIDEBAR */}
      <View style={styles.sidebar}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => {setSel(item.username); fetchHistory(item.username);}}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* 70% MAIN AREA */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.header}>
              <Text style={{fontWeight:'bold'}}>{sel}</Text>
              <View style={{flexDirection:'row'}}>
                <TouchableOpacity onPress={() => startCall('audio', true)} style={styles.aBtn}><Text style={{color:'#fff'}}>Audio</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => startCall('video', true)} style={styles.vBtn}><Text style={{color:'#fff'}}>Video</Text></TouchableOpacity>
              </View>
            </View>

            {callType ? (
              <View style={styles.vStage}>
                <VideoPlayer stream={remoteStream} isLocal={false} />
                {callType === 'video' && (
                    <View style={styles.myCam}><VideoPlayer stream={localStream} isLocal={true} /></View>
                )}
                <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:sel, type:'hangup'}]); endCall(); }} style={styles.hang}><Text style={{color:'#fff'}}>Hang Up</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => <View style={[styles.msg, item.sender_username === me ? styles.myMsg : styles.otMsg]}><Text>{item.content}</Text></View>} />
                <View style={styles.in}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Message..." />
                  <TouchableOpacity onPress={async() => {await supabase.from('messages').insert([{sender_username:me, receiver_username:sel, content:txt}]); setTxt('');}} style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.center}><Text>Select a contact</Text></View>}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  header: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection:'row', justifyContent:'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, marginLeft: 5, paddingHorizontal: 15 },
  aBtn: { backgroundColor: '#007bff', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vStage: { flex: 1, backgroundColor: '#000', position: 'relative' },
  bigVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  smallVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  myCam: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  hang: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  otMsg: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  in: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  notify: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#0088cc', padding: 20, zIndex: 100, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  acc: { backgroundColor: 'green', padding: 10, borderRadius: 5 },
  dec: { backgroundColor: 'red', padding: 10, borderRadius: 5 },
  link: { marginTop: 20, color: '#0088cc' },
  noStream: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
