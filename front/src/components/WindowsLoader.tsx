import React from 'react';
import '../styles/WindowsLoader.css';

interface WindowsLoaderProps {
  message?: string;
}

export const WindowsLoader: React.FC<WindowsLoaderProps> = ({ message }) => {
  return (
    <div className="windows-loader-overlay">
      <div className="windows-loader-container">
        <div className="windows-loader-title-bar">
          <span>Connecting...</span>
        </div>
        <div className="windows-loader-content">
          <p>{message || 'Please wait while we connect to your wallet...'}</p>
          <div className="progress-bar-container">
            <div className="progress-bar-blocks">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="progress-block"></div>
              ))}
            </div>
          </div>
          <button className="cancel-button" disabled>Cancel</button>
        </div>
      </div>
    </div>
  );
}; 