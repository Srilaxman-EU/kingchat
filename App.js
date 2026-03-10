import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, Platform, Modal, SafeAreaView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';
import {
  sendMessage, getMessages, subscribeToMessages,
  markAsRead, getOrCreateChat, getUserChats,
} from './chatService';
import {
  initiateAudioCall, initiateVideoCall, answerCall, endCall,
  subscribeToIncomingCalls, subscribeToCallUpdates, addIceCandidate,
} from './callService';
import { getOtherParticipant, formatTime, isMessageFromCurrentUser, getMessageDisplayText } from './messageService';

// --- PLATFORM-SAFE WEBRTC ---
const WebRTCLib = Platform.OS !== 'web' ? require('react-native-webrtc') : null;

const Stack = createStackNavigator();

// ---------------------------------------------------------------------------
// VideoPlayer — renders a local or remote stream on web and native
// ---------------------------------------------------------------------------
const VideoPlayer = ({ stream, isLocal, audioOnly }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (audioOnly && !isLocal) {
    return (
      <View style={styles.audioPlaceholder}>
        <Text style={styles.audioIcon}>📞</Text>
        <Text style={{ color: '#fff' }}>Audio Call Active</Text>
      </View>
    );
  }
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
  }
  return (
    <WebRTCLib.RTCView
      streamURL={stream.toURL()}
      style={isLocal ? styles.mobileLocal : styles.mobileRemote}
      objectFit="cover"
      zOrder={isLocal ? 1 : 0}
    />
  );
};

