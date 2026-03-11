import React, { useState } from 'react';
import { supabase } from '../supabaseClient'; // Ensure that supabaseClient is configured

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
 
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    
    // Simple form validation
    if (!email || !password) {
      return setError('Please enter your email and password.');
    }
    
    const { user, session, error } = await supabase.auth.signIn({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      // Handle successful login (e.g. redirect or update state)
      console.log('Logged in user:', user);
    }
  };

  return (
    <div className="login-container">
      <h2>Login to KingChat</h2>
      <form onSubmit={handleLogin}>
        <div>
          <label>Email:</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
        </div>
        <div>
          <label>Password:</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
        </div>
        {error && <div style={{color: 'red'}}>{error}</div>}
        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default LoginPage;