import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// Native WebRTC imports (ignored by Web)
let WebRTC = {};
if (Platform.OS !== 'web') {
  WebRTC = require('react-native-webrtc');
}

const Stack = createStackNavigator();

// --- 1. WELCOME ---
function Welcome({ navigation }) {
  return (
    <View style={styles.c}><Text style={styles.l}>👑 King Chat</Text>
    <TouchableOpacity style={styles.b} onPress={() => navigation.navigate('Login')}><Text style={styles.bt}>Get Started</Text></TouchableOpacity></View>
  );
}

// --- 2. LOGIN (Username/Password Check) ---
function Login({ navigation }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [isR, setR] = useState(false);
  const auth = async () => {
    if (isR) {
      const { error } = await supabase.from('users_table').insert([{ username: u, password: p }]);
      if (error) Alert.alert("Error", "Username taken"); else { Alert.alert("Success", "Account Created!"); setR(false); }
    } else {
      const { data } = await supabase.from('users_table').select('*').eq('username', u).eq('password', p).single();
      if (data) navigation.navigate('Chat', { me: u }); else Alert.alert("Error", "Invalid Login");
    }
  };
  return (
    <View style={styles.c}><Text style={styles.t}>{isR ? "Register" : "Login"}</Text>
    <TextInput placeholder="Username" style={styles.i} onChangeText={setU} autoCapitalize="none" />
    <TextInput placeholder="Password" style={styles.i} onChangeText={setP} secureTextEntry />
    <TouchableOpacity style={styles.b} onPress={auth}><Text style={styles.bt}>{isR ? "Submit" : "Login"}</Text></TouchableOpacity>
    <TouchableOpacity onPress={() => setR(!isR)}><Text style={{marginTop:20, color:'#0088cc'}}>{isR ? "Back to Login" : "Create Account"}</Text></TouchableOpacity></View>
  );
}

// --- 3. CHAT & VIDEO CALL ---
function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  
  // Video States
  const [calling, setCalling] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({data}) => setUsers(data.filter(x => x.username !== me)));
    
    // Signaling Listener (For receiving calls)
    const sub = supabase.channel('calls').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
      if (p.new.receiver === me) handleSignal(p.new);
    }).subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  // Signaling Handlers
  const sendSignal = async (type, data) => {
    await supabase.from('calls').insert([{ caller: me, receiver: sel, type, data }]);
  };

  const startCall = async () => {
    setCalling(true);
    const stream = await (Platform.OS === 'web' ? navigator.mediaDevices.getUserMedia({video:true, audio:true}) : WebRTC.mediaDevices.getUserMedia({video:true, audio:true}));
    setLocalStream(stream);
    // PeerConnection logic would go here (Simplified for UI)
    sendSignal('offer', { roomId: me });
  };

  const handleSignal = (signal) => {
    if (signal.type === 'offer') {
      Alert.alert("Incoming Call", `Call from ${signal.caller}`, [
        { text: "Accept", onPress: () => { setSel(signal.caller); setCalling(true); } },
        { text: "Decline", style: 'cancel' }
      ]);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.sidebar}><Text style={styles.sideH}>Contacts</Text>
      <FlatList data={users} renderItem={({item}) => (
        <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => setSel(item.username)}><Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text></TouchableOpacity>
      )} /></View>
      
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}><Text style={{fontWeight:'bold'}}>{sel}</Text>
            <TouchableOpacity onPress={startCall} style={styles.vBtn}><Text style={{color:'#fff'}}>Video Call</Text></TouchableOpacity></View>
            
            {calling ? (
              <View style={styles.vBox}>
                <Text style={{color:'#fff', position:'absolute', top:20, alignSelf:'center'}}>In Call with {sel}</Text>
                <TouchableOpacity onPress={() => setCalling(false)} style={styles.endBtn}><Text style={{color:'#fff'}}>End</Text></TouchableOpacity>
                {/* Local Video - Picture in Picture Style */}
                <View style={styles.localV}><Text style={{color:'#fff', fontSize:10}}>You</Text></View>
              </View>
            ) : (
              <View style={{flex:1}}>
                <FlatList data={msgs} renderItem={({item}) => <View style={styles.msg}><Text>{item.content}</Text></View>} />
                <View style={styles.inRow}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.fld} placeholder="Message..." />
                  <TouchableOpacity style={styles.sBtn}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.c}><Text>Select a contact to start</Text></View>}
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
  c: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  l: { fontSize: 40, fontWeight: 'bold', color: '#0088cc' },
  t: { fontSize: 24, marginBottom: 20 },
  i: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  b: { backgroundColor: '#0088cc', padding: 15, borderRadius: 30, width: 200, alignItems: 'center' },
  bt: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 18, fontWeight: 'bold' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  vBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 5 },
  vBox: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  localV: { width: 100, height: 150, backgroundColor: '#333', position: 'absolute', bottom: 20, right: 20, borderRadius: 10, borderWeight: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  endBtn: { backgroundColor: 'red', padding: 15, borderRadius: 30, width: 100, alignSelf: 'center', alignItems: 'center', position: 'absolute', bottom: 40 },
  inRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 }
});