// ---------------------------------------------------------------------------
// LoginScreen
// ---------------------------------------------------------------------------
function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter username and password.');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        const { error } = await supabase
          .from('users_table')
          .insert([{ username: username.trim(), password }]);
        if (error) {
          Alert.alert('Error', 'Username already taken.');
        } else {
          Alert.alert('Success', 'Account created! Please log in.');
          setIsRegister(false);
        }
      } else {
        const { data } = await supabase
          .from('users_table')
          .select('*')
          .eq('username', username.trim())
          .eq('password', password)
          .single();
        if (data) {
          navigation.navigate('ChatList', { me: username.trim() });
        } else {
          Alert.alert('Error', 'Invalid username or password.');
        }
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.logo}>👑 King Chat</Text>
      <TextInput
        placeholder="Username"
        style={styles.input}
        onChangeText={setUsername}
        value={username}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        placeholder="Password"
        style={styles.input}
        onChangeText={setPassword}
        value={password}
        secureTextEntry
      />
      {loading ? (
        <ActivityIndicator size="large" color="#0088cc" />
      ) : (
        <TouchableOpacity style={styles.btn} onPress={handleAuth}>
          <Text style={styles.btnText}>{isRegister ? 'Register' : 'Login'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
        <Text style={styles.link}>
          {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ChatListScreen — shows all chats and lets user start a new one
// ---------------------------------------------------------------------------
function ChatListScreen({ route, navigation }) {
  const { me } = route.params;
  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [chatData, userData] = await Promise.all([
          getUserChats(me),
          supabase.from('users_table').select('username').then(({ data }) =>
            (data || []).filter((u) => u.username !== me)
          ),
        ]);
        setChats(chatData);
        setAllUsers(userData);
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to load chats.');
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Subscribe to incoming calls
    const callChannel = subscribeToIncomingCalls(me, (call) => {
      setIncomingCall(call);
    });
    return () => callChannel.unsubscribe();
  }, [me]);

  const openChat = async (otherUser) => {
    try {
      const chat = await getOrCreateChat(me, otherUser);
      navigation.navigate('Chat', { me, chat, otherUser });
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open chat.');
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    navigation.navigate('VideoCall', { me, callRecord: call, isCaller: false });
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    await supabase
      .from('calls')
      .update({ status: 'rejected', ended_at: new Date().toISOString() })
      .eq('id', incomingCall.id);
    setIncomingCall(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0088cc" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Incoming call modal */}
      <Modal visible={!!incomingCall} transparent animationType="fade">
        <View style={styles.modal}>
          <View style={styles.card}>
            <Text style={styles.callFrom}>{incomingCall?.caller}</Text>
            <Text style={{ marginBottom: 20 }}>
              {incomingCall?.type === 'audio' ? '📞 Audio Call…' : '📹 Video Call…'}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={handleAcceptCall} style={styles.acc}>
                <Text style={{ color: '#fff' }}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeclineCall} style={styles.dec}>
                <Text style={{ color: '#fff' }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.listHeader}>
        <Text style={styles.logoSide}>👑 King Chat</Text>
        <Text style={styles.meLabel}>@{me}</Text>
      </View>

      <Text style={styles.sectionTitle}>Contacts</Text>
      <FlatList
        data={allUsers}
        keyExtractor={(item) => item.username}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tab} onPress={() => openChat(item.username)}>
            <Text style={styles.tabText}>💬 {item.username}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No other users found.</Text>}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ChatScreen — messages, voice messages, file sharing, and call buttons
// ---------------------------------------------------------------------------
function ChatScreen({ route, navigation }) {
  const { me, chat, otherUser } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const data = await getMessages(chat.id);
        setMessages(data);
        await markAsRead(chat.id, me);
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to load messages.');
      } finally {
        setLoading(false);
      }
    };
    loadMessages();

    const channel = subscribeToMessages(chat.id, (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
      if (newMsg.sender !== me) {
        markAsRead(chat.id, me).catch(() => {});
      }
    });
    return () => channel.unsubscribe();
  }, [chat.id, me]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendMessage(chat.id, trimmed, me);
      setText('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const startAudioCall = async () => {
    try {
      const { callId } = await initiateAudioCall(me, otherUser);
      navigation.navigate('VideoCall', { me, callRecord: { id: callId, caller: me, recipient: otherUser, type: 'audio' }, isCaller: true });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to start audio call.');
    }
  };

  const startVideoCall = async () => {
    try {
      const { callId } = await initiateVideoCall(me, otherUser);
      navigation.navigate('VideoCall', { me, callRecord: { id: callId, caller: me, recipient: otherUser, type: 'video' }, isCaller: true });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to start video call.');
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = isMessageFromCurrentUser(item, me);
    return (
      <View style={[styles.msg, isMe ? styles.myMsg : styles.otherMsg]}>
        <Text style={styles.msgText}>{getMessageDisplayText(item)}</Text>
        <Text style={styles.msgTime}>{formatTime(item.timestamp)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View style={styles.head}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headTitle}>{otherUser}</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={startAudioCall} style={styles.audioBtn}>
            <Text style={{ color: '#fff' }}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={startVideoCall} style={styles.videoBtn}>
            <Text style={{ color: '#fff' }}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0088cc" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id?.toString() ?? item.timestamp}
          renderItem={renderMessage}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages yet. Say hello! 👋</Text>
          }
          contentContainerStyle={{ padding: 10 }}
        />
      )}

      {/* Input bar */}
      <View style={styles.inRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.fld}
          placeholder="Message…"
          multiline
        />
        <TouchableOpacity onPress={handleSend} style={styles.sBtn} disabled={sending}>
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// VideoCallScreen — full-screen WebRTC audio/video call UI
// ---------------------------------------------------------------------------
function VideoCallScreen({ route, navigation }) {
  const { me, callRecord: initialCallRecord, isCaller } = route.params;
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callState, setCallState] = useState(isCaller ? 'ringing' : 'connecting');
  const [callRecord, setCallRecord] = useState(initialCallRecord);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const isAudio = callRecord.type === 'audio';

  useEffect(() => {
    let callUpdateChannel = null;

    const setupCall = async () => {
      try {
        if (isCaller) {
          // Caller: the offer was already created in chatService; we just need
          // the peer connection set up and wait for the answer.
          const { peerConnection, localStream: ls } = await _setupCallerPC();
          pcRef.current = peerConnection;
          localStreamRef.current = ls;
          setLocalStream(ls);

          callUpdateChannel = subscribeToCallUpdates(callRecord.id, async (updated) => {
            setCallRecord(updated);
            if (updated.status === 'accepted' && updated.answer_sdp && pcRef.current) {
              const answerDesc = JSON.parse(updated.answer_sdp);
              if (Platform.OS !== 'web') {
                const { RTCSessionDescription } = require('react-native-webrtc');
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerDesc));
              } else {
                await pcRef.current.setRemoteDescription(answerDesc);
              }
              setCallState('connected');
            }
            if (updated.status === 'ended' || updated.status === 'rejected') {
              _cleanup();
              navigation.goBack();
            }
          });
        } else {
          // Callee: answer the call
          const { peerConnection, localStream: ls } = await answerCall(callRecord, (stream) => {
            setRemoteStream(stream);
            setCallState('connected');
          });
          pcRef.current = peerConnection;
          localStreamRef.current = ls;
          setLocalStream(ls);

          peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
              addIceCandidate(callRecord.id, e.candidate, false).catch(() => {});
            }
          };
        }
      } catch (err) {
        Alert.alert('Call Error', err.message || 'Failed to set up call.');
        navigation.goBack();
      }
    };

    setupCall();
    return () => {
      if (callUpdateChannel) callUpdateChannel.unsubscribe();
      _cleanup();
    };
  }, []);

  const _setupCallerPC = async () => {
    const constraints = {
      audio: true,
      video: isAudio ? false : { width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    let ls;
    if (Platform.OS === 'web') {
      ls = await navigator.mediaDevices.getUserMedia(constraints);
    } else {
      const { mediaDevices } = require('react-native-webrtc');
      ls = await mediaDevices.getUserMedia(constraints);
    }

    const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    let pc;
    if (Platform.OS === 'web') {
      pc = new RTCPeerConnection(iceConfig);
      ls.getTracks().forEach((t) => pc.addTrack(t, ls));
      pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    } else {
      const { RTCPeerConnection } = require('react-native-webrtc');
      pc = new RTCPeerConnection(iceConfig);
      pc.addStream(ls);
      pc.onaddstream = (e) => setRemoteStream(e.stream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        addIceCandidate(callRecord.id, e.candidate, true).catch(() => {});
      }
    };

    return { peerConnection: pc, localStream: ls };
  };

  const _cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

  const handleHangUp = async () => {
    try {
      await endCall(callRecord.id, localStreamRef.current, pcRef.current);
    } catch (_) {}
    localStreamRef.current = null;
    pcRef.current = null;
    navigation.goBack();
  };

  return (
    <View style={styles.vStage}>
      {/* Remote stream or audio placeholder */}
      {isAudio ? (
        <View style={styles.audioPlaceholder}>
          <Text style={styles.audioIcon}>📞</Text>
          <Text style={{ color: '#fff', fontSize: 20 }}>
            {callState === 'ringing' ? `Calling ${callRecord.recipient ?? callRecord.caller}…` : 'Audio Call Active'}
          </Text>
        </View>
      ) : (
        <VideoPlayer stream={remoteStream} isLocal={false} audioOnly={false} />
      )}

      {/* Ringing overlay */}
      {callState === 'ringing' && (
        <View style={styles.ringing}>
          <Text style={{ color: '#fff', fontSize: 20 }}>
            Calling {callRecord.recipient ?? callRecord.caller}…
          </Text>
        </View>
      )}

      {/* Local PiP (video only) */}
      {!isAudio && localStream && (
        <View style={styles.pip}>
          <VideoPlayer stream={localStream} isLocal={true} audioOnly={false} />
        </View>
      )}

      {/* Hang-up button */}
      <TouchableOpacity onPress={handleHangUp} style={styles.hang}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Hang Up</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  logo: { fontSize: 40, fontWeight: 'bold', color: '#0088cc', marginBottom: 20 },
  input: { width: 280, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, marginBottom: 15, backgroundColor: '#fafafa' },
  btn: { backgroundColor: '#0088cc', padding: 15, borderRadius: 10, width: 200, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { marginTop: 10, color: '#0088cc', fontSize: 14 },

  // Chat list
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  logoSide: { fontSize: 20, fontWeight: 'bold', color: '#0088cc' },
  meLabel: { color: '#888', fontSize: 14 },
  sectionTitle: { paddingHorizontal: 15, paddingVertical: 8, fontSize: 13, color: '#888', fontWeight: '600', backgroundColor: '#f7f7f7' },
  tab: { padding: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  tabText: { fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 15 },

  // Chat screen
  head: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  backBtn: { padding: 6, marginRight: 8 },
  backText: { fontSize: 28, color: '#0088cc', lineHeight: 30 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: 'bold' },
  audioBtn: { backgroundColor: '#007bff', padding: 10, borderRadius: 20, marginRight: 6 },
  videoBtn: { backgroundColor: '#28a745', padding: 10, borderRadius: 20 },
  msg: { padding: 10, marginVertical: 3, borderRadius: 12, maxWidth: '80%' },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  otherMsg: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  msgText: { fontSize: 15 },
  msgTime: { fontSize: 11, color: '#aaa', alignSelf: 'flex-end', marginTop: 3 },
  inRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff', alignItems: 'flex-end' },
  fld: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20, maxHeight: 120, fontSize: 15 },
  sBtn: { backgroundColor: '#0088cc', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },

  // Call UI
  vStage: { flex: 1, backgroundColor: '#111', position: 'relative' },
  pip: { position: 'absolute', bottom: 110, right: 20, width: 120, height: 180, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#222' },
  webRemote: { width: '100%', height: '100%', objectFit: 'cover' },
  webLocal: { width: '100%', height: '100%', objectFit: 'cover' },
  mobileRemote: { flex: 1 },
  mobileLocal: { flex: 1 },
  hang: { backgroundColor: '#e03030', padding: 16, borderRadius: 40, position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 50 },
  ringing: { position: 'absolute', top: '38%', width: '100%', alignItems: 'center', zIndex: 10 },
  audioPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  audioIcon: { fontSize: 72, marginBottom: 20 },

  // Incoming call modal
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 40, borderRadius: 20, alignItems: 'center', width: 300 },
  callFrom: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  acc: { backgroundColor: '#28a745', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, marginRight: 12 },
  dec: { backgroundColor: '#dc3545', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="VideoCall" component={VideoCallScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
