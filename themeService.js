// themeService.js

const themes = {
    light: {
        background: '#ffffff',
        color: '#000000',
    },
    dark: {
        background: '#000000',
        color: '#ffffff',
    },
    blue: {
        background: '#e0f7fa',
        color: '#0d47a1',
    },
    green: {
        background: '#e8f5e9',
        color: '#1b5e20',
    },
};

let currentTheme = themes.light; // default theme

const setTheme = (themeName) => {
    if (themes[themeName]) {
        currentTheme = themes[themeName];
        applyTheme();
    } else {
        console.warn(`Theme ${themeName} is not defined.`);
    }
};

const applyTheme = () => {
    document.body.style.backgroundColor = currentTheme.background;
    document.body.style.color = currentTheme.color;
};

const getCurrentTheme = () => currentTheme;

export { setTheme, getCurrentTheme };