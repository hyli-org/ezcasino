import React, { useState, useEffect } from 'react';
import Card from './Card';
import VisualEffects from './VisualEffects';
import Cow from '../components/Cow';
import { gameService } from '../services/gameService';
import { GameState, TokenBalances, GameResponse } from '../types/game';
import { HyliWallet, useWallet } from 'hyli-wallet';
import '../styles/Game.css';
import { WindowsLoader } from './WindowsLoader';
import BigRedButton from './BigRedButton';
import Hyli from './Hyli';
import TransactionNotification, { Notification } from './TransactionNotification';

const funnyLoadingMessages = [
  "Shuffling the virtual deck...",
  "Dealing you in...",
  "Polishing the casino chips...",
  "Checking the dealer's sleeves for aces...",
  "Calculating odds (they're in your favor, maybe)...",
  "Inflating the virtual tires on the money truck...",
  "Teaching the dealer to count (past 21)...",
  "Finding a dealer who doesn't look like a Bond villain...",
  "Placing your bets (don't worry, it's only virtual money... for now)...",
  "Waiting for the pit boss's approval...",
  "Warming up the random number generator...",
  "Don't hit on 17... unless the dealer is a psychic...",
  "Dusting off the high roller suite..."
];

type Suit = '♠' | '♣' | '♥' | '♦';
type CardType = {
  suit: Suit;
  value: string;
};

interface GameProps {
  theme: 'day' | 'night';
  toggleWeatherWidget?: () => void;
}

