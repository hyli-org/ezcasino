import React, { useState, useEffect, useRef, useContext } from 'react';
import Card from './Card';
import VisualEffects from './VisualEffects';
import Cow from '../components/Cow';
import { gameService } from '../services/gameService';
import { GameState } from '../types/game';
import { authService } from '../services/authService';
import DesktopShortcut from './DesktopShortcut';
import '../styles/Game.css';
import { OnboardingContext } from '../contexts/OnboardingContext';

type Suit = '♠' | '♣' | '♥' | '♦';
type CardType = {
  suit: Suit;
  value: string;
};

interface GameProps {
  onBackgroundChange: (theme: 'day' | 'night') => void;
  theme: 'day' | 'night';
}

const Game: React.FC<GameProps> = ({ onBackgroundChange, theme }) => {
  const { isOnboarding, isTutorial } = useContext(OnboardingContext);
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');
  const [currentBet, setCurrentBet] = useState(10);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showLoseEffect, setShowLoseEffect] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showClaimButton, setShowClaimButton] = useState(false);
  const [showBSOD, setShowBSOD] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showShutdown, setShowShutdown] = useState(false);
  const [contractName, setContractName] = useState<string>('');
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

  const updateGameState = (newGameState: GameState, isClaiming: boolean = false) => {
    const playerCards = newGameState.user.map(convertToCard);
    const dealerCards = newGameState.bank.map(convertToCard);

    setPlayerHand(playerCards);
    setDealerHand(dealerCards);
    setCurrentBet(newGameState.bet);
    setGameOver(newGameState.state !== 'Ongoing');
    setGameState(newGameState);

    // Ne pas déclencher les effets visuels lors d'un claim
    if (!isClaiming) {
      if (newGameState.state === 'Won') {
        setMessage('You win!');
        setShowWinEffect(true);
        setTimeout(() => setShowWinEffect(false), 4000);
      } else if (newGameState.state === 'Lost') {
        setMessage('Dealer wins!');
        setShowLoseEffect(true);
        setTimeout(() => setShowLoseEffect(false), 4000);
      }
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
      updateGameState(gameState, true);
      setShowClaimButton(false);
      setGameOver(true);
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
    const initializeGame = async () => {
      try {
        const username = localStorage.getItem('username');
        if (!username) {
          setIsLoading(false);
          return;
        }
        setIsLoading(true);
        setError(null);
        setShowClaimButton(false);
        
        // Récupérer la configuration
        const config = await gameService.getConfig();
        setContractName(config.contract_name);
        
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
      } catch (error) {
        setError('Failed to initialize game');
        console.error('Error initializing game:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!isOnboarding && !isTutorial) {
      initializeGame();
    }
  }, [isOnboarding, isTutorial]);

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
    if (key.length <= 20) return `${key}.${contractName}`;
    return `${key.slice(0, 10)}[...]${key.slice(-10)}.${contractName}`;
  };

  const copySessionKey = async () => {
    const sessionKey = authService.getSessionKey();
    if (!sessionKey) return;
    
    try {
      await navigator.clipboard.writeText(`${sessionKey}.${contractName}`);
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

  const handleErrorClose = () => {
    setShowBSOD(true);
  };

  const handleBSODClick = () => {
    setShowBSOD(false);
    setError(null);
  };

  const handleStartClick = () => {
    setShowStartMenu(!showStartMenu);
  };

  const handleStartMenuItemClick = (action: string) => {
    switch (action) {
      case 'new-game':
        startNewGame();
        break;
      case 'shutdown':
        setShowShutdown(true);
        const shutdownSound = new Audio('/sounds/shutdown.mp3');
        shutdownSound.play();
        // Attendre que le son se termine avant de fermer
        setTimeout(() => {
          window.close();
        }, 3000);
        break;
    }
    setShowStartMenu(false);
  };

  // Formater l'heure au format Windows 95
  const getFormattedTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const toggleBackground = () => {
    onBackgroundChange(theme === 'day' ? 'night' : 'day');
  };

  if (isOnboarding || isTutorial) {
    return null;
  }

  return (
    <>
      <VisualEffects isWin={showWinEffect} isLose={showLoseEffect} />
      {showBSOD ? (
        <div className="bsod" onClick={handleBSODClick}>
          <div className="bsod-content">
            <div className="bsod-header">
              Windows
            </div>
            <div className="bsod-message">
              An exception 0E has occurred at 0028:C11B0E47 in VxD VMM(01) + 00010E47.
              This was called from 0028:C11B0E47 in VxD VWIN32(01) + 00010E47.<br/>
              <br/>
              The current application will be terminated.<br/>
              <br/>
              *  Press any key to terminate the current application<br/>
              *  Press CTRL+ALT+DEL again to restart your computer. You will
                 lose any unsaved information in all applications.
            </div>
            <div className="bsod-message">
              Error: INSUFFICIENT_HOUSE_EDGE<br/>
              <br/>
              An error has occurred while trying to take your money.<br/>
              <br/>
              The house always wins, but this time something went wrong.
            </div>
            <div className="bsod-footer">
              Press any key to continue
            </div>
          </div>
        </div>
      ) : showShutdown ? (
        <div className="shutdown-screen">
          <div className="shutdown-content">
            <div className="shutdown-header">
              Windows 95
            </div>
            <div className="shutdown-message">
              It is now safe to turn off your computer.
            </div>
            <div className="shutdown-progress">
              <div className="shutdown-progress-bar"></div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <DesktopShortcut
            icon="/background-icon.svg"
            label="Switch Background"
            onClick={toggleBackground}
          />
          <Cow className="cow1" theme={theme} />
          <Cow className="cow2" theme={theme} />
          <Cow className="cow3" theme={theme} />
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
              <span>eZKasino</span>
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
                  <div className="error-title-bar">
                    <div className="error-title-text">Error</div>
                    <div className="error-close-button" onClick={handleErrorClose}>×</div>
                  </div>
                  <div className="error-content">
                    <div className="error-message-container">
                      <img src="/error-icon.png" alt="Error" className="error-icon" />
                      <p className="error-message">
                        {error}
                        {showClaimButton && (
                          <>
                            <br />
                            Please send funds to your session key, then claim them
                          </>
                        )}
                      </p>
                    </div>
                    {showClaimButton && (
                      <button className="claim-button" onClick={handleClaim} disabled={isLoading}>
                        Claim
                      </button>
                    )}
                  </div>
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
          <div className="taskbar">
            <div className="start-button" onClick={handleStartClick}>
              <img src="/windows-logo.png" alt="Windows" />
              <span>Start</span>
            </div>
            <div className="taskbar-divider" />
            <div className="taskbar-button active">
              <img src="/cards-icon.png" alt="Blackjack" />
              eZKasino
            </div>
            <div className="taskbar-time">
              {getFormattedTime()}
            </div>
          </div>
          {showStartMenu && (
            <div className="start-menu">
              <div className="start-menu-left">
                Windows 95
              </div>
              <div className="start-menu-items">
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('new-game')}>
                  <img src="/cards-icon.png" alt="New Game" />
                  eZKasino
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('shutdown')}>
                  <img src="/shutdown-icon.png" alt="Shut Down" />
                  Shut Down...
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default Game; 
