import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Safe Import for WebRTC
let WebRTC = {};
if (Platform.OS !== 'web') {
  WebRTC = require('react-native-webrtc');
}

const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- SCREENS ---

function Welcome({ navigation }) {
  return (
    <View style={styles.center}><Text style={styles.logo}>👑 King Chat</Text>
    <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Login')}><Text style={styles.btnTxt}>Enter</Text></TouchableOpacity></View>
  );
}

function Login({ navigation }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [isR, setR] = useState(false);
  const auth = async () => {
    if (isR) {
      const { error } = await supabase.from('users_table').insert([{ username: u, password: p }]);
      if (error) alert("Username taken"); else { alert("Account Created"); setR(false); }
    } else {
      const { data } = await supabase.from('users_table').select('*').eq('username', u).eq('password', p).single();
      if (data) navigation.navigate('Chat', { me: u }); else alert("Invalid Login");
    }
  };
  return (
    <View style={styles.center}><Text style={styles.title}>{isR ? "Register" : "Login"}</Text>
    <TextInput placeholder="Username" style={styles.input} onChangeText={setU} autoCapitalize="none" />
    <TextInput placeholder="Password" style={styles.input} onChangeText={setP} secureTextEntry />
    <TouchableOpacity style={styles.btn} onPress={auth}><Text style={styles.btnTxt}>Submit</Text></TouchableOpacity>
    <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Create Account" : "Go to Login"}</Text></TouchableOpacity></View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  const [incoming, setIncoming] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    fetchUsers();
    const channel = supabase.channel('realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me && sel === p.new.sender_username) setMsgs(c => [...c, p.new]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignal(p.new);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [sel]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('users_table').select('username');
    setUsers(data.filter(x => x.username !== me));
  };

  // --- VIDEO LOGIC ---
  const stopCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setIsCalling(false);
    if (pc.current) pc.current.close();
  };

  const handleSignal = async (s) => {
    if (s.type === 'offer') setIncoming(s);
    if (s.type === 'hangup') stopCall();
    if (s.type === 'answer' && pc.current) {
        const desc = Platform.OS === 'web' ? s.data : new WebRTC.RTCSessionDescription(s.data);
        await pc.current.setRemoteDescription(desc);
    }
  };

  const startCall = async () => {
    setIsCalling(true);
    const stream = await (Platform.OS === 'web' ? navigator.mediaDevices.getUserMedia({video:true, audio:true}) : WebRTC.mediaDevices.getUserMedia({video:true, audio:true}));
    setLocalStream(stream);
    
    // Create PeerConnection
    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceConfig) : new WebRTC.RTCPeerConnection(iceConfig);
    
    if (Platform.OS === 'web') {
        stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
        pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
        pc.current.addStream(stream);
        pc.current.onaddstream = (e) => setRemoteStream(e.stream);
    }

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer }]);
  };

  return (
    <View style={styles.row}>
      {incoming && (
        <View style={styles.pop}><Text style={{color:'#fff'}}>Call from {incoming.caller}</Text>
        <TouchableOpacity onPress={() => { setSel(incoming.caller); setIncoming(null); startCall(); }} style={styles.acc}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity></View>
      )}

      <View style={styles.side}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}><Text>{sel}</Text>
            <TouchableOpacity onPress={startCall} style={styles.vBtn}><Text style={{color:'#fff'}}>Video Call</Text></TouchableOpacity></View>
            
            {isCalling ? (
              <View style={styles.vBox}>
                <TouchableOpacity onPress={() => { supabase.from('calls').insert([{caller:me, receiver:sel, type:'hangup'}]); stopCall(); }} style={styles.end}><Text style={{color:'#fff'}}>End</Text></TouchableOpacity>
                <Text style={{color:'#fff', position:'absolute', top:20, alignSelf:'center'}}>Video Active</Text>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => <View style={styles.msg}><Text>{item.content}</Text></View>} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Message..." />
                  <TouchableOpacity onPress={async () => { await supabase.from('messages').insert([{sender_username:me, receiver_username:sel, content:txt}]); setTxt(''); }} style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
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
    <GestureHandlerRootView style={{flex:1}}><NavigationContainer><Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="Welcome" component={Welcome} /><Stack.Screen name="Login" component={Login} /><Stack.Screen name="Chat" component={Chat} /></Stack.Navigator></NavigationContainer></GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc' },
  title: { fontSize: 24, marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 30, width: 200, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vBox: { flex: 1, backgroundColor: '#000' },
  end: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center' },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%', backgroundColor:'#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  pop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#0088cc', padding: 20, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between' },
  acc: { backgroundColor: 'green', padding: 10, borderRadius: 5 },
  link: { marginTop: 20, color: '#0088cc' }
});
