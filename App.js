import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Dimensions } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Mobile-only import check
let WebRTC = {};
if (Platform.OS !== 'web') {
  WebRTC = require('react-native-webrtc');
}

const Stack = createStackNavigator();
const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- HELPER COMPONENTS FOR VIDEO ---
const VideoView = ({ stream, isLocal }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  if (Platform.OS === 'web') {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={isLocal ? styles.webLocal : styles.webRemote}
      />
    );
  } else {
    return (
      <WebRTC.RTCView
        streamURL={stream.toURL()}
        style={isLocal ? styles.localVideo : styles.remoteVideo}
        objectFit="cover"
        zOrder={isLocal ? 1 : 0}
      />
    );
  }
};

// --- SCREENS ---

function LoginScreen({ navigation }) {
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
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Go to Login" : "Create Account"}</Text></TouchableOpacity>
    </View>
  );
}

function ChatScreen({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [calling, setCalling] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers(data.filter(x => x.username !== me)));
    
    // Realtime: Listen for Messages and Calls
    const sub = supabase.channel('global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me && sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [sel]);

  const fetchChat = async (target) => {
    const { data } = await supabase.from('messages').select('*')
      .or(`and(sender_username.eq.${me},receiver_username.eq.${target}),and(sender_username.eq.${target},receiver_username.eq.${me})`)
      .order('created_at', { ascending: true });
    setMsgs(data || []);
  };

  const sendMessage = async () => {
    if (!txt.trim()) return;
    const msg = { sender_username: me, receiver_username: sel, content: txt };
    await supabase.from('messages').insert([msg]);
    setMsgs(curr => [...curr, msg]);
    setTxt('');
  };

  // --- WEBRTC SIGNALING ---
  const handleSignaling = async (s) => {
    if (s.type === 'offer') setIncoming(s);
    if (s.type === 'hangup') endCallLocal();
    if (s.type === 'answer' && pc.current) {
      const desc = Platform.OS === 'web' ? s.data : new WebRTC.RTCSessionDescription(s.data);
      await pc.current.setRemoteDescription(desc);
    }
  };

  const startCall = async (isCaller, signal = null) => {
    setCalling(true);
    setIncoming(null);
    const stream = await (Platform.OS === 'web' ? navigator.mediaDevices.getUserMedia({ video: true, audio: true }) : WebRTC.mediaDevices.getUserMedia({ video: true, audio: true }));
    setLocalStream(stream);

    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceServers) : new WebRTC.RTCPeerConnection(iceServers);

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
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new WebRTC.RTCSessionDescription(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCallLocal = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setCalling(false);
    if (pc.current) pc.current.close();
  };

  return (
    <View style={styles.row}>
      {incoming && (
        <View style={styles.incomingBar}>
          <Text style={{ color: '#fff' }}>Call from {incoming.caller}</Text>
          <TouchableOpacity onPress={() => { setSel(incoming.caller); startCall(false, incoming); }} style={styles.accBtn}><Text style={{ color: '#fff' }}>Accept</Text></TouchableOpacity>
        </View>
      )}

      {/* SIDEBAR (30%) */}
      <View style={styles.sidebar}>
        <Text style={styles.sideTitle}>King Chat</Text>
        <FlatList data={users} renderItem={({ item }) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => { setSel(item.username); fetchChat(item.username); }}>
            <Text style={sel === item.username && { color: '#fff' }}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* CHAT AREA (70%) */}
      <View style={styles.main}>
        {sel ? (
          <View style={{ flex: 1 }}>
            <View style={styles.head}>
              <Text style={{ fontWeight: 'bold' }}>{sel}</Text>
              <TouchableOpacity onPress={() => startCall(true)} style={styles.vBtn}><Text style={{ color: '#fff' }}>Video Call</Text></TouchableOpacity>
            </View>

            {calling ? (
              <View style={styles.videoContainer}>
                {/* REMOTE (BIG) */}
                <VideoView stream={remoteStream} isLocal={false} />
                {/* LOCAL (SMALL BOTTOM RIGHT) */}
                <View style={styles.localWrapper}>
                   <VideoView stream={localStream} isLocal={true} />
                </View>
                <TouchableOpacity onPress={() => { supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'hangup' }]); endCallLocal(); }} style={styles.endBtn}><Text style={{ color: '#fff' }}>End</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <FlatList data={msgs} renderItem={({ item }) => (
                  <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}>
                    <Text>{item.content}</Text>
                  </View>
                )} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.inputField} placeholder="Message..." />
                  <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}><Text style={{ color: '#fff' }}>Send</Text></TouchableOpacity>
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  link: { marginTop: 20, color: '#0088cc' },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50, backgroundColor: '#fff' },
  sideTitle: { padding: 20, fontSize: 18, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  videoContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },
  remoteVideo: { flex: 1 },
  localVideo: { flex: 1, borderRadius: 10 },
  localWrapper: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', backgroundColor: '#333', borderWidth: 2, borderColor: '#fff' },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  endBtn: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 30 },
  msg: { padding: 12, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  inputField: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sendBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10, paddingHorizontal: 20 },
  incomingBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#0088cc', padding: 20, zIndex: 100, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accBtn: { backgroundColor: 'green', padding: 10, borderRadius: 5 }
});
