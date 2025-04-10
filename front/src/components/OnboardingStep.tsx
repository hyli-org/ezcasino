import React from 'react';

interface OnboardingStepProps {
  step: number;
  username: string;
  setUsername: (username: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const OnboardingStep: React.FC<OnboardingStepProps> = ({
  step,
  username,
  setUsername,
  onSubmit,
}) => {
  return (
    <div className="onboarding-step">
      <div className="onboarding-header">
        <img src="/cards-icon.png" alt="eZKasino" className="onboarding-icon" />
        <h2>Welcome to eZKasino!</h2>
      </div>
      <div className="onboarding-body">
        <p>Please enter your username to get started:</p>
        <form onSubmit={onSubmit} className="onboarding-form">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="win95-input"
            autoFocus
          />
          <button type="submit" className="win95-button" disabled={!username.trim()}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};

export default OnboardingStep; 