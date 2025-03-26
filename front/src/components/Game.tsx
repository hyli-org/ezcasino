import React, { useState, useEffect } from 'react';
import Card from './Card';
import VisualEffects from './VisualEffects';

type Suit = '♠' | '♣' | '♥' | '♦';
type CardType = {
  suit: Suit;
  value: string;
};

const Game: React.FC = () => {
  const [deck, setDeck] = useState<CardType[]>([]);
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');
  const [playerMoney, setPlayerMoney] = useState(1000);
  const [currentBet, setCurrentBet] = useState(10);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showLoseEffect, setShowLoseEffect] = useState(false);

  const createDeck = () => {
    const suits: Suit[] = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const newDeck: CardType[] = [];

    for (const suit of suits) {
      for (const value of values) {
        newDeck.push({ suit, value });
      }
    }

    return shuffleDeck(newDeck);
  };

  const shuffleDeck = (deck: CardType[]) => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  };

  const calculateScore = (hand: CardType[]) => {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.value === 'A') {
        aces++;
      } else if (['K', 'Q', 'J'].includes(card.value)) {
        score += 10;
      } else {
        score += parseInt(card.value);
      }
    }

    for (let i = 0; i < aces; i++) {
      if (score + 11 <= 21) {
        score += 11;
      } else {
        score += 1;
      }
    }

    return score;
  };

  const startNewGame = () => {
    const newDeck = createDeck();
    const playerCards = [newDeck[0], newDeck[1]];
    const dealerCards = [newDeck[2], newDeck[3]];

    setDeck(newDeck.slice(4));
    setPlayerHand(playerCards);
    setDealerHand(dealerCards);
    setGameOver(false);
    setMessage('');
  };

  const hit = () => {
    if (deck.length === 0) return;

    const newPlayerHand = [...playerHand, deck[0]];
    setPlayerHand(newPlayerHand);
    setDeck(deck.slice(1));

    const score = calculateScore(newPlayerHand);
    if (score > 21) {
      setGameOver(true);
      setMessage('Bust! You went over 21.');
      setPlayerMoney(prev => prev - currentBet);
      setShowLoseEffect(true);
      setTimeout(() => setShowLoseEffect(false), 4000);
    }
  };

  const stand = () => {
    let currentDealerHand = [...dealerHand];
    let currentDeck = [...deck];

    while (calculateScore(currentDealerHand) < 17 && currentDeck.length > 0) {
      currentDealerHand.push(currentDeck[0]);
      currentDeck = currentDeck.slice(1);
    }

    setDealerHand(currentDealerHand);
    setDeck(currentDeck);
    setGameOver(true);

    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(currentDealerHand);

    if (dealerScore > 21) {
      setMessage('Dealer busts! You win!');
      setPlayerMoney(prev => prev + currentBet);
      setShowWinEffect(true);
      setTimeout(() => setShowWinEffect(false), 4000);
    } else if (dealerScore > playerScore) {
      setMessage('Dealer wins!');
      setPlayerMoney(prev => prev - currentBet);
      setShowLoseEffect(true);
      setTimeout(() => setShowLoseEffect(false), 4000);
    } else if (dealerScore < playerScore) {
      setMessage('You win!');
      setPlayerMoney(prev => prev + currentBet);
      setShowWinEffect(true);
      setTimeout(() => setShowWinEffect(false), 4000);
    } else {
      setMessage('Push! It\'s a tie!');
    }
  };

  useEffect(() => {
    // Centrer la fenêtre au chargement
    const centerWindow = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const gameWidth = 400; // Largeur de la fenêtre
      const gameHeight = 600; // Hauteur approximative de la fenêtre
      
      setWindowPosition({
        x: (windowWidth - gameWidth) / 2,
        y: (windowHeight - gameHeight) / 2
      });
    };

    centerWindow();
    window.addEventListener('resize', centerWindow);

    return () => {
      window.removeEventListener('resize', centerWindow);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.win95-title-bar')) {
      setIsDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Limiter le déplacement aux bords de l'écran
      const maxX = window.innerWidth - 400; // Largeur de la fenêtre
      const maxY = window.innerHeight - 600; // Hauteur approximative de la fenêtre
      
      setWindowPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  useEffect(() => {
    startNewGame();
  }, []);

  return (
    <>
      <VisualEffects isWin={showWinEffect} isLose={showLoseEffect} />
      <div 
        className="win95-window"
        style={{
          transform: `translate(${windowPosition.x}px, ${windowPosition.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="win95-title-bar">
          <span>Blackjack</span>
          <div className="window-controls">
            <button className="minimize">-</button>
            <button className="maximize">□</button>
            <button className="close">×</button>
          </div>
        </div>
        
        <div className="menu-bar">
          <span className="menu-item">Game</span>
          <span className="menu-item">Options</span>
          <span className="menu-item">Help</span>
        </div>

        <div className="game-container">
          <div className="counters">
            <div className="counter">
              <span className="counter-label">Your Money</span>
              <div className="led-display">${playerMoney}</div>
            </div>
            <div className="counter">
              <span className="counter-label">Bet</span>
              <div className="led-display">${currentBet}</div>
            </div>
          </div>

          <div className="play-area">
            <div className="dealer-score">Dealer: {gameOver ? calculateScore(dealerHand) : '??'}</div>
            <div className="hand">
              {dealerHand.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  value={card.value}
                  hidden={index === 1 && !gameOver}
                />
              ))}
            </div>

            <div className="player-score">Player: {calculateScore(playerHand)}</div>
            <div className="hand">
              {playerHand.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  value={card.value}
                />
              ))}
            </div>

            {message && <p className="score">{message}</p>}
          </div>

          <div className="controls">
            <button 
              className="win95-button" 
              onClick={() => startNewGame()}
              disabled={!gameOver}
            >
              DEAL
            </button>
            <button 
              className="win95-button" 
              onClick={() => hit()} 
              disabled={gameOver}
            >
              HIT
            </button>
            <button 
              className="win95-button" 
              onClick={() => stand()} 
              disabled={gameOver}
            >
              STAND
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Game; 