import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import VisualEffects from './VisualEffects';
import Cow from '../components/Cow';
import { gameService } from '../services/gameService';
import { GameState } from '../types/game';
import DesktopShortcut from './DesktopShortcut';
import { HyleWallet, sessionKeyService, useWallet } from 'hyle-wallet';
import '../styles/Game.css';

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
  const { wallet } = useWallet();
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [currentBet, setCurrentBet] = useState(10);
  const [showStartGame, setShowStartGame] = useState(true);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showLoseEffect, setShowLoseEffect] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showClaimButton, setShowClaimButton] = useState(false);
  const [showBSOD, setShowBSOD] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showShutdown, setShowShutdown] = useState(false);
  const [contractName, setContractName] = useState<string>('');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const isInitializedRef = useRef(false);
  const [password, setPassword] = useState('password123');

  // Surveiller les changements de wallet pour détecter la déconnexion
  useEffect(() => {
    if (!wallet && gameService.getPrivateKey()) {
      gameService.clearSession();
    }
  }, [wallet]);

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
        setShowWinEffect(true);
        setTimeout(() => setShowWinEffect(false), 4000);
      } else if (newGameState.state === 'Lost') {
        setShowLoseEffect(true);
        setTimeout(() => setShowLoseEffect(false), 4000);
      }
    }
  };

  const startNewGame = async () => {
    try {
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      const privateKey = gameService.getPrivateKey();
      if (!privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      setShowClaimButton(false);
      const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
      const gameState = await gameService.initGame(wallet_blobs, wallet.address);
      updateGameState(gameState);
      setShowStartGame(false);
      setError(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to initialize game. Please try again.';
      if (errorMessage.includes('Insufficient balance')) {
        setError(errorMessage);
        setShowClaimButton(true);
      }
      console.error('Error initializing game:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const hit = async () => {
    try {
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      const privateKey = gameService.getPrivateKey();
      if (!privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
      const gameState = await gameService.hit(wallet_blobs, wallet.address);
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
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      const privateKey = gameService.getPrivateKey();
      if (!privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
      const gameState = await gameService.stand(wallet_blobs, wallet.address);
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
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      const privateKey = gameService.getPrivateKey();
      if (!privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
      const gameState = await gameService.doubleDown(wallet_blobs, wallet.address);
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
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      const privateKey = gameService.getPrivateKey();
      if (!privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
      const gameState = await gameService.claim(wallet_blobs, wallet.address);
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

  const truncateSessionKey = (key: string | null, suffix: string = ''): string => {
    if (!key) return 'No active session';
    if (key.length <= 20) return suffix ? `${key}${suffix}` : key;
    return suffix ? `${key.slice(0, 10)}[...]${key.slice(-10)}${suffix}` : `${key.slice(0, 10)}[...]${key.slice(-10)}`;
  };

  const formatErrorMessage = (message: string): string => {
    if (!message) return '';
    return message.replace(/[a-f0-9]{40,}/gi, (match) => truncateSessionKey(match));
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
      try {
        if (!wallet) {
          throw new Error('Wallet not connected');
        }
        setIsLoading(true);
        setShowClaimButton(false);

        // Get configuration first
        const config = await gameService.getConfig();
        if (!config.contract_name) {
          throw new Error('Contract name not received from server');
        }
        setContractName(config.contract_name);

        // Si nous avons déjà une sessionKey, l'utiliser directement
        const privateKey = gameService.getPrivateKey();
        if (!privateKey) {
          throw new Error('No session key found');
        }
        isInitializedRef.current = true;
        const wallet_blobs = sessionKeyService.useSessionKey(wallet.username, privateKey);
        const gameState = await gameService.initGame(wallet_blobs, wallet.address);
        updateGameState(gameState);
      } catch (err: any) {
        console.error('Error initializing game:', err);
        // Set a default contract name if we couldn't get it from the server
        if (!contractName) {
          setContractName('blackjack');
        }
        // Only set error if we have a session key or if it's a specific error
        if (gameService.getPrivateKey() || err.message?.includes('Insufficient balance')) {
          setError(err.message || 'Failed to initialize game. Please try again.');
          if (err.message?.includes('Insufficient balance')) {
            setShowClaimButton(true);
          }
        }
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

  const copyAddress = async () => {
    if (wallet?.address) {
      try {
        await navigator.clipboard.writeText(wallet.address);
        setCopyMessage('Copied!');
        setTimeout(() => setCopyMessage(null), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      return;
    }
  };

  const handleNewSessionKey = () => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    gameService.clearSession();
    gameService.initialize(wallet?.username, password)
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

  return (
    <>
      <div style={{ position: 'absolute', top: '10px', left: '10px', padding: '20px' }}>
        <HyleWallet providers={['password', 'google', 'github', 'x']}/>
      </div>
      <VisualEffects isWin={showWinEffect} isLose={showLoseEffect} />
      {showBSOD ? (
        <div className="bsod" onClick={handleBSODClick}>
          <div className="bsod-content">
            <div className="bsod-header">
              Windows
            </div>
            <div className="bsod-message">
              An exception 0E has occurred at 0028:C11B0E47 in VxD VMM(01) + 00010E47.
              This was called from 0028:C11B0E47 in VxD VWIN32(01) + 00010E47.<br />
              <br />
              The current application will be terminated.<br />
              <br />
              *  Press any key to terminate the current application<br />
              *  Press CTRL+ALT+DEL again to restart your computer. You will
              lose any unsaved information in all applications.
            </div>
            <div className="bsod-message">
              Error: INSUFFICIENT_HOUSE_EDGE<br />
              <br />
              An error has occurred while trying to take your money.<br />
              <br />
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
              <div className="address-container">
                <span className="counter-label">Address</span>
                <div                  
                  className="led-display"
                  onClick={copyAddress}
                  style={{ cursor: 'pointer' }}
                >
                  {wallet?.address || "Not connected"}
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
              </div>

              {!wallet && !error && (
                <div className="message-overlay">
                  <div className="welcome-message">
                    <h2>Welcome to EZ Casino!</h2>
                    <p>Please connect your wallet to start playing.</p>
                  </div>
                </div>
              )}

              {wallet && !gameService.getPrivateKey() && !error && (
                <div className="message-overlay">
                  <div className="welcome-message">
                    <h2>Welcome to EZ Casino {wallet.username}!</h2>
                    <p>Now that you're connected, create a session key to start playing.</p>
                    <input
                      type="password"
                      placeholder="Enter your wallet password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="win95-input"
                    />
                    <button className="win95-button" onClick={handleNewSessionKey}>
                      Create Session Key
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="message-overlay">
                  <div className="error">
                    <div className="error-title-bar">
                      <div className="error-title-text">Error</div>
                      <div className="error-close-button" onClick={handleErrorClose}>×</div>
                    </div>
                    <div className="error-content">
                      <div className="error-message-container">
                        <img src="/error-icon.png" alt="Error" className="error-icon" />
                        <p className="error-message">
                          {error ? formatErrorMessage(error) : ''}
                          {showClaimButton && (
                            <>
                              <br />
                              Please send funds to your session key, then claim them
                              <br />
                              <a 
                                href={`${import.meta.env.VITE_FAUCET_COOKIE_CLICKER_BASE_URL}/?wallet=${wallet?.address}@${contractName}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="faucet-link"
                              >
                                Get test tokens here
                              </a>
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
                </div>
              )}

              {!error && showStartGame && (
                <div className="controls">
                  <button className="win95-button" onClick={startNewGame} disabled={isLoading}>
                    START GAME
                  </button>
                </div>
              )}
              {!error && !showStartGame && !gameOver && gameState && (
                <div className="controls">
                  <button className="win95-button" onClick={hit} disabled={isLoading}>
                    HIT
                  </button>
                  <button className="win95-button" onClick={stand} disabled={isLoading}>
                    STAND
                  </button>
                  <button className="win95-button" onClick={doubleDown} disabled={isLoading}>
                    DOUBLE
                  </button>
                </div>
              )}
              {!error && !showStartGame && gameOver && (
                <button className="win95-button" onClick={startNewGame} disabled={isLoading}>
                  DEAL
                </button>
              )}
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
