import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RTCPeerConnection, RTCView, mediaDevices, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import { supabase } from './supabase';

const Stack = createStackNavigator();
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
    <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Back to Login" : "Create Account"}</Text></TouchableOpacity></View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  // Calling States
  const [incomingCall, setIncomingCall] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  
  const pc = useRef(null);

  useEffect(() => {
    fetchUsers();
    
    // Global Listeners for Messages & Calls (Notifications)
    const channel = supabase.channel('global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me) {
          alert(`New message from ${p.new.sender_username}`);
          if (sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [sel]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('users_table').select('username');
    setUsers(data.filter(x => x.username !== me));
  };

  // --- WEBRTC LOGIC ---

  const stopCamera = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    if (pc.current) pc.current.close();
    setIsCalling(false);
  };

  const startLocalStream = async () => {
    const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    return stream;
  };

  const handleSignaling = async (signal) => {
    if (signal.type === 'offer') setIncomingCall(signal);
    if (signal.type === 'answer' && pc.current) {
      await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
    }
    if (signal.type === 'candidate' && pc.current) {
      await pc.current.addIceCandidate(new RTCIceCandidate(signal.data));
    }
    if (signal.type === 'hangup') stopCamera();
  };

  const initiateCall = async () => {
    setIsCalling(true);
    const stream = await startLocalStream();
    pc.current = new RTCPeerConnection(configuration);
    stream.getTracks().forEach(t => pc.current.addTrack(t, stream));

    pc.current.onicecandidate = (e) => {
      if (e.candidate) sendSignal('candidate', e.candidate);
    };
    pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    sendSignal('offer', offer);
  };

  const answerCall = async () => {
    const signal = incomingCall;
    setIncomingCall(null);
    setIsCalling(true);
    setSel(signal.caller);

    const stream = await startLocalStream();
    pc.current = new RTCPeerConnection(configuration);
    stream.getTracks().forEach(t => pc.current.addTrack(t, stream));

    pc.current.onicecandidate = (e) => {
      if (e.candidate) sendSignal('candidate', e.candidate, signal.caller);
    };
    pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);

    await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    
    // Send answer back to caller
    await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
  };

  const sendSignal = async (type, data, customReceiver = null) => {
    await supabase.from('calls').insert([{
      caller: me,
      receiver: customReceiver || sel,
      type: type,
      data: data
    }]);
  };

  const declineCall = async () => {
    await supabase.from('calls').insert([{ caller: me, receiver: incomingCall.caller, type: 'hangup' }]);
    setIncomingCall(null);
  };

  return (
    <View style={styles.row}>
      {/* Incoming Call Overlay */}
      {incomingCall && (
        <View style={styles.notifBar}>
          <Text style={{color:'#fff'}}>Incoming Call: {incomingCall.caller}</Text>
          <View style={{flexDirection:'row'}}>
            <TouchableOpacity onPress={answerCall} style={styles.accBtn}><Text style={{color:'#fff'}}>Accept</Text></TouchableOpacity>
            <TouchableOpacity onPress={declineCall} style={styles.decBtn}><Text style={{color:'#fff'}}>Decline</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {/* SIDEBAR */}
      <View style={styles.sidebar}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* MAIN CHAT AREA */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <Text style={{fontWeight:'bold'}}>{sel}</Text>
              {!isCalling && <TouchableOpacity onPress={initiateCall} style={styles.vBtn}><Text style={{color:'#fff'}}>Video Call</Text></TouchableOpacity>}
            </View>

            {isCalling ? (
              <View style={styles.vBox}>
                {remoteStream && <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />}
                {localStream && <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" zOrder={1} />}
                <TouchableOpacity onPress={() => { sendSignal('hangup', null); stopCamera(); }} style={styles.endBtn}>
                  <Text style={{color:'#fff'}}>End Call</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => (
                  <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}>
                    <Text>{item.content}</Text>
                  </View>
                )} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Type..." />
                  <TouchableOpacity onPress={async () => {
                    await supabase.from('messages').insert([{ sender_username: me, receiver_username: sel, content: txt }]);
                    setTxt('');
                  }} style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.center}><Text>Select a contact</Text></View>}
      </View>
    </View>
  );
}

// --- STYLES ---

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  title: { fontSize: 24, marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 30, width: 200, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  link: { marginTop: 20, color: '#0088cc' },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vBox: { flex: 1, backgroundColor: '#000' },
  remoteVideo: { flex: 1 },
  localVideo: { width: 120, height: 180, position: 'absolute', bottom: 100, right: 20, borderRadius: 10, backgroundColor: '#333' },
  endBtn: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center' },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  notifBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#0088cc', padding: 20, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accBtn: { backgroundColor: 'green', padding: 10, borderRadius: 5, marginRight: 10 },
  decBtn: { backgroundColor: 'red', padding: 10, borderRadius: 5 }
});

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown:false}}>
        <Stack.Screen name="Welcome" component={Welcome} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Chat" component={Chat} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
