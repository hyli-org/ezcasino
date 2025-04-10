import React, { useState, useEffect, useContext } from 'react';
import { OnboardingContext } from '../contexts/OnboardingContext';
import Card from './Card';
import './TutorialGame.css';

type Suit = '♠' | '♥' | '♣' | '♦';

interface TutorialStep {
  dealerCards: { suit: Suit; value: string }[];
  playerCards: { suit: Suit; value: string }[];
  instruction: string;
  enabledButton: 'HIT' | 'STAND' | 'DOUBLE' | 'NEXT' | null;
  autoProgress: boolean;
  delay?: number;
}

const tutorialSteps: TutorialStep[] = [
  {
    dealerCards: [
      { suit: '♠', value: '7' },
      { suit: '♥', value: 'A' }
    ],
    playerCards: [
      { suit: '♣', value: 'J' },
      { suit: '♦', value: '6' }
    ],
    instruction: "You have 16. In Blackjack, you want to get closer to 21 without going over. Click HIT to improve your hand.",
    enabledButton: 'HIT',
    autoProgress: false
  },
  {
    dealerCards: [
      { suit: '♠', value: '7' },
      { suit: '♥', value: 'A' }
    ],
    playerCards: [
      { suit: '♣', value: 'J' },
      { suit: '♦', value: '6' },
      { suit: '♠', value: '4' }
    ],
    instruction: "Great! You now have 20, which is a strong hand. Click STAND to keep your hand.",
    enabledButton: 'STAND',
    autoProgress: false
  },
  {
    dealerCards: [
      { suit: '♠', value: '7' },
      { suit: '♥', value: 'A' }
    ],
    playerCards: [
      { suit: '♣', value: 'J' },
      { suit: '♦', value: '6' },
      { suit: '♠', value: '4' }
    ],
    instruction: "The dealer has 18. You win with 20! In Blackjack, you win if your hand is closer to 21 than the dealer's. Click NEXT to learn about another strategy!",
    enabledButton: 'NEXT',
    autoProgress: false
  },
  {
    dealerCards: [
      { suit: '♣', value: '3' },
      { suit: '♥', value: '9' }
    ],
    playerCards: [
      { suit: '♠', value: '6' },
      { suit: '♦', value: '5' }
    ],
    instruction: "You have 11, which is a good hand for doubling down. Click DOUBLE to double your bet and receive one more card.",
    enabledButton: 'DOUBLE',
    autoProgress: false
  },
  {
    dealerCards: [
      { suit: '♣', value: '3' },
      { suit: '♥', value: '9' }
    ],
    playerCards: [
      { suit: '♠', value: '6' },
      { suit: '♦', value: '5' },
      { suit: '♥', value: '10' }
    ],
    instruction: "Perfect! You got a 10 and now have 21 (Blackjack)! Let's see what the dealer has.",
    enabledButton: null,
    autoProgress: true,
    delay: 3000
  },
  {
    dealerCards: [
      { suit: '♣', value: '3' },
      { suit: '♥', value: '9' }
    ],
    playerCards: [
      { suit: '♠', value: '6' },
      { suit: '♦', value: '5' },
      { suit: '♥', value: '10' }
    ],
    instruction: "The dealer has 12 and must hit. Let's see what happens.",
    enabledButton: null,
    autoProgress: true,
    delay: 3000
  },
  {
    dealerCards: [
      { suit: '♣', value: '3' },
      { suit: '♥', value: '9' },
      { suit: '♠', value: '8' }
    ],
    playerCards: [
      { suit: '♠', value: '6' },
      { suit: '♦', value: '5' },
      { suit: '♥', value: '10' }
    ],
    instruction: "The dealer has 20, but you have 21! You win with Blackjack, which pays 3:2!",
    enabledButton: null,
    autoProgress: true,
    delay: 3000
  },
  {
    dealerCards: [
      { suit: '♣', value: '3' },
      { suit: '♥', value: '9' },
      { suit: '♠', value: '8' }
    ],
    playerCards: [
      { suit: '♠', value: '6' },
      { suit: '♦', value: '5' },
      { suit: '♥', value: '10' }
    ],
    instruction: "Congratulations! You've completed the tutorial and learned the basics of Blackjack. You're ready to play for real!",
    enabledButton: null,
    autoProgress: false
  }
];

