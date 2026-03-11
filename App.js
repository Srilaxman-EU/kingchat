import React, { useState, useEffect } from 'react';
import { View, Text, Button, Modal, TouchableOpacity, AsyncStorage } from 'react-native';

// Define themes
const themes = {
  Light: { background: '#ffffff', color: '#000000' },
  Dark: { background: '#000000', color: '#ffffff' },
  Ocean: { background: '#0077be', color: '#ffffff' },
  Sunset: { background: '#ff4500', color: '#ffffff' },
  Forest: { background: '#228b22', color: '#ffffff' },
  Purple: { background: '#800080', color: '#ffffff' },
};

// App component
const App = () => {
  const [theme, setTheme] = useState('Dark');
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      const storedTheme = await AsyncStorage.getItem('theme');
      if (storedTheme) setTheme(storedTheme);
    };
    loadTheme();
  }, []);

  const changeTheme = async (newTheme) => {
    setTheme(newTheme);
    await AsyncStorage.setItem('theme', newTheme);
    setModalVisible(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: themes[theme].background, borderRadius: 12 }}>
      <Text style={{ color: themes[theme].color }}>Welcome to KingChat!</Text>
      <Button title="Select Theme" onPress={() => setModalVisible(true)} />
      <Modal visible={modalVisible} transparent={true}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 12 }}>
            {Object.keys(themes).map((t) => (
              <TouchableOpacity key={t} onPress={() => changeTheme(t)}>
                <Text style={{ color: themes[t].color }}>{t}</Text>
              </TouchableOpacity>
            ))}
            <Button title="Close" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default App;