import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform, Modal, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

// --- PLATFORM SAFE WEBRTC IMPORTS ---
const WebRTC = Platform.OS !== 'web' ? require('react-native-webrtc') : null;

// --- ASYNC STORAGE (web-safe) ---
let AsyncStorage;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (_) {
  if (typeof localStorage !== 'undefined') {
    AsyncStorage = {
      getItem: (key) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key, val) => Promise.resolve(localStorage.setItem(key, val)),
    };
  } else {
    console.warn('[KingChat] AsyncStorage is unavailable and localStorage is not accessible. Theme preference will not persist.');
    AsyncStorage = {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(null),
    };
  }
}

const THEME_STORAGE_KEY = 'kingchat_theme';

// --- 6 THEMES ---
const THEMES = {
  Dark: {
    id: 'Dark',
    background: '#121212',
    surface: '#1E1E2E',
    primary: '#7C9EFF',
    primaryText: '#FFFFFF',
    text: '#E0E0E0',
    textSecondary: '#A0A0A0',
    border: '#2A2A3A',
    messageMy: '#2A3A5A',
    messageOther: '#1E1E2E',
    inputBg: '#1E1E2E',
    headerBg: '#1A1A2A',
    sidebarBg: '#141424',
    sidebarActive: '#7C9EFF',
    modalBg: '#1E1E2E',
    swatches: ['#121212', '#7C9EFF', '#2A2A3A'],
  },
  Light: {
    id: 'Light',
    background: '#FFFFFF',
    surface: '#F8F9FA',
    primary: '#0088CC',
    primaryText: '#FFFFFF',
    text: '#212121',
    textSecondary: '#666666',
    border: '#E0E0E0',
    messageMy: '#E3F2FD',
    messageOther: '#F0F0F0',
    inputBg: '#F5F5F5',
    headerBg: '#FFFFFF',
    sidebarBg: '#F8F9FA',
    sidebarActive: '#0088CC',
    modalBg: '#FFFFFF',
    swatches: ['#FFFFFF', '#0088CC', '#E0E0E0'],
  },
  Ocean: {
    id: 'Ocean',
    background: '#0A1628',
    surface: '#0D2137',
    primary: '#00BCD4',
    primaryText: '#FFFFFF',
    text: '#B2EBF2',
    textSecondary: '#80DEEA',
    border: '#0D3147',
    messageMy: '#0D2F45',
    messageOther: '#0D2137',
    inputBg: '#0D2137',
    headerBg: '#091525',
    sidebarBg: '#060F1A',
    sidebarActive: '#00BCD4',
    modalBg: '#0D2137',
    swatches: ['#0A1628', '#00BCD4', '#0D3147'],
  },
  Sunset: {
    id: 'Sunset',
    background: '#1A0A0A',
    surface: '#2A1020',
    primary: '#FF6B6B',
    primaryText: '#FFFFFF',
    text: '#FFE0B2',
    textSecondary: '#FFCC80',
    border: '#3A1A2A',
    messageMy: '#3A2020',
    messageOther: '#2A1020',
    inputBg: '#2A1020',
    headerBg: '#150808',
    sidebarBg: '#100506',
    sidebarActive: '#FF6B6B',
    modalBg: '#2A1020',
    swatches: ['#1A0A0A', '#FF6B6B', '#3A1A2A'],
  },
  Forest: {
    id: 'Forest',
    background: '#0A1A0A',
    surface: '#0D2A0D',
    primary: '#4CAF50',
    primaryText: '#FFFFFF',
    text: '#C8E6C9',
    textSecondary: '#A5D6A7',
    border: '#1A3A1A',
    messageMy: '#1A3A1A',
    messageOther: '#0D2A0D',
    inputBg: '#0D2A0D',
    headerBg: '#081508',
    sidebarBg: '#050F05',
    sidebarActive: '#4CAF50',
    modalBg: '#0D2A0D',
    swatches: ['#0A1A0A', '#4CAF50', '#1A3A1A'],
  },
  Purple: {
    id: 'Purple',
    background: '#0E0A1A',
    surface: '#1A1028',
    primary: '#9C27B0',
    primaryText: '#FFFFFF',
    text: '#E1BEE7',
    textSecondary: '#CE93D8',
    border: '#2A1A3A',
    messageMy: '#2A1A3A',
    messageOther: '#1A1028',
    inputBg: '#1A1028',
    headerBg: '#0A0815',
    sidebarBg: '#070510',
    sidebarActive: '#9C27B0',
    modalBg: '#1A1028',
    swatches: ['#0E0A1A', '#9C27B0', '#2A1A3A'],
  },
};

