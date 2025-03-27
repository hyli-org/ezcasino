import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import VisualEffects from './VisualEffects';
import { gameService } from '../services/gameService';
import { GameState } from '../types/game';
import { authService } from '../services/authService';
import '../styles/Game.css';

type Suit = '♠' | '♣' | '♥' | '♦';
type CardType = {
  suit: Suit;
  value: string;
};

const Game: React.FC = () => {
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');
  const [currentBet, setCurrentBet] = useState(10);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 });
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showLoseEffect, setShowLoseEffect] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showClaimButton, setShowClaimButton] = useState(false);
  const isInitializedRef = useRef(false);

  const convertToCard = (value: number): CardType => {
    const suits: Suit[] = ['♠', '♣', '♥', '♦'];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    let cardValue: string;

    if (value === 1) cardValue = 'A';
    else if (value === 11) cardValue = 'J';
    else if (value === 12) cardValue = 'Q';
    else if (value === 13) cardValue = 'K';
    else cardValue = value.toString();

    return { suit, value: cardValue };
  };

  const updateGameState = (newGameState: GameState) => {
    const playerCards = newGameState.user.map(convertToCard);
    const dealerCards = newGameState.bank.map(convertToCard);

    setPlayerHand(playerCards);
    setDealerHand(dealerCards);
    setCurrentBet(newGameState.bet);
    setGameOver(newGameState.state !== 'Ongoing');
    setGameState(newGameState);

    // Gérer les messages et effets en fonction de l'état
    if (newGameState.state === 'Won') {
      setMessage('You win!');
      setShowWinEffect(true);
      setTimeout(() => setShowWinEffect(false), 4000);
    } else if (newGameState.state === 'Lost') {
      setMessage('Dealer wins!');
      setShowLoseEffect(true);
      setTimeout(() => setShowLoseEffect(false), 4000);
    }
  };

  const startNewGame = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setShowClaimButton(false);
      // Ne générer une nouvelle sessionKey que si nous n'en avons pas déjà une
      if (!authService.getSessionKey()) {
        authService.generateSessionKey();
      }
      const gameState = await gameService.initGame();
      updateGameState(gameState);
      setMessage('');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to initialize game. Please try again.';
      setError(errorMessage);
      if (errorMessage.includes('Insufficient balance')) {
        setShowClaimButton(true);
      }
      console.error('Error initializing game:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const hit = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const gameState = await gameService.hit();
      updateGameState(gameState);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to hit. Please try again.';
      setError(errorMessage);
      console.error('Error hitting:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const stand = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const gameState = await gameService.stand();
      updateGameState(gameState);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to stand. Please try again.';
      setError(errorMessage);
      console.error('Error standing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const doubleDown = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const gameState = await gameService.doubleDown();
      updateGameState(gameState);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to double down. Please try again.';
      setError(errorMessage);
      console.error('Error doubling down:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const gameState = await gameService.claim();
      updateGameState(gameState);
      setShowClaimButton(false);
      
      // Si la balance est suffisante après le claim, démarrer une nouvelle partie
      if (gameState.balance >= 10) {
        await startNewGame();
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to claim. Please try again.';
      setError(errorMessage);
      console.error('Error claiming:', err);
    } finally {
      setIsLoading(false);
    }
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

  // Centrer la fenêtre au chargement
  useEffect(() => {
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

  // Initialiser la partie au chargement
  useEffect(() => {
    const initGame = async () => {
      if (isInitializedRef.current) return;
      
      try {
        setIsLoading(true);
        setError(null);
        setShowClaimButton(false);
        // Si nous avons déjà une sessionKey, l'utiliser directement
        const existingSessionKey = authService.getSessionKey();
        isInitializedRef.current = true;
        if (existingSessionKey) {
          const gameState = await gameService.initGame();
          updateGameState(gameState);
        } else {
          // Sinon, démarrer une nouvelle partie
          await startNewGame();
        }
      } catch (err: any) {
        if (err.message?.includes('Insufficient balance')) {
          setError(err.message);
          setShowClaimButton(true);
        } else {
          setError('Failed to initialize game. Please try again.');
        }
        console.error('Error initializing game:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initGame();
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

  const truncateSessionKey = (key: string | null): string => {
    if (!key) return 'No active session';
    if (key.length <= 20) return key;
    return `${key.slice(0, 10)}[...]${key.slice(-10)}`;
  };

  const copySessionKey = async () => {
    const sessionKey = authService.getSessionKey();
    if (!sessionKey) return;
    
    try {
      await navigator.clipboard.writeText(sessionKey);
      setCopyMessage('Copied!');
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleNewSessionKey = () => {
    authService.clearSession();
    startNewGame();
    setShowGameMenu(false);
  };

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
          <div 
            className="menu-item" 
            onClick={() => setShowGameMenu(!showGameMenu)}
            style={{ position: 'relative' }}
          >
            Game
            {showGameMenu && (
              <div className="menu-dropdown">
                <div className="menu-option" onClick={handleNewSessionKey}>
                  New session key
                </div>
              </div>
            )}
          </div>
          <span className="menu-item">Options</span>
          <span className="menu-item">Help</span>
        </div>

        <div className="game-container">
          {error && (
            <div className="error">
              {error}
              {showClaimButton && (
                <>
                  <div className="error-message">Please send funds to your session key, then claim them</div>
                  <button
                    className="win95-button claim-button"
                    onClick={handleClaim}
                    disabled={isLoading}
                  >
                    CLAIM
                  </button>
                </>
              )}
            </div>
          )}
          <div className="session-key-container">
            <span className="counter-label">Session Key</span>
            <div 
              className="led-display session-key" 
              onClick={copySessionKey}
              style={{ cursor: 'pointer' }}
            >
              {truncateSessionKey(authService.getSessionKey())}
              {copyMessage && <span className="copy-message">{copyMessage}</span>}
            </div>
          </div>
          <div className="counters">
            <div className="counter">
              <span className="counter-label">Your Money</span>
              <div className="led-display">${gameState?.balance || 0}</div>
            </div>
            <div className="counter">
              <span className="counter-label">Bet</span>
              <div className="led-display">${currentBet}</div>
            </div>
          </div>

          <div className="play-area">
            <div className="dealer-score">Dealer: {dealerHand.length > 2 || gameState?.state !== 'Ongoing' ? gameState?.bank_count || 0 : '??'}</div>
            <div className="hand">
              {dealerHand.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  value={card.value}
                  hidden={index === 1 && dealerHand.length <= 2}
                />
              ))}
            </div>

            <div className="player-score">Player: {gameState?.user_count || 0}</div>
            <div className="hand">
              {playerHand.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  value={card.value}
                />
              ))}
            </div>
            {message && <div className="message">{message}</div>}
            {!gameOver && (
              <div className="controls">
                <button
                  className="win95-button"
                  onClick={hit}
                  disabled={isLoading}
                >
                  HIT
                </button>
                <button
                  className="win95-button"
                  onClick={stand}
                  disabled={isLoading}
                >
                  STAND
                </button>
                <button
                  className="win95-button"
                  onClick={doubleDown}
                  disabled={isLoading}
                >
                  DOUBLE
                </button>
              </div>
            )}
            {gameOver && (
              <button
                className="win95-button"
                onClick={startNewGame}
                disabled={isLoading}
              >
                DEAL
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Game; 
