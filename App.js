import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import { RTCPeerConnection, RTCView, mediaDevices, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { supabase } from './supabase';

const Stack = createStackNavigator();

// STUN Servers (Used to help devices find each other globally)
const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
};

// ... (Keep Welcome and Login Screens same as previous) ...

function ChatScreen({ route }) {
  const { myUser } = route.params;
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  
  // WebRTC States
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const pc = useRef(null);

  useEffect(() => {
    fetchUsers();
    setupSignaling();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('users_table').select('username');
    setUsers(data.filter(u => u.username !== myUser));
  };

  // --- SIGNALING LOGIC (Using Supabase) ---
  const setupSignaling = () => {
    supabase.channel('calls')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, async (payload) => {
        const signal = payload.new;
        if (signal.receiver_username === myUser) {
          if (signal.type === 'offer') handleOffer(signal);
          else if (signal.type === 'answer') handleAnswer(signal);
          else if (signal.type === 'candidate') handleCandidate(signal);
        }
      }).subscribe();
  };

  const startCall = async () => {
    setIsCalling(true);
    const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
    setLocalStream(stream);

    pc.current = new RTCPeerConnection(configuration);
    stream.getTracks().forEach(track => pc.current.addTrack(track, stream));

    pc.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('candidate', event.candidate);
      }
    };

    pc.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    sendSignal('offer', offer);
  };

  const handleOffer = async (signal) => {
    setSelectedUser(signal.caller_username);
    setIsCalling(true);
    const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
    setLocalStream(stream);

    pc.current = new RTCPeerConnection(configuration);
    stream.getTracks().forEach(track => pc.current.addTrack(track, stream));

    pc.current.onicecandidate = (event) => {
      if (event.candidate) sendSignal('candidate', event.candidate);
    };

    pc.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    sendSignal('answer', answer);
  };

  const handleAnswer = async (signal) => {
    await pc.current.setRemoteDescription(new RTCSessionDescription(signal.data));
  };

  const handleCandidate = async (signal) => {
    await pc.current.addIceCandidate(new RTCIceCandidate(signal.data));
  };

  const sendSignal = async (type, data) => {
    await supabase.from('calls').insert([{
      caller_username: myUser,
      receiver_username: selectedUser,
      type: type,
      data: data
    }]);
  };

  const endCall = () => {
    if (pc.current) pc.current.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
  };

  return (
    <View style={styles.splitWrapper}>
      {/* SIDEBAR (Left 30%) */}
      <View style={styles.sidebar}>
        <Text style={styles.sideHeader}>King Chat</Text>
        <FlatList 
          data={users}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.userItem} onPress={() => setSelectedUser(item.username)}>
              <Text>{item.username}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* CHAT AREA (Right 70%) */}
      <View style={styles.chatArea}>
        {selectedUser ? (
          <View style={{flex:1}}>
            <View style={styles.header}>
              <Text style={{fontWeight:'bold'}}>{selectedUser}</Text>
              {!isCalling ? (
                <TouchableOpacity onPress={startCall} style={styles.callBtn}><Text style={{color:'#fff'}}>Call</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={endCall} style={{backgroundColor:'red', padding:8, borderRadius:5}}><Text style={{color:'#fff'}}>End</Text></TouchableOpacity>
              )}
            </View>

            {isCalling ? (
              <View style={styles.videoBox}>
                {/* REMOTE VIDEO (Large) */}
                {remoteStream && (
                  <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
                )}
                {/* LOCAL VIDEO (Small Box) */}
                {localStream && (
                  <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" />
                )}
              </View>
            ) : (
              /* Messaging logic same as before... */
              <Text style={{textAlign:'center', marginTop:20}}>Start chatting with {selectedUser}</Text>
            )}
          </View>
        ) : <Text style={styles.placeholder}>Select a contact</Text>}
      </View>
    </View>
  );
}

// ... (Keep Styles same, but add these Video styles) ...
const styles = StyleSheet.create({
  // ... previous styles ...
  videoBox: { flex: 1, backgroundColor: '#000', position: 'relative' },
  remoteVideo: { flex: 1 },
  localVideo: { width: 100, height: 150, position: 'absolute', bottom: 20, right: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  callBtn: { backgroundColor: '#28a745', padding: 10, borderRadius: 20 }
});