// --- THEME CONTEXT ---
const ThemeContext = createContext({ theme: THEMES.Dark, setThemeName: () => {} });
const useTheme = () => useContext(ThemeContext);

// --- THEME SELECTOR MODAL ---
function ThemeSelectorModal({ visible, onClose }) {
  const { theme, setThemeName } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tsStyles.overlay}>
        <View style={[tsStyles.modal, { backgroundColor: theme.modalBg, borderColor: theme.border }]}>
          <Text style={[tsStyles.title, { color: theme.text }]}>🎨 Choose Theme</Text>
          <ScrollView>
            {Object.values(THEMES).map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[tsStyles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={() => { setThemeName(t.id); onClose(); }}
              >
                <View style={tsStyles.swatchRow}>
                  {t.swatches.map((c, i) => (
                    <View key={i} style={[tsStyles.swatch, { backgroundColor: c, borderColor: theme.border }]} />
                  ))}
                </View>
                <Text style={[tsStyles.themeName, { color: theme.text }]}>{t.id}</Text>
                {theme.id === t.id && <Text style={[tsStyles.check, { color: theme.primary }]}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[tsStyles.closeBtn, { backgroundColor: theme.primary, borderRadius: 12 }]}
            onPress={onClose}
          >
            <Text style={[tsStyles.closeBtnText, { color: theme.primaryText }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const tsStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: 320, maxHeight: 520, borderRadius: 24, borderWidth: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  swatchRow: { flexDirection: 'row', marginRight: 12 },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: 4, borderWidth: 1 },
  themeName: { flex: 1, fontSize: 16, fontWeight: '500' },
  check: { fontSize: 18, fontWeight: 'bold' },
  closeBtn: { marginTop: 12, padding: 12, alignItems: 'center' },
  closeBtnText: { fontWeight: 'bold', fontSize: 15 },
});

// --- PLATFORM SAFE VIDEO ---
const VideoPlayer = ({ stream, isLocal, audioOnly }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  if (audioOnly && !isLocal) return (
    <View style={vtStyles.audioPlaceholder}>
      <Text style={vtStyles.audioIcon}>📞</Text>
      <Text style={{ color: '#fff' }}>Audio Call Active</Text>
    </View>
  );
  if (!stream) return null;

  return Platform.OS === 'web' ? (
    <video ref={videoRef} autoPlay playsInline muted={isLocal} style={isLocal ? vtStyles.webLocal : vtStyles.webRemote} />
  ) : (
    <WebRTC.RTCView streamURL={stream.toURL()} style={isLocal ? vtStyles.mobileLocal : vtStyles.mobileRemote} objectFit="cover" zOrder={isLocal ? 1 : 0} />
  );
};

const vtStyles = StyleSheet.create({
  audioPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioIcon: { fontSize: 60, marginBottom: 20 },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  mobileRemote: { flex: 1 },
  mobileLocal: { flex: 1 },
});

// --- SCREENS ---
const Stack = createStackNavigator();
const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function Login({ navigation }) {
  const { theme } = useTheme();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [isR, setR] = useState(false);
  const [themeModal, setThemeModal] = useState(false);

  const auth = async () => {
    if (isR) {
      const { error } = await supabase.from('users_table').insert([{ username: u, password: p }]);
      if (error) alert('Username taken'); else { alert('User Created!'); setR(false); }
    } else {
      const { data } = await supabase.from('users_table').select('*').eq('username', u).eq('password', p).single();
      if (data) navigation.navigate('Chat', { me: u }); else alert('Invalid Login');
    }
  };

  const s = loginStyles(theme);
  return (
    <View style={s.screen}>
      {/* Top-right theme button */}
      <TouchableOpacity style={s.topThemeBtn} onPress={() => setThemeModal(true)}>
        <Text style={s.topThemeBtnText}>🎨</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.logo}>👑 King Chat</Text>
        <TextInput
          placeholder="Username"
          placeholderTextColor={theme.textSecondary}
          style={s.input}
          onChangeText={setU}
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          style={s.input}
          onChangeText={setP}
          secureTextEntry
        />
        <TouchableOpacity style={s.btn} onPress={auth}>
          <Text style={s.btnText}>{isR ? 'Register' : 'Login'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setR(!isR)}>
          <Text style={s.link}>{isR ? 'Already have an account? Login' : 'New here? Register'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.changeThemeBtn} onPress={() => setThemeModal(true)}>
          <Text style={s.changeThemeBtnText}>🎨 Change Theme</Text>
        </TouchableOpacity>
        <Text style={s.currentTheme}>Theme: {theme.id}</Text>
      </View>

      <ThemeSelectorModal visible={themeModal} onClose={() => setThemeModal(false)} />
    </View>
  );
}

