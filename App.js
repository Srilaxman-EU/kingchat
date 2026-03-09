import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Safe Web/Mobile Hybrid Imports
let WebRTC = {};
if (Platform.OS !== 'web') {
  WebRTC = require('react-native-webrtc');
}

const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// --- VIDEO COMPONENT (Web-Safe) ---
const VideoStream = ({ stream, isLocal }) => {
  const vRef = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && vRef.current && stream) vRef.current.srcObject = stream;
  }, [stream]);

  if (!stream) return <View style={styles.noVideo}><Text style={{color:'#fff'}}>Camera Off</Text></View>;

  return Platform.OS === 'web' ? (
    <video ref={vRef} autoPlay playsInline muted={isLocal} style={isLocal ? styles.webSmall : styles.webBig} />
  ) : (
    <WebRTC.RTCView streamURL={stream.toURL()} style={isLocal ? styles.localV : styles.remoteV} objectFit="cover" zOrder={isLocal ? 1 : 0} />
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
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Switch to Register" : "Need an account?"}</Text></TouchableOpacity>
    </View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  // Call States
  const [callStatus, setCallStatus] = useState('idle'); 
  const [incoming, setIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  // 1. LOAD USERS LIST ON LOGIN
  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => {
      setUsers(data.filter(x => x.username !== me));
    });
  }, []);

  // 2. LOAD OLD CHAT HISTORY WHEN SELECTING A USER
  useEffect(() => {
    if (!sel) return;

    // Clear current screen and load history from DB
    const loadHistory = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_username.eq.${me},receiver_username.eq.${sel}),and(sender_username.eq.${sel},receiver_username.eq.${me})`)
        .order('created_at', { ascending: true });
      
      if (!error) setMsgs(data);
    };

    loadHistory();

    // 3. LISTEN FOR NEW MESSAGES (REAL-TIME)
    const sub = supabase.channel(`chat_${sel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        const newMessage = p.new;
        // Only show message if it belongs to the CURRENTLY OPENED chat
        if (
          (newMessage.sender_username === me && newMessage.receiver_username === sel) ||
          (newMessage.sender_username === sel && newMessage.receiver_username === me)
        ) {
          setMsgs(curr => [...curr, newMessage]);
        }
      })
      .subscribe();

    // Listener for Incoming Calls (Global)
    const callSub = supabase.channel('calls_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      }).subscribe();

    return () => {
      supabase.removeChannel(sub);
      supabase.removeChannel(callSub);
    };
  }, [sel]); // <--- This ensures history loads every time 'sel' (selected user) changes

  const sendMessage = async () => {
    if (!txt.trim() || !sel) return;
    
    const newMessage = { 
      sender_username: me, 
      receiver_username: sel, 
      content: txt 
    };

    // Save to Supabase (History)
    const { error } = await supabase.from('messages').insert([newMessage]);
    
    if (!error) {
      setTxt(''); // Clear input
      // Note: The Realtime listener above will automatically add the message to the list
    }
  };

  // ... (Keep the rest of the signaling and video functions the same) ...

  return (
    <View style={styles.row}>
      {/* (Keep the Calling Modals here) */}

      <View style={styles.side}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList 
          data={users} 
          keyExtractor={(item) => item.username}
          renderItem={({item}) => (
            <TouchableOpacity 
              style={[styles.tab, sel === item.username && styles.act]} 
              onPress={() => setSel(item.username)}
            >
              <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
            </TouchableOpacity>
          )} 
        />
      </View>

      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <Text style={{fontWeight:'bold'}}>{sel}</Text>
              <TouchableOpacity onPress={() => startCall(true)} style={styles.vBtn}>
                <Text style={{color:'#fff'}}>Video Call</Text>
              </TouchableOpacity>
            </View>

            {callStatus !== 'idle' ? (
              <View style={styles.videoWindow}>
                {/* ... (Keep VideoStream components here) ... */}
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList 
                  data={msgs} 
                  keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()} 
                  renderItem={({item}) => (
                    <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}>
                      <Text>{item.content}</Text>
                    </View>
                  )} 
                />
                <View style={styles.inRow}>
                  <TextInput 
                    value={txt} 
                    onChangeText={setTxt} 
                    style={styles.fld} 
                    placeholder="Type a message..." 
                  />
                  <TouchableOpacity onPress={sendMessage} style={styles.sBtn}>
                    <Text style={{color:'#fff'}}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.center}><Text>Select a contact to view history</Text></View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc' },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  videoWindow: { flex: 1, backgroundColor: '#000', position: 'relative' },
  webBig: { width: '100%', height: '100%', objectFit: 'cover' },
  webSmall: { width: '100%', height: '100%', objectFit: 'cover' },
  remoteV: { flex: 1 },
  localV: { flex: 1 },
  smallBox: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWeight: 2, borderColor: '#fff', backgroundColor: '#333' },
  overlay: { position: 'absolute', top: '40%', width: '100%', alignItems: 'center', zIndex: 10 },
  statusTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  endBtn: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  callCard: { backgroundColor: '#fff', padding: 40, borderRadius: 20, alignItems: 'center' },
  callName: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  accBtn: { backgroundColor: 'green', padding: 15, borderRadius: 10, marginRight: 10 },
  decBtn: { backgroundColor: 'red', padding: 15, borderRadius: 10 },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 }
});

export default function App() {
  return (
    <GestureHandlerRootView style={{flex:1}}><NavigationContainer><Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="Login" component={Login} /><Stack.Screen name="Chat" component={Chat} /></Stack.Navigator></NavigationContainer></GestureHandlerRootView>
  );
}
