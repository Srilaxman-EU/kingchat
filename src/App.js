// Assuming this is the structure of your App.js file

import React, { useState } from 'react';

const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={isDarkMode ? 'dark-mode' : 'light-mode'}>
      {/* Theme Selector */}
      <select onChange={toggleTheme} value={isDarkMode ? 'dark' : 'light'}>
        <option value="dark">Dark Mode</option>
        <option value="light">Light Mode</option>
      </select>
      {/* Login Page Content */}
      <h1>{isDarkMode ? 'Welcome to KingChat in Dark Mode' : 'Welcome to KingChat in Light Mode'}</h1>
    </div>
  );
};

export default App;
