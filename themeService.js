// themeService.js - 6 themes for KingChat

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

const THEME_STORAGE_KEY = 'kingchat_theme';
let currentThemeId = 'Dark';

const getStoredTheme = () => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'Dark';
  }
  return 'Dark';
};

const setTheme = (themeName) => {
  if (THEMES[themeName]) {
    currentThemeId = themeName;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, themeName);
    }
  } else {
    console.warn(`Theme "${themeName}" is not defined.`);
  }
};

const getCurrentTheme = () => THEMES[currentThemeId] || THEMES.Dark;

const getAllThemes = () => THEMES;

export { THEMES, THEME_STORAGE_KEY, setTheme, getCurrentTheme, getAllThemes, getStoredTheme };