const Game: React.FC<GameProps> = ({ theme, toggleWeatherWidget }) => {
  const { wallet, logout, registerSessionKey, createIdentityBlobs, cleanExpiredSessionKey } = useWallet();
  const [playerHand, setPlayerHand] = useState<CardType[]>([]);
  const [dealerHand, setDealerHand] = useState<CardType[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [showStartGame, setShowStartGame] = useState(true);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showLoseEffect, setShowLoseEffect] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalances | null>(null);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showDepositButton, setShowDepositButton] = useState(false);
  const [showBSOD, setShowBSOD] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [showShutdown, setShowShutdown] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('password123');
  const [currentFunnyMessage, setCurrentFunnyMessage] = useState("");
  const [showBigRedButton, setShowBigRedButton] = useState(false);
  const [showHyliExplorer, setShowHyliExplorer] = useState(false);
  const [showAuthLoader, setShowAuthLoader] = useState(false);
  const [selectedBet, setSelectedBet] = useState(10);
  const [selectedDeposit, setSelectedDeposit] = useState(10);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [selectedWithdraw, setSelectedWithdraw] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);


  // Surveiller les changements de wallet pour détecter la déconnexion
  useEffect(() => {
    console.log('Wallet object changed:', wallet);
    if (wallet && cleanExpiredSessionKey) {
      cleanExpiredSessionKey();
    }
  }, [wallet, cleanExpiredSessionKey]);

  // Charge user balance and update GameState, and check for existing game
  const loadUserBalanceAndCheckExistingGame = async () => {
    if (!wallet?.address) return;

    try {
      // First, check if there's an ongoing game
      const existingGameState = await gameService.getCurrentGameState(wallet.address);

      if (existingGameState) {
        // Resume existing game
        console.log('Found existing game, resuming...', existingGameState);
        updateGameState(existingGameState);
        setShowStartGame(false);
      } else {
        // No existing game, just load balance for new game
        const realBalance = await gameService.getBalance(wallet.address);
        setGameState({
          bank: [],
          bank_count: 0,
          user: [],
          user_count: 0,
          bet: 10,
          state: 'Ongoing',
          balance: realBalance
        });
        setShowStartGame(true);
      }
      
      // Load token balances immediately instead of with delay
      await loadTokenBalances();
    } catch (err) {
      console.error('Error loading user balance or checking existing game:', err);
      // Fallback to just loading balance
      try {
        const realBalance = await gameService.getBalance(wallet.address);
        setGameState({
          bank: [],
          bank_count: 0,
          user: [],
          user_count: 0,
          bet: 10,
          state: 'Ongoing',
          balance: realBalance
        });
        setShowStartGame(true);
        // Load token balances even in fallback
        await loadTokenBalances();
      } catch (balanceErr) {
        console.error('Error loading user balance:', balanceErr);
      }
    }
  };

  // Load balance and check for existing game on wallet connection
  useEffect(() => {
    if (wallet?.address) {
      loadUserBalanceAndCheckExistingGame();
    }
  }, [wallet?.address]); // Reload when wallet changes

  // Load token balances immédiatement
  useEffect(() => {
    if (wallet?.address && !tokenBalances) {
      loadTokenBalances();
    }
  }, [wallet?.address, tokenBalances]);

  const loadTokenBalances = async () => {
    if (!wallet?.address) return;

    try {
      const balances = await gameService.getTokenBalances(wallet.address);
      console.log('Token balances:', balances);
      setTokenBalances(balances);
      // Mettre à jour aussi le gameState avec la balance déposée
      setGameState(prevState => prevState ? {
        ...prevState,
        balance: balances.oranjDeposited
      } : null);
    } catch (err) {
      console.error('Error loading token balances:', err);
    }
  };

  // Fonction consolidée pour charger toutes les balances en une fois
  const loadAllBalances = async () => {
    if (!wallet?.address) return;

    try {
      const balances = await gameService.getTokenBalances(wallet.address);
      console.log('Token balances:', balances);
      setTokenBalances(balances);
      // Mettre à jour le gameState avec la balance déposée (évite l'appel double à getBalance)
      setGameState(prevState => prevState ? {
        ...prevState,
        balance: balances.oranjDeposited
      } : null);
    } catch (err) {
      console.error('Error loading all balances:', err);
    }
  };

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

  const addNotification = (txHash: string) => {
    const newNotification: Notification = {
      id: `${Date.now()}-${Math.random()}`,
      tx_hash: txHash,
      timestamp: Date.now(),
    };

    setNotifications(prev => [...prev, newNotification]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleGameResponse = (response: GameResponse, isDepositing: boolean = false) => {
    addNotification(response.tx_hash);
    updateGameState(response.table, isDepositing);
  };

  const updateGameState = (newGameState: GameState, isDepositing: boolean = false) => {
    const playerCards = newGameState.user.map(convertToCard);
    const dealerCards = newGameState.bank.map(convertToCard);

    setPlayerHand(playerCards);
    setDealerHand(dealerCards);
    setSelectedBet(newGameState.bet);
    setGameOver(newGameState.state !== 'Ongoing');

    // Préserver la balance réelle si elle existe déjà dans gameState
    setGameState(prevState => ({
      ...newGameState,
      balance: prevState?.balance ?? newGameState.balance
    }));

    // Ne pas déclencher les effets visuels lors d'un deposit
    if (!isDepositing) {
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
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found. Please create one via the game menu.');
      }
      // Validate selectedBet
      if (selectedBet < 10) {
        setError("Minimum bet is 10.");
        return;
      }

      setIsLoading(true);
      setError(null);
      setShowDepositButton(false);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.initGame(wallet_blobs, wallet.address, selectedBet);
      handleGameResponse(gameStateResult);
      setShowStartGame(false);
      setError(null);
      setTimeout(() => loadAllBalances(), 100);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to initialize game. Please try again.';
      setError(errorMessage);
      if (errorMessage.includes('Insufficient balance')) {
        setShowDepositButton(true);
        // Set default deposit amount to the selected bet
        setSelectedDeposit(selectedBet);
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
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.hit(wallet_blobs, wallet.address);
      handleGameResponse(gameStateResult);
      setTimeout(() => loadAllBalances(), 2000);
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
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.stand(wallet_blobs, wallet.address);
      handleGameResponse(gameStateResult);
      setTimeout(() => loadAllBalances(), 1000);
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
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found');
      }
      setIsLoading(true);
      setError(null);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.doubleDown(wallet_blobs, wallet.address);
      handleGameResponse(gameStateResult);
      setTimeout(() => loadAllBalances(), 1000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to double down. Please try again.';
      setError(errorMessage);
      console.error('Error doubling down:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    try {
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found');
      }
      
      // Validate deposit amount
      if (selectedDeposit < 1) {
        setError('Deposit amount must be at least $1');
        return;
      }
      if (selectedDeposit > 10000) {
        setError('Deposit amount cannot exceed $10,000');
        return;
      }
      
      setIsLoading(true);
      setIsDepositing(true);
      setError(null);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.deposit(wallet_blobs, wallet.address, selectedDeposit);
      handleGameResponse(gameStateResult, true);
      
      // Wait a moment to show success before closing modal
      setTimeout(() => {
        setShowDepositButton(false);
        setIsDepositing(false);
      }, 1500);
      
      setGameOver(true);
      setTimeout(() => loadAllBalances(), 2000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to deposit. Please try again.';
      setError(errorMessage);
      setIsDepositing(false);
      console.error('Error depositing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    // Open the withdraw dialog instead of directly withdrawing
    const maxAmount = tokenBalances?.oranjDeposited || 0;
    setSelectedWithdraw(maxAmount); // Set default amount to full deposited amount
    setShowWithdrawDialog(true);
  };

  const performWithdraw = async () => {
    try {
      if (!wallet) {
        throw new Error('Wallet not connected');
      }
      if (!wallet.sessionKey?.privateKey) {
        throw new Error('No session key found');
      }
      
      const maxAmount = tokenBalances?.oranjDeposited || 0;
      
      // Validate withdraw amount
      if (selectedWithdraw < 1) {
        setError('Withdraw amount must be at least $1');
        return;
      }
      if (selectedWithdraw > maxAmount) {
        setError(`Withdraw amount cannot exceed your deposited balance of $${maxAmount}`);
        return;
      }
      
      setIsLoading(true);
      setIsWithdrawing(true);
      setError(null);
      const wallet_blobs = createIdentityBlobs();
      const gameStateResult = await gameService.withdraw(wallet_blobs, wallet.address, selectedWithdraw);
      handleGameResponse(gameStateResult, true);
      
      // Wait a moment to show success before closing modal
      setTimeout(() => {
        setShowWithdrawDialog(false);
        setIsWithdrawing(false);
      }, 1500);
      
      setTimeout(() => loadAllBalances(), 2000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to withdraw. Please try again.';
      setError(errorMessage);
      setIsWithdrawing(false);
      console.error('Error withdrawing:', err);
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

      // Sur mobile (768px et moins), ne pas centrer car la fenêtre occupe tout l'écran
      if (windowWidth <= 768) {
        setWindowPosition({ x: 0, y: 0 });
        return;
      }

      // Attendre que le DOM soit rendu pour obtenir les vraies dimensions
      setTimeout(() => {
        const gameWindow = document.querySelector('.win95-window') as HTMLElement;
        if (gameWindow) {
          const rect = gameWindow.getBoundingClientRect();
          const gameWidth = rect.width || 500;
          const gameHeight = rect.height || 600;

          // Centrer en tenant compte des vraies dimensions
          const x = Math.max(0, (windowWidth - gameWidth) / 2);
          const y = Math.max(0, (windowHeight - gameHeight) / 2);

          setWindowPosition({ x, y });
        } else {
          // Fallback avec dimensions estimées (correspond au CSS)
          const gameWidth = 500;
          const gameHeight = 600;
          setWindowPosition({
            x: Math.max(0, (windowWidth - gameWidth) / 2),
            y: Math.max(0, (windowHeight - gameHeight) / 2)
          });
        }
      }, 50); // Petit délai pour s'assurer que le DOM est rendu
    };

    centerWindow();
    window.addEventListener('resize', centerWindow);

    return () => {
      window.removeEventListener('resize', centerWindow);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Désactiver le drag sur mobile et tablette
    if (window.innerWidth <= 768) {
      return;
    }
    
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

  const handleNewSessionKey = async () => {
    if (!wallet || !registerSessionKey) {
      setError("Wallet not connected or session key registration unavailable.");
      return;
    }
    try {
      setShowAuthLoader(true);
      setIsLoading(true);
      setError(null);

      const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      const whitelist = ["blackjack", "oranj"]; // Example whitelist

      await registerSessionKey(password, expiration, whitelist);

      setShowAuthLoader(false);

      await startNewGame();
      setShowGameMenu(false);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create new session key.';
      setError(formatErrorMessage(errorMessage));
      setShowAuthLoader(false);
      console.error('Error creating new session key:', err);
    } finally {
      setIsLoading(false);
      setShowAuthLoader(false);
    }
  };

  const handleDisconnect = () => {
    logout();
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
      case 'weather':
        if (toggleWeatherWidget) {
          toggleWeatherWidget();
        }
        break;
      case 'adware':
        // Toggle adware feature
        window.dispatchEvent(new CustomEvent('toggle-adware'));
        break;
      case 'oranj-tokens':
        setShowBigRedButton(true);
        break;
      case 'hyli-explorer':
        setShowHyliExplorer(true);
        break;
      case 'msn-chat':
        // Toggle MSN Chat
        window.dispatchEvent(new CustomEvent('toggle-msn-chat'));
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

  const renderCustomWalletButton = ({ onClick }: { onClick: () => void }) => (
    <button className="win95-button" onClick={onClick} style={{ padding: '10px 20px', fontSize: '1rem' }}>
      {wallet ? "Log Out from Custom" : "Login or Signup"}
    </button>
  );

  // Composant réutilisable pour la section de dépôt
  const DepositSection: React.FC<{
    title: string;
    showFaucetLink?: boolean;
    faucetLinkHandler?: () => void;
    className?: string;
  }> = ({ title, showFaucetLink = true, faucetLinkHandler, className = "deposit-section" }) => (
    <div className={className}>
      <div className="counter-label">{title}</div>
      <div className="bet-buttons">
        {[10, 25, 50, 100, 250].map(amount => (
          <button
            key={amount}
            className={`win95-button bet-button ${selectedDeposit === amount ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedDeposit(amount);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              pointerEvents: 'auto',
              zIndex: 20,
              position: 'relative'
            }}
          >
            ${amount}
          </button>
        ))}
      </div>
      <div className="selected-deposit-display">
        <span>Deposit Amount: $</span>
        <input
          type="number"
          min="1"
          max="10000"
          value={selectedDeposit || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setSelectedDeposit(value);
          }}
          className="led-display-input"
          placeholder="10"
        />
      </div>
      <button 
        className="deposit-button" 
        onClick={handleDeposit} 
        disabled={isLoading || isDepositing || selectedDeposit < 1 || selectedDeposit > 10000}
        style={{ marginTop: '10px', padding: '10px 20px' }}
      >
        {isDepositing ? 'DEPOSITING...' : `DEPOSIT $${selectedDeposit || 0}`}
      </button>
      {isDepositing && (
        <div style={{ marginTop: '10px', textAlign: 'center' }}>
          <div className="loading-bar">
            <div className="loading-progress"></div>
          </div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#008000' }}>
            Processing deposit transaction...
          </div>
        </div>
      )}
      {showFaucetLink && (
        <div style={{ marginTop: '10px', textAlign: 'center' }}>
          <a
            href={import.meta.env.VITE_FAUCET_URL}
            onClick={(e) => {
              e.preventDefault();
              if (faucetLinkHandler) {
                faucetLinkHandler();
              } else {
                window.open(import.meta.env.VITE_FAUCET_URL, '_blank');
              }
            }}
            className="faucet-link"
            style={{ fontSize: '12px', color: '#0000ff', textDecoration: 'underline' }}
          >
            Need $ORANJ tokens? Get them here!
          </a>
        </div>
      )}
    </div>
  );


  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined = undefined;

    if (showAuthLoader) {
      // Set initial message
      const randomIndex = Math.floor(Math.random() * funnyLoadingMessages.length);
      setCurrentFunnyMessage(funnyLoadingMessages[randomIndex]);

      // Start interval to rotate messages
      intervalId = setInterval(() => {
        const newRandomIndex = Math.floor(Math.random() * funnyLoadingMessages.length);
        setCurrentFunnyMessage(funnyLoadingMessages[newRandomIndex]);
      }, 2500); // Change message every 2.5 seconds
    } else {
      if (intervalId) {
        clearInterval(intervalId);
      }
    }

    // Cleanup function to clear interval on component unmount or when showAuthLoader becomes false
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [showAuthLoader]); // Re-run effect when showAuthLoader changes

  let loaderMessage = "";
  if (showAuthLoader) {
    loaderMessage = currentFunnyMessage;
  }

  return (
    <div className={`game-root ${theme}-theme`}>
      {showAuthLoader && <WindowsLoader message={loaderMessage} />}
      <VisualEffects isWin={showWinEffect} isLose={showLoseEffect} />
      {showBigRedButton && <BigRedButton onClose={() => setShowBigRedButton(false)} />}
      {showHyliExplorer && <Hyli onClose={() => setShowHyliExplorer(false)} />}
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
              <span>Ezcasino</span>
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
                    {wallet && (
                      <div className="menu-option" onClick={handleDisconnect}>
                        Disconnect
                      </div>
                    )}
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
                  style={{ cursor: 'pointer', position: 'relative' }}
                >
                  {wallet?.address || "Not connected"}
                  {copyMessage && <span className="copy-message">{copyMessage}</span>}
                </div>
              </div>
              <div className="counters">
                <div className="counter" onClick={loadTokenBalances} style={{ cursor: 'pointer' }} title="Click to refresh">
                  <span className="counter-label">$ORANJ Balance</span>
                  <div className="led-display">${tokenBalances?.oranjBalance || 0}</div>
                </div>
                <div className="counter" onClick={loadTokenBalances} style={{ cursor: 'pointer' }} title="Click to refresh">
                  <span className="counter-label">$ORANJ Deposited</span>
                  <div className="led-display">${tokenBalances?.oranjDeposited || 0}</div>
                </div>
                <div className="counter" onClick={loadTokenBalances} style={{ cursor: 'pointer' }} title="Click to refresh">
                  <span className="counter-label">$VIT Balance</span>
                  <div className="led-display">${tokenBalances?.vitBalance || 0}</div>
                </div>
              </div>

              {wallet && wallet.sessionKey && (showStartGame || (!showStartGame && gameOver)) && (
                <>
                  {/* Si l'utilisateur n'a pas de tokens déposés, afficher la section de dépôt */}
                  {(!tokenBalances?.oranjDeposited || tokenBalances.oranjDeposited === 0) ? (
                    <DepositSection 
                      title="First, deposit some $ORANJ to start playing"
                      className="deposit-initial-section"
                    />
                  ) : (
                    // Si l'utilisateur a des tokens déposés, afficher la section de pari
                    <div className="betting-section">
                      <span className="counter-label">Choose Your Bet</span>
                      <div className="bet-buttons">
                        {[10, 25, 50, 100, 250].map(amount => {
                          return (
                            <button
                              key={amount}
                              className={`win95-button bet-button ${selectedBet === amount ? 'active' : ''}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedBet(amount);
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              style={{
                                pointerEvents: 'auto',
                                zIndex: 20,
                                position: 'relative'
                              }}
                            >
                              ${amount}
                            </button>
                          );
                        })}
                      </div>
                      <div className="selected-bet-display">
                        <span>Selected: $</span>
                        <input
                          type="number"
                          min="10"
                          max="10000"
                          value={selectedBet || ''}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setSelectedBet(value);
                          }}
                          className="led-display-input"
                          placeholder="10"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className={`play-area ${gameOver || (gameState && gameState.state !== 'Ongoing') ? 'game-over' : ''}`}>
                {gameOver && gameState && gameState.state !== 'Ongoing' && (
                  <div className="game-status">
                    {gameState.state === 'Won' ? '🎉 YOU WIN!' : gameState.state === 'Lost' ? '💸 HOUSE WINS' : 'GAME OVER'}
                  </div>
                )}
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

              {!wallet && !error && !showAuthLoader && (
                <div className="message-overlay">
                  <div className="welcome-message">
                    <h2>Welcome to EZ Casino!</h2>
                    <p>Please connect your wallet to start playing.</p>
                    <div style={{ marginTop: '20px' }}>
                      <HyliWallet
                        providers={['password', 'google', 'github', 'x']}
                        button={renderCustomWalletButton}
                      />
                    </div>
                  </div>
                </div>
              )}

              {wallet && !wallet.sessionKey && !error && !showAuthLoader && (
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

              {error && !showAuthLoader && (
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
                          {showDepositButton && (
                            <>
                              <br />
                              Please send funds to your account, then deposit them here
                              <br />
                              <a
                                href="#"
                                onClick={() => setShowBigRedButton(true)}
                                className="faucet-link"
                              >
                                Earn Oranj tokens here
                              </a>
                            </>
                          )}
                    </p>
                  </div>
                  {showDepositButton && (
                    <DepositSection 
                      title="Choose Deposit Amount"
                      showFaucetLink={false}
                    />
                  )}
                      {error && error.includes("finished game") && (
                        <button className="win95-button" onClick={startNewGame} disabled={isLoading}>
                          NEW GAME
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {showWithdrawDialog && (
                <div className="message-overlay">
                  <div className="error">
                    <div className="error-title-bar">
                      <div className="error-title-text">Withdraw $ORANJ</div>
                      <div className="error-close-button" onClick={() => setShowWithdrawDialog(false)}>×</div>
                    </div>
                    <div className="error-content">
                      <div className="error-message-container">
                        <p className="error-message">
                          Choose how much $ORANJ you want to withdraw from your deposited balance.
                          <br />
                          You currently have ${tokenBalances?.oranjDeposited || 0} $ORANJ deposited.
                        </p>
                      </div>
                      <div className="deposit-section">
                        <div className="counter-label">Choose Withdraw Amount (Available: ${tokenBalances?.oranjDeposited || 0})</div>
                        <div className="selected-deposit-display">
                          <span>Withdraw Amount: $</span>
                          <input
                            type="number"
                            min="1"
                            max={tokenBalances?.oranjDeposited || 0}
                            value={selectedWithdraw || tokenBalances?.oranjDeposited || 0}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              setSelectedWithdraw(value);
                            }}
                            className="led-display-input"
                            placeholder="10"
                          />
                        </div>
                        {isWithdrawing && (
                          <div style={{ marginTop: '10px', textAlign: 'center' }}>
                            <div className="loading-bar">
                              <div className="loading-progress"></div>
                            </div>
                            <div style={{ fontSize: '12px', marginTop: '5px', color: '#008000' }}>
                              Processing withdrawal transaction...
                            </div>
                          </div>
                        )}
                        <div className="button-row" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                          <button 
                            className="deposit-button" 
                            onClick={performWithdraw} 
                            disabled={isLoading || isWithdrawing || selectedWithdraw < 1 || selectedWithdraw > (tokenBalances?.oranjDeposited || 0)}
                            style={{ padding: '10px 20px', flex: 1 }}
                          >
                            {isWithdrawing ? 'WITHDRAWING...' : `WITHDRAW $${selectedWithdraw || 0}`}
                          </button>
                          <button 
                            className="win95-button" 
                            onClick={() => setShowWithdrawDialog(false)}
                            style={{ padding: '10px 20px' }}
                            disabled={isWithdrawing}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {wallet && wallet.sessionKey && showStartGame && (tokenBalances?.oranjDeposited || 0) > 0 && (
                <div className="controls">
                  <button className="win95-button" onClick={startNewGame} disabled={isLoading}>
                    START GAME (${selectedBet})
                  </button>
                  {gameState && gameState.balance > 0 && (
                    <button className="win95-button" onClick={handleWithdraw} disabled={isLoading}>
                      WITHDRAW
                    </button>
                  )}
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
                <div className="controls">
                  <button className="win95-button" onClick={startNewGame} disabled={isLoading}>
                    DEAL (${selectedBet})
                  </button>
                  {gameState && gameState.balance > 0 && (
                    <button className="win95-button" onClick={handleWithdraw} disabled={isLoading}>
                      WITHDRAW
                    </button>
                  )}
                </div>
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
              Ezcasino
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
                  Ezcasino
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('weather')}>
                  <img src="/weather-icon.svg" alt="Weather" />
                  Mars Weather
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('adware')}>
                  <img src="/adware-icon.svg" alt="Adware" />
                  Get $1000 FREE
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('oranj-tokens')}>
                  <img src="/button.png" alt="Big Red Button" />
                  Big Red Button
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('hyli-explorer')}>
                  <img src="/hyli.svg" alt="Hyli Explorer" />
                  Hyli Explorer
                </div>
                <div className="start-menu-item" onClick={() => handleStartMenuItemClick('msn-chat')}>
                  <img src="/msn-logo.svg" alt="MSN Chat" />
                  MSN Messenger
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
      <TransactionNotification 
        notifications={notifications}
        onRemoveNotification={removeNotification}
      />
    </div>
  );
};

export default Game;