const loginStyles = (theme) => StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
  topThemeBtn: {
    position: 'absolute', top: 20, right: 20,
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    padding: 10, zIndex: 10,
  },
  topThemeBtnText: { fontSize: 20 },
  card: {
    width: 320, backgroundColor: theme.surface,
    borderRadius: 20, borderWidth: 1, borderColor: theme.border,
    padding: 32, alignItems: 'center',
  },
  logo: { fontSize: 36, fontWeight: 'bold', color: theme.primary, marginBottom: 24 },
  input: {
    width: '100%', backgroundColor: theme.inputBg,
    borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    padding: 12, marginBottom: 16, color: theme.text, fontSize: 15,
  },
  btn: {
    backgroundColor: theme.primary, borderRadius: 12,
    paddingVertical: 13, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  btnText: { color: theme.primaryText, fontWeight: 'bold', fontSize: 16 },
  link: { color: theme.primary, marginBottom: 16, fontSize: 14 },
  changeThemeBtn: {
    borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    paddingVertical: 10, paddingHorizontal: 20, marginTop: 8,
  },
  changeThemeBtnText: { color: theme.primary, fontWeight: '600', fontSize: 14 },
  currentTheme: { color: theme.textSecondary, fontSize: 12, marginTop: 10 },
});

function Chat({ route }) {
  const { theme } = useTheme();
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [callState, setCallState] = useState('idle');
  const [incoming, setIncoming] = useState(null);
  const [isAudio, setIsAudio] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [themeModal, setThemeModal] = useState(false);
  const pc = useRef(null);

  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => setUsers((data || []).filter(x => x.username !== me)));
    const channel = supabase.channel('global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        if (p.new.receiver_username === me && sel === p.new.sender_username) setMsgs(curr => [...curr, p.new]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, p => {
        if (p.new.receiver === me) handleSignaling(p.new);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [sel]);

  useEffect(() => {
    if (sel) {
      supabase.from('messages').select('*')
        .or(`and(sender_username.eq.${me},receiver_username.eq.${sel}),and(sender_username.eq.${sel},receiver_username.eq.${me})`)
        .order('created_at', { ascending: true })
        .then(({ data }) => setMsgs(data || []));
    }
  }, [sel]);

  const handleSignaling = async (s) => {
    if (s.type === 'offer') { setIncoming(s); setIsAudio(s.is_audio); }
    if (s.type === 'hangup') endCall();
    if (s.type === 'answer' && pc.current) {
      setCallState('connected');
      const desc = Platform.OS === 'web' ? s.data : new WebRTC.RTCSessionDescription(s.data);
      await pc.current.setRemoteDescription(desc);
    }
    if (s.type === 'candidate' && pc.current) {
      const cand = Platform.OS === 'web' ? s.data : new WebRTC.RTCIceCandidate(s.data);
      await pc.current.addIceCandidate(cand);
    }
  };

  const startCall = async (type, isCaller, signal = null) => {
    setIsAudio(type === 'audio');
    setCallState(isCaller ? 'ringing' : 'connected');
    setIncoming(null);
    const stream = await (Platform.OS === 'web'
      ? navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true })
      : WebRTC.mediaDevices.getUserMedia({ video: type === 'video', audio: true }));
    setLocalStream(stream);
    pc.current = Platform.OS === 'web' ? new RTCPeerConnection(iceConfig) : new WebRTC.RTCPeerConnection(iceConfig);
    if (Platform.OS === 'web') {
      stream.getTracks().forEach(t => pc.current.addTrack(t, stream));
      pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
      pc.current.addStream(stream);
      pc.current.onaddstream = (e) => setRemoteStream(e.stream);
    }
    pc.current.onicecandidate = (e) => {
      if (e.candidate) supabase.from('calls').insert([{ caller: me, receiver: isCaller ? sel : signal.caller, type: 'candidate', data: e.candidate }]);
    };
    if (isCaller) {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'offer', data: offer, is_audio: type === 'audio' }]);
    } else {
      await pc.current.setRemoteDescription(Platform.OS === 'web' ? signal.data : new WebRTC.RTCSessionDescription(signal.data));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await supabase.from('calls').insert([{ caller: me, receiver: signal.caller, type: 'answer', data: answer }]);
    }
  };

  const endCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null); setRemoteStream(null); setCallState('idle');
    if (pc.current) pc.current.close();
  };

  const s = chatStyles(theme);
  return (
    <View style={s.row}>
      {/* INCOMING CALL MODAL */}
      <Modal visible={!!incoming} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.callCard}>
            <Text style={s.callFrom}>{incoming?.caller}</Text>
            <Text style={[s.callType, { color: theme.textSecondary }]}>{incoming?.is_audio ? '📞 Audio Call...' : '📹 Video Call...'}</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={() => { setSel(incoming.caller); startCall(incoming.is_audio ? 'audio' : 'video', false, incoming); }}
                style={s.acceptBtn}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { supabase.from('calls').insert([{ caller: me, receiver: incoming.caller, type: 'hangup' }]); setIncoming(null); }}
                style={s.declineBtn}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SIDEBAR */}
      <View style={s.side}>
        <View style={s.sideHeader}>
          <Text style={s.logoSide}>👑 King Chat</Text>
          <TouchableOpacity style={s.themeIconBtn} onPress={() => setThemeModal(true)}>
            <Text style={{ fontSize: 18 }}>🎨</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={users}
          keyExtractor={(item) => item.username}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.tab, sel === item.username && { backgroundColor: theme.sidebarActive }]}
              onPress={() => setSel(item.username)}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{item.username[0].toUpperCase()}</Text>
              </View>
              <Text style={[s.tabText, sel === item.username && { color: '#fff' }]}>{item.username}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* CHAT AREA */}
      <View style={s.main}>
        {sel ? (
          <View style={{ flex: 1 }}>
            <View style={s.head}>
              <View style={s.headLeft}>
                <View style={[s.avatar, { marginRight: 10 }]}>
                  <Text style={s.avatarText}>{sel[0].toUpperCase()}</Text>
                </View>
                <Text style={[s.headName, { color: theme.text }]}>{sel}</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => startCall('audio', true)} style={s.audioBtn}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>📞 Audio</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startCall('video', true)} style={s.videoBtn}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>📹 Video</Text>
                </TouchableOpacity>
              </View>
            </View>

            {callState !== 'idle' ? (
              <View style={s.vStage}>
                {callState === 'ringing' && (
                  <View style={s.ringing}>
                    <Text style={{ color: '#fff', fontSize: 20 }}>Calling {sel}...</Text>
                  </View>
                )}
                <VideoPlayer stream={remoteStream} isLocal={false} audioOnly={isAudio} />
                {!isAudio && (
                  <View style={s.pip}>
                    <VideoPlayer stream={localStream} isLocal={true} audioOnly={false} />
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => { supabase.from('calls').insert([{ caller: me, receiver: sel, type: 'hangup' }]); endCall(); }}
                  style={s.hang}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Hang Up</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <FlatList
                  data={msgs}
                  keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
                  renderItem={({ item }) => (
                    <View style={[s.msg, item.sender_username === me ? s.myMsg : s.otMsg]}>
                      <Text style={{ color: theme.text }}>{item.content}</Text>
                    </View>
                  )}
                />
                <View style={s.inputRow}>
                  <TextInput
                    value={txt}
                    onChangeText={setTxt}
                    style={s.inputField}
                    placeholder="Message..."
                    placeholderTextColor={theme.textSecondary}
                  />
                  <TouchableOpacity
                    onPress={async () => { await supabase.from('messages').insert([{ sender_username: me, receiver_username: sel, content: txt }]); setTxt(''); }}
                    style={s.sendBtn}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={s.emptyState}>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>💬 Select a contact to start chatting</Text>
          </View>
        )}
      </View>

      <ThemeSelectorModal visible={themeModal} onClose={() => setThemeModal(false)} />
    </View>
  );
}

