import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Modal, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';
import {
  sendTextMessage,
  sendVoiceMessage,
  sendFileMessage,
  loadChatHistory,
  subscribeToMessages,
} from './chatService';
import {
  initiateCall,
  answerCall,
  cleanupCall,
  sendHangup,
  handleSignalingData,
  subscribeToCallSignals,
} from './callService';
import {
  formatTimestamp,
  getFileIcon,
  formatFileSize,
  isOwnMessage,
} from './messageService';
import { detectFileType } from './fileService';

// --- PLATFORM SAFE WEBRTC IMPORTS ---
const WebRTC = Platform.OS !== 'web' ? require('react-native-webrtc') : null;

const Stack = createStackNavigator();

// --- TELEGRAM-STYLE VIDEO COMPONENT ---
const VideoPlayer = ({ stream, isLocal, audioOnly }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  if (audioOnly && !isLocal) return (
    <View style={styles.audioPlaceholder}><Text style={styles.audioIcon}>📞</Text><Text style={{color:'#fff'}}>Audio Call Active</Text></View>
  );
  if (!stream) return null;

  return Platform.OS === 'web' ? (
    <video ref={videoRef} autoPlay playsInline muted={isLocal} style={isLocal ? styles.webLocal : styles.webRemote} />
  ) : (
    <WebRTC.RTCView streamURL={stream.toURL()} style={isLocal ? styles.mobileLocal : styles.mobileRemote} objectFit="cover" zOrder={isLocal ? 1 : 0} />
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
      <TouchableOpacity onPress={() => setR(!isR)}><Text style={styles.link}>{isR ? "Create Account" : "Login instead"}</Text></TouchableOpacity>
    </View>
  );
}

