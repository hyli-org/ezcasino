import React, { useState, useEffect, useRef } from 'react';
import './AdPopup.css';

// Popup types to choose from
export type AdType = 
  | 'casino-bonus' 
  | 'congratulations' 
  | 'download-now' 
  | 'hot-singles' 
  | 'orange-fields' 
  | 'free-money' 
  | 'mars-storm'
  | 'secret-strategy';

// Constants for popup dimensions
const POPUP_WIDTH = 450;
const POPUP_HEIGHT = 300;

interface AdPopupProps {
  id: string;
  type: AdType;
  initialPosition: { x: number, y: number };
  onClose: (id: string) => void;
  onInteract: () => void;
  zIndex: number;
}

const AdPopup: React.FC<AdPopupProps> = ({ 
  id, 
  type, 
  initialPosition, 
  onClose, 
  onInteract,
  zIndex
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  
  // On mount, add a slight random offset to position to make popups not stack perfectly
  useEffect(() => {
    const randomOffsetX = Math.floor(Math.random() * 200) - 100;
    const randomOffsetY = Math.floor(Math.random() * 200) - 100;
    
    setPosition({
      x: position.x + randomOffsetX,
      y: position.y + randomOffsetY
    });
    
    // Add some "movement" to the popup after it appears
    const timeout = setTimeout(() => {
      const jumpX = Math.floor(Math.random() * 150) - 75;
      const jumpY = Math.floor(Math.random() * 150) - 75;
      
      setPosition(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - POPUP_WIDTH, prev.x + jumpX)),
        y: Math.max(0, Math.min(window.innerHeight - POPUP_HEIGHT, prev.y + jumpY))
      }));
    }, 1000 + Math.random() * 2000);
    
    return () => clearTimeout(timeout);
  }, []);

  // Add window-level event listener effect
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.ad-title-bar')) {
      setIsDragging(true);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      
      // 10% chance to trigger a new popup when dragging starts
      if (Math.random() < 0.1) {
        onInteract();
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Keep popups within viewport
      const maxX = window.innerWidth - (popupRef.current?.offsetWidth || POPUP_WIDTH);
      const maxY = window.innerHeight - (popupRef.current?.offsetHeight || POPUP_HEIGHT);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClose = () => {
    onClose(id);
  };

  const handleAdClick = () => {
    // 50% chance to spawn new popups when clicking the ad content
    if (Math.random() < 0.5) {
      onInteract();
    }
  };

  // Get content based on ad type
  const getAdContent = () => {
    switch (type) {
      case 'casino-bonus':
        return (
          <div className="ad-content casino-bonus">
            <h2>🎰 EXCLUSIVE CASINO BONUS! 🎰</h2>
            <p className="bonus-amount">$1000 FREE</p>
            <p>LIMITED TIME OFFER - MARS RESIDENTS ONLY!</p>
            <button className="ad-button" onClick={handleAdClick}>CLAIM NOW!</button>
            <p className="ad-disclaimer">No deposit required. Terms and conditions apply. Void where prohibited. Not a real offer.</p>
          </div>
        );
      case 'congratulations':
        return (
          <div className="ad-content congratulations">
            <h2>🎉 CONGRATULATIONS! 🎉</h2>
            <p className="blink-text">YOU ARE THE 1,000,000th VISITOR!</p>
            <p>You have been selected to receive a FREE MARTIAN ROVER!</p>
            <button className="ad-button" onClick={handleAdClick}>CLAIM YOUR PRIZE</button>
            <p className="ad-disclaimer">Offer valid for next 5 minutes only. Not affiliated with NASA or SpaceX.</p>
          </div>
        );
      case 'download-now':
        return (
          <div className="ad-content download-now">
            <h2>⚠️ CRITICAL SYSTEM WARNING ⚠️</h2>
            <p className="blink-text">YOUR OXYGEN SYSTEM NEEDS UPDATING!</p>
            <p>Install MarsOxygenator 95 to fix critical issues</p>
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
            <button className="ad-button" onClick={handleAdClick}>DOWNLOAD NOW</button>
            <p className="ad-disclaimer">Not a real system warning. This is definitely not a virus.</p>
          </div>
        );
      case 'hot-singles':
        return (
          <div className="ad-content hot-singles">
            <h2>👽 HOT MARTIANS IN YOUR AREA! 👽</h2>
            <p>They're looking for Earth visitors RIGHT NOW!</p>
            <div className="aliens-grid">
              <div className="alien-profile"></div>
              <div className="alien-profile"></div>
              <div className="alien-profile"></div>
            </div>
            <button className="ad-button" onClick={handleAdClick}>CONNECT NOW</button>
            <p className="ad-disclaimer">Actual Martians may vary from depiction. No real aliens exist in this simulation.</p>
          </div>
        );
      case 'orange-fields':
        return (
          <div className="ad-content orange-fields">
            <h2>MARS AGRICULTURE OPPORTUNITY!</h2>
            <p className="product-name">ORANGE TREE FIELDS</p>
            <p>OWN A PIECE OF MARTIAN FARMLAND TODAY!</p>
            <div className="product-image"></div>
            <p className="price">$99.95 PER ACRE - LIMITED TIME!</p>
            <button className="ad-button" onClick={handleAdClick}>INVEST NOW</button>
            <p className="ad-disclaimer">Trees not guaranteed to grow. Land exists only in Mars simulation. No actual fruit included.</p>
          </div>
        );
      case 'free-money':
        return (
          <div className="ad-content free-money">
            <h2>💰 FREE MARS CREDITS! 💰</h2>
            <p className="blink-text">CASINO GLITCH DISCOVERED!</p>
            <p>Scientists hate this! Exploit this bug before fix!</p>
            <button className="ad-button" onClick={handleAdClick}>GET RICH NOW</button>
            <p className="ad-disclaimer">Not affiliated with any actual casino. This is merely a simulation.</p>
          </div>
        );
      case 'mars-storm':
        return (
          <div className="ad-content mars-storm">
            <h2>⚠️ MARS STORM WARNING! ⚠️</h2>
            <p className="blink-text">DUST STORM APPROACHING YOUR LOCATION</p>
            <p>Protect your assets with STORM SHIELD PRO</p>
            <div className="storm-animation"></div>
            <button className="ad-button" onClick={handleAdClick}>GET INSURANCE</button>
            <p className="ad-disclaimer">Not a real storm warning. Storm Shield Pro is not a real product.</p>
          </div>
        );
      case 'secret-strategy':
        return (
          <div className="ad-content secret-strategy">
            <h2>🤫 SECRET MARS CASINO STRATEGY 🤫</h2>
            <p>WIN EVERY TIME WITH THIS SIMPLE TRICK</p>
            <p className="secret-text">Casino owners HATE this strategy!</p>
            <button className="ad-button" onClick={handleAdClick}>REVEAL SECRET</button>
            <p className="ad-disclaimer">No strategy can guarantee winnings. Gambling should be entertaining, not a way to make money.</p>
          </div>
        );
      default:
        return (
          <div className="ad-content default">
            <h2>SPECIAL OFFER!</h2>
            <p>Click here for amazing deals!</p>
            <button className="ad-button" onClick={handleAdClick}>LEARN MORE</button>
          </div>
        );
    }
  };

  return (
    <div 
      ref={popupRef}
      className={`ad-popup ${type}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: zIndex
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="ad-title-bar">
        <span>SPECIAL OFFER - ACT NOW!!!</span>
        <div className="ad-controls">
          <button className="ad-close" onClick={handleClose}>×</button>
        </div>
      </div>
      {getAdContent()}
    </div>
  );
};

export default AdPopup; 