const chatStyles = (theme) => StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: theme.background },
  // Sidebar
  side: { width: '30%', backgroundColor: theme.sidebarBg, borderRightWidth: 1, borderColor: theme.border },
  sideHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderColor: theme.border,
    backgroundColor: theme.headerBg, borderRadius: 0, paddingTop: 50,
  },
  logoSide: { fontSize: 16, fontWeight: 'bold', color: theme.primary },
  themeIconBtn: {
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1,
    borderColor: theme.border, padding: 6,
  },
  tab: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: theme.border },
  tabText: { color: theme.text, fontSize: 14, fontWeight: '500' },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  // Main area
  main: { flex: 1, backgroundColor: theme.background },
  head: {
    padding: 14, borderBottomWidth: 1, borderColor: theme.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.headerBg, paddingTop: 50,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center' },
  headName: { fontWeight: 'bold', fontSize: 16 },
  audioBtn: {
    backgroundColor: '#007bff', padding: 8, borderRadius: 12,
    paddingHorizontal: 12, marginLeft: 6,
  },
  videoBtn: {
    backgroundColor: '#28a745', padding: 8, borderRadius: 12,
    paddingHorizontal: 12, marginLeft: 6,
  },
  // Messages
  msg: { padding: 10, margin: 5, borderRadius: 16, maxWidth: '75%', borderWidth: 1 },
  myMsg: {
    alignSelf: 'flex-end', backgroundColor: theme.messageMy,
    borderColor: theme.border,
  },
  otMsg: {
    alignSelf: 'flex-start', backgroundColor: theme.messageOther,
    borderColor: theme.border,
  },
  inputRow: {
    flexDirection: 'row', padding: 12, borderTopWidth: 1,
    borderColor: theme.border, backgroundColor: theme.surface,
  },
  inputField: {
    flex: 1, backgroundColor: theme.inputBg, padding: 10,
    borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    color: theme.text, fontSize: 14,
  },
  sendBtn: {
    backgroundColor: theme.primary, padding: 10,
    borderRadius: 12, marginLeft: 8, paddingHorizontal: 16,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16 },
  // Call UI
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  callCard: {
    backgroundColor: theme.modalBg, padding: 36, borderRadius: 24,
    alignItems: 'center', borderWidth: 1, borderColor: theme.border, width: 280,
  },
  callFrom: { fontSize: 22, fontWeight: 'bold', color: theme.text, marginBottom: 8 },
  callType: { marginBottom: 20, fontSize: 15 },
  acceptBtn: {
    backgroundColor: '#27AE60', padding: 14, borderRadius: 12,
    marginRight: 10, minWidth: 90, alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: '#E74C3C', padding: 14, borderRadius: 12,
    minWidth: 90, alignItems: 'center',
  },
  vStage: { flex: 1, backgroundColor: '#000', position: 'relative' },
  pip: {
    position: 'absolute', bottom: 100, right: 20, width: 120, height: 180,
    borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#222',
  },
  hang: {
    backgroundColor: '#E74C3C', padding: 14, borderRadius: 30,
    position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40,
  },
  ringing: { position: 'absolute', top: '40%', width: '100%', alignItems: 'center', zIndex: 10 },
});

// --- APP ROOT with ThemeProvider ---
export default function App() {
  const [themeName, setThemeNameState] = useState('Dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved && THEMES[saved]) setThemeNameState(saved);
    }).catch(err => {
      console.warn('[KingChat] Failed to load saved theme:', err);
    });
  }, []);

  const setThemeName = (name) => {
    if (THEMES[name]) {
      setThemeNameState(name);
      AsyncStorage.setItem(THEME_STORAGE_KEY, name);
    }
  };

  const theme = THEMES[themeName] || THEMES.Dark;

  return (
    <ThemeContext.Provider value={{ theme, setThemeName }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Chat" component={Chat} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </ThemeContext.Provider>
  );
}
