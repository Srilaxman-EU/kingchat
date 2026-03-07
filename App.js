import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  StyleSheet, Alert, Platform, SafeAreaView 
} from 'react-native';
import { WebView } from 'react-native-webview';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

const Stack = createStackNavigator();

// --- 1. WELCOME PAGE ---
function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.centerContainer}>
      <Text style={styles.logo}>👑 King Chat</Text>
      <Text style={styles.tagline}>Secure • Private • Real-time</Text>
      <TouchableOpacity style={styles.mainBtn} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.btnText}>Get Started</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 2. LOGIN & REGISTER PAGE ---
function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleAuth = async () => {
    if (!username || !password) return Alert.alert("Error", "Please fill all fields");

    if (isRegister) {
      // Create user in custom table
      const { error } = await supabase.from('users_table').insert([{ username, password }]);
      if (error) Alert.alert("Error", "Username already taken");
      else {
        Alert.alert("Success", "Account created! You can now login.");
        setIsRegister(false);
      }
    } else {
      // Check username and password match
      const { data, error } = await supabase
        .from('users_table')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (data) {
        navigation.navigate('Chat', { myUser: username });
      } else {
        Alert.alert("Error", "Invalid Username or Password");
      }
    }
  };

  return (
    <View style={styles.centerContainer}>
      <Text style={styles.title}>{isRegister ? "Create Account" : "Login to Chat"}</Text>
      <TextInput 
        placeholder="Username" 
        style={styles.input} 
        onChangeText={setUsername} 
        autoCapitalize="none" 
      />
      <TextInput 
        placeholder="Password" 
        style={styles.input} 
        onChangeText={setPassword} 
        secureTextEntry 
      />
      <TouchableOpacity style={styles.mainBtn} onPress={handleAuth}>
        <Text style={styles.btnText}>{isRegister ? "Register" : "Login"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
        <Text style={styles.switchText}>
          {isRegister ? "Already have an account? Login" : "No account? Create one here"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// --- 3. CHAT PAGE (The 30/70 Layout with Video) ---
function ChatScreen({ route }) {
  const { myUser } = route.params;
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isCalling, setIsCalling] = useState(false);

  // Fetch users for sidebar
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('users_table').select('username');
      setUsers(data.filter(u => u.username !== myUser));
    };
    fetchUsers();
  }, []);

  // Fetch private messages + Realtime listener
  useEffect(() => {
    if (!selectedUser) return;

    const fetchMsgs = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_username.eq.${myUser},receiver_username.eq.${selectedUser}),and(sender_username.eq.${selectedUser},receiver_username.eq.${myUser})`)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    };
    fetchMsgs();

    const channel = supabase.channel('chat_room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if ((m.sender_username === myUser && m.receiver_username === selectedUser) || 
            (m.sender_username === selectedUser && m.receiver_username === myUser)) {
          setMessages(prev => [...prev, m]);
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [selectedUser]);

  const send = async () => {
    if (!inputText.trim()) return;
    await supabase.from('messages').insert([{ 
      sender_username: myUser, 
      receiver_username: selectedUser, 
      content: inputText 
    }]);
    setInputText('');
  };

  // Unique Jitsi Room for 1v1
  const roomId = selectedUser ? [myUser, selectedUser].sort().join('-') : '';
  const jitsiUrl = `https://meet.jit.si/${roomId}#config.prejoinPageEnabled=false&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","hangup"]`;

  return (
    <View style={styles.splitWrapper}>
      {/* SIDEBAR (30%) */}
      <View style={styles.sidebar}>
        <Text style={styles.sideHeader}>King Chat</Text>
        <Text style={styles.meInfo}>Logged in as: {myUser}</Text>
        <FlatList 
          data={users}
          keyExtractor={(item) => item.username}
          renderItem={({item}) => (
            <TouchableOpacity 
              style={[styles.userItem, selectedUser === item.username && styles.activeUserItem]}
              onPress={() => {setSelectedUser(item.username); setIsCalling(false);}}
            >
              <Text style={selectedUser === item.username && {color: '#fff'}}>{item.username}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* CHAT AREA (70%) */}
      <View style={styles.chatArea}>
        {selectedUser ? (
          <View style={{flex: 1}}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>{selectedUser}</Text>
              <TouchableOpacity 
                style={[styles.videoBtn, isCalling && {backgroundColor: 'red'}]}
                onPress={() => setIsCalling(!isCalling)}
              >
                <Text style={{color: '#fff', fontWeight: 'bold'}}>{isCalling ? "End Call" : "Video Call"}</Text>
              </TouchableOpacity>
            </View>

            {isCalling ? (
              <View style={styles.videoBox}>
                {Platform.OS === 'web' ? (
                  <iframe 
                    src={jitsiUrl} 
                    style={{ flex: 1, border: 'none' }} 
                    allow="camera; microphone; fullscreen; display-capture" 
                  />
                ) : (
                  <WebView 
                    source={{ uri: jitsiUrl }} 
                    allowsInlineMediaPlayback={true} 
                    mediaPlaybackRequiresUserAction={false}
                    style={{ flex: 1 }} 
                  />
                )}
              </View>
            ) : (
              <View style={{flex: 1}}>
                <FlatList 
                  data={messages}
                  keyExtractor={item => item.id.toString()}
                  style={{padding: 10}}
                  renderItem={({item}) => (
                    <View style={[styles.bubble, item.sender_username === myUser ? styles.myBubble : styles.otBubble]}>
                      <Text style={styles.msgText}>{item.content}</Text>
                    </View>
                  )}
                />
                <View style={styles.inputRow}>
                  <TextInput 
                    value={inputText} 
                    onChangeText={setInputText} 
                    placeholder="Type a message..." 
                    style={styles.chatInput} 
                  />
                  <TouchableOpacity onPress={send} style={styles.sendBtn}>
                    <Text style={{color: '#fff', fontWeight: 'bold'}}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.centerContainer}><Text style={{color: '#888'}}>Select a contact to start chatting</Text></View>
        )}
      </View>
    </View>
  );
}

// --- APP NAVIGATION ---
export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 45, fontWeight: 'bold', color: '#0088cc' },
  tagline: { fontSize: 14, color: '#888', marginBottom: 40 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 25 },
  input: { width: 280, borderBottomWidth: 2, borderColor: '#0088cc', padding: 10, marginBottom: 25, fontSize: 16 },
  mainBtn: { backgroundColor: '#0088cc', paddingVertical: 15, paddingHorizontal: 50, borderRadius: 30 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  switchText: { marginTop: 20, color: '#0088cc' },
  
  splitWrapper: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  sidebar: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ddd', paddingTop: 50 },
  chatArea: { width: '70%', flex: 1, paddingTop: 50, backgroundColor: '#fff' },
  
  sideHeader: { padding: 20, fontSize: 24, fontWeight: 'bold', color: '#0088cc' },
  meInfo: { paddingLeft: 20, fontSize: 10, color: '#999', marginBottom: 10 },
  userItem: { padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  activeUserItem: { backgroundColor: '#0088cc' },
  
  chatHeader: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatTitle: { fontSize: 18, fontWeight: 'bold' },
  videoBtn: { backgroundColor: '#28a745', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  videoBox: { flex: 1, backgroundColor: '#000' },
  
  bubble: { padding: 12, borderRadius: 15, marginVertical: 5, maxWidth: '80%' },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  otBubble: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  msgText: { fontSize: 15 },
  
  inputRow: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 25, marginRight: 10 },
  sendBtn: { backgroundColor: '#0088cc', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 }
});
