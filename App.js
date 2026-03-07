import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

const Stack = createStackNavigator();

// --- 1. WELCOME PAGE ---
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

// --- 2. LOGIN PAGE ---
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

// --- 3. CHAT PAGE WITH INTEGRATED VIDEO ---
function Chat({ route }) {
  const { me } = route.params; 
  const [users, setUsers] = useState([]); 
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]); 
  const [txt, setTxt] = useState('');
  const [calling, setCalling] = useState(false);

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

  // Unique Room ID for the 1v1 Call
  const roomId = sel ? [me, sel].sort().join('-') : '';

  return (
    <View style={styles.row}>
      {/* SIDEBAR (30%) */}
      <View style={styles.sidebar}>
        <Text style={styles.sideH}>King Chat</Text>
        <FlatList data={users} renderItem={({item}) => (
          <TouchableOpacity 
            style={[styles.tab, sel === item.username && styles.act]} 
            onPress={() => {setSel(item.username); setCalling(false);}}
          >
            <Text style={sel === item.username && {color:'#fff'}}>{item.username}</Text>
          </TouchableOpacity>
        )} />
      </View>

      {/* CHAT AREA (70%) */}
      <View style={styles.main}>
        {sel ? (
          <View style={{flex:1}}>
            <View style={styles.head}>
              <View>
                <Text style={{fontWeight:'bold', fontSize: 16}}>{sel}</Text>
                <Text style={{fontSize: 10, color: '#888'}}>Online</Text>
              </View>
              <TouchableOpacity onPress={() => setCalling(!calling)} style={[styles.callBtn, calling && {backgroundColor: 'red'}]}>
                <Text style={{color:'#fff', fontWeight: 'bold'}}>{calling ? "End Call" : "Video Call"}</Text>
              </TouchableOpacity>
            </View>

            {calling ? (
              <View style={styles.videoWindow}>
                {/* Jitsi Iframe handles the "Other Person Large / You Small" layout automatically */}
                <iframe
                  src={`https://meet.jit.si/${roomId}#config.prejoinPageEnabled=false&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","hangup","fittoscreen"]`}
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none' }}
                  allow="camera; microphone; display-capture; fullscreen"
                />
              </View>
            ) : (
              <View style={{flex: 1}}>
                <FlatList data={msgs} renderItem={({item}) => (
                  <View style={[styles.msg, item.sender_username === me ? styles.my : styles.ot]}>
                    <Text style={styles.msgTxt}>{item.content}</Text>
                  </View>
                )} />
                <View style={styles.in}>
                  <TextInput value={txt} onChangeText={setTxt} style={styles.f} placeholder="Type a message..." />
                  <TouchableOpacity onPress={async () => { if(!txt.trim())return; await supabase.from('messages').insert([{ sender_username: me, receiver_username: sel, content: txt }]); setTxt(''); }} style={styles.sB}>
                    <Text style={{color:'#fff', fontWeight: 'bold'}}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : <View style={styles.c}><Text style={{color: '#888'}}>Select a contact to start chatting</Text></View>}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex:1}}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown:false}}>
          <Stack.Screen name="Welcome" component={Welcome} />
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Chat" component={Chat} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  l: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  t: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  i: { width: 280, borderBottomWidth: 2, borderColor: '#0088cc', padding: 10, marginBottom: 25, fontSize: 16 },
  b: { backgroundColor: '#0088cc', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, elevation: 3 },
  bt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  row: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  sidebar: { width: '30%', backgroundColor: '#f8f9fa', borderRightWidth: 1, borderColor: '#eee', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50, backgroundColor: '#fff' },
  sideH: { padding: 20, fontSize: 24, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 20, borderBottomWidth: 1, borderColor: '#f1f1f1' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },
  callBtn: { backgroundColor: '#28a745', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  videoWindow: { flex: 1, backgroundColor: '#000' },
  msg: { padding: 12, margin: 8, borderRadius: 15, maxWidth: '75%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6', borderBottomRightRadius: 2 },
  ot: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0', borderBottomLeftRadius: 2 },
  msgTxt: { fontSize: 15, color: '#333' },
  in: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center' },
  f: { flex: 1, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 25, marginRight: 10, fontSize: 15 },
  sB: { backgroundColor: '#0088cc', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 }
});