function Chat({ route }) {
  const { me } = route.params;
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');

  // Call state
  const [callState, setCallState] = useState('idle'); // idle | ringing | connected
  const [incoming, setIncoming] = useState(null);
  const [isAudio, setIsAudio] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);

  // Keep a ref to the selected user inside async callbacks
  const selRef = useRef(sel);
  useEffect(() => { selRef.current = sel; }, [sel]);

  // Load users list and subscribe to real-time events
  useEffect(() => {
    supabase.from('users_table').select('username').then(({ data }) => {
      setUsers((data || []).filter(x => x.username !== me));
    });

    const msgChannel = subscribeToMessages(me, (newMsg) => {
      if (newMsg.sender === selRef.current) {
        setMsgs(curr => {
          // Replace the last matching optimistic entry, or append if none exists
          const idx = curr.findLastIndex(
            m => m._optimistic && m.text === newMsg.text && m.sender === newMsg.sender
          );
          if (idx !== -1) {
            const next = [...curr];
            next[idx] = newMsg;
            return next;
          }
          return [...curr, newMsg];
        });
      }
    });

    const callChannel = subscribeToCallSignals(me, (signal) => {
      handleIncomingSignal(signal);
    });

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(callChannel);
    };
  }, []);

  // Load chat history when conversation partner changes
  useEffect(() => {
    if (sel) {
      loadChatHistory(me, sel).then(setMsgs).catch(() => setMsgs([]));
    }
  }, [sel]);

  const handleIncomingSignal = async (s) => {
    if (s.type === 'offer') { setIncoming(s); setIsAudio(s.is_audio); }
    if (s.type === 'hangup') doEndCall();
    if (s.type === 'answer' && pc.current) {
      setCallState('connected');
      await handleSignalingData(pc.current, s);
    }
    if (s.type === 'candidate' && pc.current) {
      await handleSignalingData(pc.current, s);
    }
  };

  const startOutgoingCall = async (type) => {
    if (!sel) return;
    setIsAudio(type === 'audio');
    setCallState('ringing');
    try {
      const { pc: newPc, localStream: stream } = await initiateCall(
        me, sel, type,
        () => {},
        (stream) => setRemoteStream(stream)
      );
      pc.current = newPc;
      setLocalStream(stream);
    } catch (e) {
      Alert.alert('Call Error', e.message || 'Could not start call');
      setCallState('idle');
    }
  };

  const acceptIncomingCall = async () => {
    if (!incoming) return;
    const callType = incoming.is_audio ? 'audio' : 'video';
    setSel(incoming.caller);
    setIsAudio(incoming.is_audio);
    setCallState('connected');
    setIncoming(null);
    try {
      const { pc: newPc, localStream: stream } = await answerCall(
        me, incoming, callType,
        () => {},
        (s) => setRemoteStream(s)
      );
      pc.current = newPc;
      setLocalStream(stream);
    } catch (e) {
      Alert.alert('Call Error', e.message || 'Could not answer call');
      setCallState('idle');
    }
  };

  const doEndCall = () => {
    cleanupCall(pc.current, localStream);
    pc.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
  };

  const hangUp = async () => {
    if (sel) await sendHangup(me, sel);
    doEndCall();
  };

  // --- Voice recording ---
  const startRecording = async () => {
    if (!sel) return;
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStreamRef.current = stream;
        audioChunksRef.current = [];
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (e) {
        Alert.alert('Microphone Error', 'Could not access microphone');
      }
    } else {
      Alert.alert('Voice Messages', 'Hold the 🎤 button to record on mobile.');
    }
  };

  const stopRecordingAndSend = async () => {
    if (!isRecording || !sel) return;
    setIsRecording(false);
    if (Platform.OS === 'web' && mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = async () => {
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(t => t.stop());
          recordingStreamRef.current = null;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        try {
          await sendVoiceMessage(me, sel, audioBlob);
        } catch (e) {
          Alert.alert('Error', 'Failed to send voice message');
        }
      };
      mediaRecorderRef.current.stop();
    }
  };

  // --- File attachment ---
  const handleFileAttachment = () => {
    if (!sel) return;
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fileType = detectFileType(file);
        try {
          await sendFileMessage(me, sel, file, fileType);
        } catch (err) {
          Alert.alert('Error', 'Failed to send file');
        }
      };
      input.click();
    } else {
      Alert.alert('File Sharing', 'File sharing is fully supported on web. Mobile file picker support coming soon.');
    }
  };

  // --- Send text message ---
  const handleSend = async () => {
    if (!txt.trim() || !sel) return;
    const text = txt.trim();
    setTxt('');
    try {
      await sendTextMessage(me, sel, text);
      // Optimistically show the sent message; dedupe by id if the realtime
      // subscription delivers it later.
      setMsgs(curr => {
        const optimistic = {
          sender: me, receiver: sel, text, type: 'text',
          timestamp: new Date().toISOString(),
          _optimistic: true,
        };
        return [...curr, optimistic];
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  // --- Message renderer ---
  const renderMessage = ({ item }) => {
    const mine = isOwnMessage(item, me);
    const msgStyle = [styles.msg, mine ? styles.my : styles.ot];
    const ts = formatTimestamp(item.timestamp || item.created_at);

    if (item.type === 'voice') {
      return (
        <View style={msgStyle}>
          <Text>🎤 Voice message</Text>
          {item.voice_url && Platform.OS === 'web' && (
            <audio controls src={item.voice_url} style={{ marginTop: 4, maxWidth: 200 }} />
          )}
          {ts ? <Text style={styles.msgTime}>{ts}</Text> : null}
        </View>
      );
    }

    if (item.type === 'file') {
      const icon = getFileIcon(item.file_type);
      const sizeLabel = formatFileSize(item.file_size);
      return (
        <TouchableOpacity
          style={msgStyle}
          onPress={() => {
            if (item.file_url) {
              if (Platform.OS === 'web') {
                window.open(item.file_url, '_blank');
              } else {
                Linking.openURL(item.file_url);
              }
            }
          }}
        >
          <Text>{icon} {item.file_name || 'File'}</Text>
          {sizeLabel ? <Text style={styles.msgMeta}>{sizeLabel}</Text> : null}
          {ts ? <Text style={styles.msgTime}>{ts}</Text> : null}
        </TouchableOpacity>
      );
    }

    // Default: text message (supports both old 'content' and new 'text' fields)
    return (
      <View style={msgStyle}>
        <Text>{item.text || item.content}</Text>
        {ts ? <Text style={styles.msgTime}>{ts}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.row}>
      {/* 1. INCOMING CALL MODAL */}
      <Modal visible={!!incoming} transparent animationType="fade">
        <View style={styles.modal}>
          <View style={styles.card}>
            <Text style={styles.callFrom}>{incoming?.caller}</Text>
            <Text style={{ marginBottom: 20 }}>
              {incoming?.is_audio ? '📞 Audio Call...' : '📹 Video Call...'}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={acceptIncomingCall} style={styles.acc}>
                <Text style={{ color: '#fff' }}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  sendHangup(me, incoming.caller);
                  setIncoming(null);
                }}
                style={styles.dec}
              >
                <Text style={{ color: '#fff' }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. SIDEBAR (30%) */}
      <View style={styles.side}>
        <Text style={styles.logoSide}>King Chat</Text>
        <FlatList
          data={users}
          keyExtractor={(item) => item.username}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.tab, sel === item.username && styles.act]}
              onPress={() => setSel(item.username)}
            >
              <Text style={sel === item.username ? { color: '#fff' } : null}>
                {item.username}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* 3. CHAT AREA (70%) */}
      <View style={styles.main}>
        {sel ? (
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={styles.head}>
              <Text style={{ fontWeight: 'bold' }}>{sel}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => startOutgoingCall('audio')} style={styles.audioBtn}>
                  <Text style={{ color: '#fff' }}>📞 Audio</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startOutgoingCall('video')} style={styles.videoBtn}>
                  <Text style={{ color: '#fff' }}>📹 Video</Text>
                </TouchableOpacity>
              </View>
            </View>

            {callState !== 'idle' ? (
              /* --- CALL STAGE --- */
              <View style={styles.vStage}>
                {callState === 'ringing' && (
                  <View style={styles.ringing}>
                    <Text style={{ color: '#fff', fontSize: 20 }}>Calling {sel}...</Text>
                  </View>
                )}
                <VideoPlayer stream={remoteStream} isLocal={false} audioOnly={isAudio} />
                {!isAudio && (
                  <View style={styles.pip}>
                    <VideoPlayer stream={localStream} isLocal={true} audioOnly={false} />
                  </View>
                )}
                <TouchableOpacity onPress={hangUp} style={styles.hang}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Hang up</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* --- CHAT MESSAGES --- */
              <View style={{ flex: 1 }}>
                <FlatList
                  data={msgs}
                  keyExtractor={(item, i) => item.id ? String(item.id) : `${item.sender}_${item.timestamp || i}`}
                  renderItem={renderMessage}
                />
                {/* Input bar */}
                <View style={styles.inRow}>
                  {/* File attachment */}
                  <TouchableOpacity onPress={handleFileAttachment} style={styles.iconBtn}>
                    <Text style={{ fontSize: 20 }}>📎</Text>
                  </TouchableOpacity>
                  {/* Voice recording */}
                  <TouchableOpacity
                    onPressIn={startRecording}
                    onPressOut={stopRecordingAndSend}
                    style={[styles.iconBtn, isRecording && styles.recording]}
                  >
                    <Text style={{ fontSize: 20 }}>🎤</Text>
                  </TouchableOpacity>
                  <TextInput
                    value={txt}
                    onChangeText={setTxt}
                    style={styles.fld}
                    placeholder="Message..."
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                  />
                  <TouchableOpacity onPress={handleSend} style={styles.sBtn}>
                    <Text style={{ color: '#fff' }}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.center}><Text>Select a contact to chat</Text></View>
        )}
      </View>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  input: { width: 250, borderBottomWidth: 1, padding: 10, marginBottom: 20 },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '30%', backgroundColor: '#f5f5f5', borderRightWidth: 1, borderColor: '#ccc', paddingTop: 50 },
  main: { width: '70%', flex: 1, paddingTop: 50 },
  logoSide: { padding: 20, fontSize: 18, fontWeight: 'bold', color: '#0088cc' },
  tab: { padding: 15, borderBottomWidth: 1, borderColor: '#ddd' },
  act: { backgroundColor: '#0088cc' },
  head: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  videoBtn: { backgroundColor: '#28a745', padding: 8, borderRadius: 20, paddingHorizontal: 15, marginLeft: 5 },
  audioBtn: { backgroundColor: '#007bff', padding: 8, borderRadius: 20, paddingHorizontal: 15 },
  vStage: { flex: 1, backgroundColor: '#000', position: 'relative' },
  pip: { position: 'absolute', bottom: 100, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#222' },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  mobileRemote: { flex: 1 },
  mobileLocal: { flex: 1 },
  hang: { backgroundColor: 'red', padding: 15, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 40 },
  ringing: { position: 'absolute', top: '40%', width: '100%', alignItems: 'center', zIndex: 10 },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 40, borderRadius: 20, alignItems: 'center' },
  callFrom: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  acc: { backgroundColor: 'green', padding: 15, borderRadius: 10, marginRight: 10 },
  dec: { backgroundColor: 'red', padding: 15, borderRadius: 10 },
  msg: { padding: 10, margin: 5, borderRadius: 10, maxWidth: '80%' },
  my: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  ot: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  msgTime: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  msgMeta: { fontSize: 11, color: '#777', marginTop: 2 },
  inRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center' },
  iconBtn: { padding: 8, borderRadius: 20, marginRight: 4 },
  recording: { backgroundColor: '#ff4444' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  sBtn: { backgroundColor: '#0088cc', padding: 10, borderRadius: 20, marginLeft: 10 },
  audioPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioIcon: { fontSize: 60, marginBottom: 20 },
  link: { marginTop: 20, color: '#0088cc' },
});

export default function App() {
  return (
    <GestureHandlerRootView style={{flex:1}}><NavigationContainer><Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="Login" component={Login} /><Stack.Screen name="Chat" component={Chat} /></Stack.Navigator></NavigationContainer></GestureHandlerRootView>
  );
}
