import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

const Stack = createStackNavigator();

// --- WELCOME PAGE ---
function Welcome({ navigation }) {
  return (
    <View style={styles.c}>
      <Text style={styles.l}>👑 King Chat</Text>
      <TouchableOpacity style={styles.b} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.bt}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- LOGIN PAGE ---
function Login({ navigation }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [isR, setR] = useState(false);
  const auth = async () => {
    if (isR) {
      const { error } = await supabase.from('users_table').insert([{ username: u, password: p }]);
      if (error) Alert.alert("Error", "User exists"); else { Alert.alert("Success", "Now Login"); setR(false); }
    } else {
      const { data } = await supabase.from('users_table').select('*').eq('username', u).eq('password', p).single();
      if (data) navigation.navigate('Chat', { me: u }); else Alert.alert("Error", "Wrong Login");
    }
  };
  return (
    <View style={styles.c}>
      <Text style={styles.t}>{isR ? "Register" : "Login"}</Text>
      <TextInput placeholder="Username" style={styles.i} onChangeText={setU} />
      <TextInput placeholder="Password" style={styles.i} onChangeText={setP} secureTextEntry />
      <TouchableOpacity style={styles.b} onPress={auth}><Text style={styles.bt}>{isR ? "Register" : "Login"}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={{marginTop:20, color:'#0088cc'}}>{isR ? "Switch to Login" : "Create Account"}</Text></TouchableOpacity>
    </View>
  );
}

// --- CHAT PAGE WITH VIDEO CALL ---
function Chat({ route }) {
  const { me } = route.params; 
  const [users, setUsers] = useState([]); 
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]); 
  const [txt, setTxt] = useState('');
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({data}) => setUsers(data.filter(x => x.username !== me)));
  }, []);

  useEffect(() => {
    if (!sel) return;
    supabase.from('messages').select('*').or(`and(sender_username.eq.${me},receiver_username.eq.${sel}),and(sender_username.eq.${sel},receiver_username.eq.${me})`).order('created_at', { ascending: true }).then(({data}) => setMsgs(data || []));
    const sub = supabase.channel('chat').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
      if ((p.new.sender_username === me && p.new.receiver_username === sel) || (p.new.sender_username === sel && p.new.receiver_username === me)) setMsgs(prev => [...prev, p.new]);
    }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [sel]);

  const startCall = () => {
    if (!sel) return;
    setShowVideo(true);
  };

  // Unique Room ID for the two users
  const roomId = [me, sel].sort().join('-');

  return (
    <View style={styles.row}>
      {/* SIDEBAR */}
      <View style={styles.sidebar}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity style={[styles.tab, sel === item.username && styles.act]} onPress={() => {setSel(item.username); setShowVideo(false);}}>
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* CHAT AREA */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <Text style={{fontWeight:'bold'}}>Chat with {sel}</Text>
              <TouchableOpacity onPress={startCall} style={styles.callBtn}>
                <Text style={{color:'#fff', fontSize:12}}>Video Call</Text>
              </TouchableOpacity>
            </View>

            {showVideo ? (
              <View style={styles.videoContainer}>
                <TouchableOpacity onPress={() => setShowVideo(false)} style={styles.closeVideo}>
                  <Text style={{color:'#fff'}}>End Call</Text>
                </TouchableOpacity>
                <iframe
                  src={`https://meet.jit.si/${roomId}#config.prejoinPageEnabled=false`}
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none' }}
                  allow="camera; microphone; display-capture; fullscreen"
                />
              </View>
            ) : (
              <>
                <FlatList data={msgs} renderItem={({item}) => (
                  <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}>
                    <Text>{item.content}</Text>
                  </View>
                )} />
                <View style={styles.in}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.f} placeholder="Type..." />
                  <TouchableOpacity onPress={async () => { await supabase.from('messages').insert([{ sender_username: me, receiver_username: sel, content: txt }]); setTxt(''); }} style={styles.sB}><Text style={{color:'#fff'}}>Send</Text></TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ) : <View style={styles.c}><Text>Select a contact</Text></View>}
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
  l: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  t: { fontSize: 24, marginBottom: 20 },
  i: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  b: { backgroundColor: '#0088cc', padding: 15, borderRadius: 30, width: 200, alignItems: 'center' },
  bt: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: { width: '30%', backgroundColor: '#f0f0f0', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  sideH: { padding: 20, fontSize: 20, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  callBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 5 },
  videoContainer: { flex: 1, backgroundColor: '#000' },
  closeVideo: { backgroundColor: 'red', padding: 10, alignItems: 'center' },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  in: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  f: { flex: 1, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 20, marginRight: 10 },
  sB: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20 }
});
