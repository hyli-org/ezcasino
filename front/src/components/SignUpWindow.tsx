import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import './SignUpWindow.css';

interface SignUpWindowProps {
  onClose: () => void;
}

const SignUpWindow: React.FC<SignUpWindowProps> = ({ onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prefill username from onboarding
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    
    try {
      authService.setUser(username.trim());
      // Here you would typically also save the password
      // For now, we'll just close the window
      onClose();
    } catch (err) {
      setError('Failed to set username. Please try again.');
    }
  };

  return (
    <div className="signup-overlay">
      <div className="win95-window signup-window">
        <div className="win95-title-bar">
          <span>Sign Up</span>
          <div className="window-controls">
            <button className="minimize">-</button>
            <button className="maximize">□</button>
            <button className="close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="signup-content">
          <div className="signup-header">
            <img src="/cards-icon.png" alt="eZKasino" className="signup-icon" />
            <h2>Create Your Account</h2>
          </div>
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="form-group">
              <label htmlFor="username">Username:</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="win95-input"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password:</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="win95-input"
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="form-actions">
              <button type="submit" className="win95-button" disabled={!username.trim() || !password.trim()}>
                Sign Up
              </button>
              <button type="button" className="win95-button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUpWindow; 