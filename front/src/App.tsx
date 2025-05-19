import { useState, useEffect, useRef } from 'react';
import Game from './components/Game';
import './App.css';
import { WalletProvider } from 'hyli-wallet';
import DesktopShortcut from './components/DesktopShortcut';
import WeatherWidget from './components/WeatherWidget';
import AdManager from './components/AdManager';
import BigRedButton from './components/BigRedButton';
import MsnChat from './components/MsnChat';
import Hyli from './components/Hyli';

function App() {
  // Default to 'day' theme only since we're removing the toggle
  const [backgroundTheme] = useState<'day' | 'night'>('day');
  const [showWeatherWidget, setShowWeatherWidget] = useState(false);
  const [isAdwareActive, setIsAdwareActive] = useState(false);
  const [showBigRedButton, setShowBigRedButton] = useState(false);
  const [showMsnChat, setShowMsnChat] = useState(false);
  const [showHyliExplorer, setShowHyliExplorer] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    visible: boolean;
  }>({
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    visible: false
  });
  const appRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    document.body.className = `${backgroundTheme}-theme`;
  }, [backgroundTheme]);

  // Add event listener for toggle-adware event dispatched from Game component
  useEffect(() => {
    const handleToggleAdware = () => {
      toggleAdware();
    };
    
    const handleToggleMsnChat = () => {
      toggleMsnChat();
    };
    
    window.addEventListener('toggle-adware', handleToggleAdware);
    window.addEventListener('toggle-msn-chat', handleToggleMsnChat);
    
    return () => {
      window.removeEventListener('toggle-adware', handleToggleAdware);
      window.removeEventListener('toggle-msn-chat', handleToggleMsnChat);
    };
  }, []);

  // Add event listener for toggle-hyli-explorer event
  useEffect(() => {
    const handleToggleHyliExplorer = () => {
      toggleHyliExplorer();
    };
    
    window.addEventListener('toggle-hyli-explorer', handleToggleHyliExplorer);
    
    return () => {
      window.removeEventListener('toggle-hyli-explorer', handleToggleHyliExplorer);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start selection if directly clicking on the desktop background
    // Check if the click target is the desktop container itself or the body
    // and not any other UI element
    const isWindow = e.target instanceof HTMLElement && 
      (e.target.closest('.win95-window') || 
       e.target.closest('.ad-popup') ||
       e.target.closest('.big-red-button-window') ||
       e.target.closest('.taskbar') ||
       e.target.closest('.desktop-shortcut') ||
       e.target.classList.contains('flower1') ||
       e.target.classList.contains('flower2') ||
       e.target.classList.contains('flower3') ||
       e.target.classList.contains('flower4') ||
       e.target.classList.contains('flower5') ||
       e.target.classList.contains('flower6') ||
       e.target.classList.contains('flower7') ||
       e.target.classList.contains('flower8') ||
       e.target.classList.contains('flower9') ||
       e.target.classList.contains('flower10'));

    if (!isWindow && e.target === e.currentTarget) {
      isDraggingRef.current = true;
      setSelectionBox({
        startX: e.clientX,
        startY: e.clientY,
        width: 0,
        height: 0,
        visible: true
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current && selectionBox.visible) {
      const width = e.clientX - selectionBox.startX;
      const height = e.clientY - selectionBox.startY;
      
      setSelectionBox(prev => ({
        ...prev,
        width,
        height
      }));
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setSelectionBox(prev => ({
        ...prev,
        visible: false
      }));
    }
  };

  const toggleWeatherWidget = () => {
    setShowWeatherWidget(!showWeatherWidget);
  };

  const toggleAdware = () => {
    setIsAdwareActive(!isAdwareActive);
  };

  const toggleBigRedButton = () => {
    setShowBigRedButton(!showBigRedButton);
  };

  const toggleMsnChat = () => {
    setShowMsnChat(!showMsnChat);
  };

  const toggleHyliExplorer = () => {
    setShowHyliExplorer(!showHyliExplorer);
  };

  return (
    <WalletProvider config={{
        nodeBaseUrl: import.meta.env.VITE_NODE_BASE_URL,
        walletServerBaseUrl: import.meta.env.VITE_WALLET_SERVER_BASE_URL,
        applicationWsUrl: import.meta.env.VITE_WALLET_WS_URL
      }}>
      {/* Removed sun element that toggled the theme */}
      <div className="flower1"></div>
      <div className="flower2"></div>
      <div className="flower3"></div>
      <div className="flower4"></div>
      <div className="flower5"></div>
      <div className="flower6"></div>
      <div className="flower7"></div>
      <div className="flower8"></div>
      <div className="flower9"></div>
      <div className="flower10"></div>
      <div 
        className="desktop-container"
        ref={appRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {selectionBox.visible && (
          <div 
            className="selection-box"
            style={{
              left: selectionBox.width > 0 ? selectionBox.startX : selectionBox.startX + selectionBox.width,
              top: selectionBox.height > 0 ? selectionBox.startY : selectionBox.startY + selectionBox.height,
              width: Math.abs(selectionBox.width),
              height: Math.abs(selectionBox.height)
            }}
          />
        )}

        {/* Weather Desktop Shortcut */}
        <div style={{ position: 'absolute', top: '20px', left: '100px' }}>
          <DesktopShortcut 
            icon="/weather-icon.svg" 
            label="Mars Weather" 
            onClick={toggleWeatherWidget}
            labelStyle={{ color: '#FFFFFF', textShadow: '1px 1px 1px rgba(0,0,0,0.8)' }}
          />
        </div>

        {/* Adware Desktop Shortcut */}
        <div style={{ position: 'absolute', top: '120px', left: '100px' }}>
          <DesktopShortcut 
            icon="/adware-icon.svg" 
            label="Get $1000 FREE" 
            onClick={toggleAdware}
            labelStyle={{ color: '#FFFFFF', textShadow: '1px 1px 1px rgba(0,0,0,0.8)' }}
          />
        </div>

        {/* Big Red Button Desktop Shortcut */}
        <div style={{ position: 'absolute', top: '200px', left: '100px' }}>
          <DesktopShortcut 
            icon="/button.png" 
            label="Big Red Button" 
            onClick={toggleBigRedButton}
            labelStyle={{ color: '#FFFFFF', textShadow: '1px 1px 1px rgba(0,0,0,0.8)' }}
            iconStyle={{ width: '64px', height: '64px' }}
          />
        </div>

        {/* MSN Chat Desktop Shortcut */}
        <div style={{ position: 'absolute', top: '320px', left: '100px' }}>
          <DesktopShortcut 
            icon="/msn-logo.svg" 
            label="MSN Chat" 
            onClick={toggleMsnChat}
            labelStyle={{ color: '#FFFFFF', textShadow: '1px 1px 1px rgba(0,0,0,0.8)' }}
          />
        </div>

        {/* Hyli Explorer Desktop Shortcut */}
        <div style={{ position: 'absolute', top: '420px', left: '100px' }}>
          <DesktopShortcut 
            icon="/hyli.svg" 
            label="Hyli Explorer" 
            onClick={toggleHyliExplorer}
            labelStyle={{ color: '#FFFFFF', textShadow: '1px 1px 1px rgba(0,0,0,0.8)' }}
          />
        </div>

        {/* Weather Widget Window */}
        {showWeatherWidget && (
          <WeatherWidget onClose={() => setShowWeatherWidget(false)} />
        )}

        {/* Big Red Button Window */}
        {showBigRedButton && (
          <BigRedButton onClose={() => setShowBigRedButton(false)} />
        )}

        {/* MSN Chat Window */}
        {showMsnChat && (
          <MsnChat onClose={() => setShowMsnChat(false)} />
        )}

        {/* Hyli Explorer Window */}
        {showHyliExplorer && (
          <Hyli onClose={() => setShowHyliExplorer(false)} />
        )}

        {/* Ad Popups */}
        <AdManager 
          isActive={isAdwareActive} 
          onToggleAdware={toggleAdware} 
        />

        <div className="App">
          <Game theme={backgroundTheme} toggleWeatherWidget={toggleWeatherWidget} />
        </div>
      </div>
    </WalletProvider>
  );
}

export default App;
