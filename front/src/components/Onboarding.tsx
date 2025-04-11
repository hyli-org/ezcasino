import React, { useState, useContext } from 'react';
import { OnboardingContext } from '../contexts/OnboardingContext';
import OnboardingStep from './OnboardingStep';
import TutorialGame from './TutorialGame';
import {authService} from '../services/authService';
import './Onboarding.css';

const Onboarding: React.FC = () => {
  const { isOnboarding, isTutorial, currentStep, setCurrentStep, completeOnboarding } = useContext(OnboardingContext);
  const [username, setUsername] = useState('');

  if (!isOnboarding && !isTutorial) return null;

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      authService.setUser(username.trim());
      authService.generateSessionKey();
      completeOnboarding();
    }
  };

  if (isTutorial) {
    return <TutorialGame />;
  }

  return (
    <div className="onboarding-overlay">
      <div className="win95-window onboarding-window">
        <div className="win95-title-bar">
          <span>Welcome to eZKasino</span>
          <div className="window-controls">
            <button className="minimize">-</button>
            <button className="maximize">□</button>
            <button className="close">×</button>
          </div>
        </div>
        <div className="onboarding-content">
          <OnboardingStep
            step={currentStep}
            username={username}
            setUsername={setUsername}
            onSubmit={handleUsernameSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default Onboarding; 