const TutorialGame: React.FC = () => {
  const { tutorialStep, setTutorialStep, completeTutorial } = useContext(OnboardingContext);
  const [currentStep, setCurrentStep] = useState<TutorialStep>(tutorialSteps[0]);
  const [showDealerCards, setShowDealerCards] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    setCurrentStep(tutorialSteps[tutorialStep]);
    
    // Show dealer's cards in steps 3, 6, 7 (final step)
    if (tutorialStep === 2 || tutorialStep === 5 || tutorialStep === 6 || tutorialStep === 7) {
      setShowDealerCards(true);
    } else {
      setShowDealerCards(false);
    }
  }, [tutorialStep]);

  useEffect(() => {
    if (currentStep.autoProgress) {
      const timer = setTimeout(() => {
        if (tutorialStep < tutorialSteps.length - 1) {
          setTutorialStep(tutorialStep + 1);
        } else {
          completeTutorial();
        }
      }, currentStep.delay || 3000);
      
      return () => clearTimeout(timer);
    }
  }, [currentStep, tutorialStep, setTutorialStep, completeTutorial]);

  const handleButtonClick = (action: 'HIT' | 'STAND' | 'DOUBLE' | 'NEXT') => {
    if (action === currentStep.enabledButton) {
      if (tutorialStep < tutorialSteps.length - 1) {
        setTutorialStep(tutorialStep + 1);
      } else {
        completeTutorial();
      }
    }
  };

  const handlePlayNow = () => {
    completeTutorial();
  };

  return (
    <div className="tutorial-game">
      <div className="tutorial-instruction">
        {currentStep.instruction}
      </div>
      
      <div className="tutorial-table">
        <div className="dealer-area">
          <h2>Dealer</h2>
          <div className="hand">
            {currentStep.dealerCards.map((card, index) => (
              <Card
                key={`dealer-${index}`}
                suit={card.suit}
                value={card.value}
                hidden={!showDealerCards && index === 1}
              />
            ))}
          </div>
        </div>
        
        <div className="player-area">
          <h2>{username || 'Player'}</h2>
          <div className="hand">
            {currentStep.playerCards.map((card, index) => (
              <Card
                key={`player-${index}`}
                suit={card.suit}
                value={card.value}
                hidden={false}
              />
            ))}
          </div>
        </div>
      </div>
      
      <div className="tutorial-controls">
        <button
          className={`win95-button ${currentStep.enabledButton === 'HIT' ? 'active' : 'disabled'}`}
          onClick={() => handleButtonClick('HIT')}
          disabled={currentStep.enabledButton !== 'HIT'}
        >
          HIT
        </button>
        <button
          className={`win95-button ${currentStep.enabledButton === 'STAND' ? 'active' : 'disabled'}`}
          onClick={() => handleButtonClick('STAND')}
          disabled={currentStep.enabledButton !== 'STAND'}
        >
          STAND
        </button>
        <button
          className={`win95-button ${currentStep.enabledButton === 'DOUBLE' ? 'active' : 'disabled'}`}
          onClick={() => handleButtonClick('DOUBLE')}
          disabled={currentStep.enabledButton !== 'DOUBLE'}
        >
          DOUBLE
        </button>
        <button
          className={`win95-button ${currentStep.enabledButton === 'NEXT' ? 'active' : 'disabled'}`}
          onClick={() => handleButtonClick('NEXT')}
          disabled={currentStep.enabledButton !== 'NEXT'}
        >
          NEXT
        </button>
      </div>
      
      {tutorialStep === tutorialSteps.length - 1 && (
        <button className="win95-button play-now" onClick={handlePlayNow}>
          PLAY NOW
        </button>
      )}
    </div>
  );
};

export default TutorialGame; 