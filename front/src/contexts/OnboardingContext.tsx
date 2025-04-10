import React, { createContext, useState, useEffect } from 'react';

interface OnboardingContextType {
  isOnboarding: boolean;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  completeOnboarding: () => void;
  isTutorial: boolean;
  tutorialStep: number;
  setTutorialStep: (step: number) => void;
  completeTutorial: () => void;
}

export const OnboardingContext = createContext<OnboardingContextType>({
  isOnboarding: false,
  currentStep: 0,
  setCurrentStep: () => {},
  completeOnboarding: () => {},
  isTutorial: false,
  tutorialStep: 0,
  setTutorialStep: () => {},
  completeTutorial: () => {},
});

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTutorial, setIsTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  useEffect(() => {
    const username = localStorage.getItem('username');
    const tutorialCompleted = localStorage.getItem('tutorialCompleted');
    
    if (username) {
      setIsOnboarding(false);
      if (!tutorialCompleted) {
        setIsTutorial(true);
      }
    } else {
      setIsOnboarding(true);
    }
  }, []);

  const completeOnboarding = () => {
    setIsOnboarding(false);
    setIsTutorial(true);
  };

  const completeTutorial = () => {
    setIsTutorial(false);
    localStorage.setItem('tutorialCompleted', 'true');
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboarding,
        currentStep,
        setCurrentStep,
        completeOnboarding,
        isTutorial,
        tutorialStep,
        setTutorialStep,
        completeTutorial,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}; 