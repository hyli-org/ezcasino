import React, { useState, useEffect, useRef } from 'react';
import './BigRedButton.css';
import { useWallet } from 'hyli-wallet';
import { blob_click } from '../../types/faucet';
import { nodeService } from '../../services/nodeService';
import { BlobTransaction, blob_builder } from 'hyli';

interface BigRedButtonProps {
  onClose: () => void;
}

interface OrangePop {
  id: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  scale: number;
}

const BigRedButton: React.FC<BigRedButtonProps> = ({ onClose }) => {
  const { wallet } = useWallet();
  const [position, setPosition] = useState(() => {
    // Position on the right side of the screen by default
    return {
      x: Math.max(window.innerWidth - 450, 0),
      y: 100
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPressed, setIsPressed] = useState(false);
  const [pressCount, setPressCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [orangePops, setOrangePops] = useState<OrangePop[]>([]);
  const [transitionDuration, setTransitionDuration] = useState(0.3);
  const buttonRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);
  
  // Add window-level event listeners for dragging
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

  // Clean up orange pops after animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (orangePops.length > 0) {
        setOrangePops(current => current.slice(Math.min(5, current.length)));
      }
    }, 700);
    
    return () => clearTimeout(timer);
  }, [orangePops]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Désactiver le drag sur mobile et tablette
    if (window.innerWidth <= 768) {
      return;
    }
    
    if (e.target instanceof HTMLElement && e.target.closest('.win95-title-bar')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Keep window within viewport
      const maxX = window.innerWidth - 400; // Approx window width
      const maxY = window.innerHeight - 400; // Approx window height
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const createOrangePops = () => {
    if (!buttonRef.current) return;
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const centerX = buttonRect.width / 2;
    const centerY = buttonRect.height / 2;
    
    // Create multiple oranges
    const orangeCount = 2 + Math.floor(Math.random() * 4); // 2-5 oranges
    const newOranges: OrangePop[] = [];
    
    for (let i = 0; i < orangeCount; i++) {
      // Random position near center, adjusted for larger oranges
      const startOffsetX = -15 + Math.random() * 30;
      const startOffsetY = -15 + Math.random() * 30;
      
      // Random velocity (direction and speed)
      const velocityX = -7 + Math.random() * 14;
      const velocityY = -10 - Math.random() * 5; // Mostly upward
      
      const newOrange: OrangePop = {
        id: nextIdRef.current++,
        x: centerX + startOffsetX,
        y: centerY + startOffsetY,
        velocityX,
        velocityY,
        rotation: Math.random() * 360,
        scale: 0.25 + Math.random() * 0.4
      };
      
      newOranges.push(newOrange);
    }
    
    setOrangePops(current => [...current, ...newOranges]);
  };

  const handleButtonPress = async () => {
    setIsPressed(true);
    setPressCount(prevCount => prevCount + 1);
    
    // Move window to random position
    const windowElement = buttonRef.current?.closest('.win95-window');
    const windowWidth = windowElement?.offsetWidth || 450;
    const windowHeight = windowElement?.offsetHeight || 500;
    const maxX = window.innerWidth - windowWidth;
    const maxY = window.innerHeight - windowHeight;
    
    const randomX = Math.random() * maxX;
    const randomY = Math.random() * maxY;
    
    // Calculate distance for smooth animation
    const distance = Math.sqrt(
      Math.pow(randomX - position.x, 2) + 
      Math.pow(randomY - position.y, 2)
    );
    
    // Scale duration based on distance (min 0.2s, max 0.6s)
    const duration = Math.min(0.6, Math.max(0.2, distance / 1500));
    setTransitionDuration(duration);
    
    // Use requestAnimationFrame to ensure transition is applied before position change
    requestAnimationFrame(() => {
      setPosition({
        x: Math.max(0, randomX),
        y: Math.max(0, randomY)
      });
    });
    
    // Send blob tx
    if (wallet?.address) {
    const blobTransfer = blob_builder.smt_token.transfer("faucet", wallet.address, "oranj", BigInt(1), 1);
        
    const blobClick = blob_click(0);
    const identity = `${wallet.address}@${blobClick.contract_name}`;
    const blobTx: BlobTransaction = {
      identity: identity,
      blobs: [blobTransfer, blobClick],
    }
    const txHash = await nodeService.sendBlobTx(blobTx);
    console.log("Tx hash:", txHash);
    }

    // Create orange pops
    createOrangePops();
    
    // You can add sound effects or other actions here
    try {
      const buttonSound = new Audio('/sounds/button.wav');
      buttonSound.volume = 0.5;
      buttonSound.play();
    } catch (error) {
      console.log('Sound could not be played');
    }
    
    setTimeout(() => {
      setIsPressed(false);
    }, 80);
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
    }
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  return (
    <div 
      className="win95-window"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'none',
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : `left ${transitionDuration}s cubic-bezier(0.68, -0.55, 0.265, 1.55), top ${transitionDuration}s cubic-bezier(0.68, -0.55, 0.265, 1.55)`
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="win95-title-bar">
        <span>Big Red Button - Pressed {pressCount} times</span>
        <div className="window-controls">
          <button className="minimize">-</button>
          <button className="maximize">□</button>
          <button className="close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="menu-bar">
        <div 
          className="menu-item"
          onClick={toggleMenu}
          style={{ position: 'relative' }}
        >
          Options
          {showMenu && (
            <div className="menu-dropdown">
              <div className="menu-option" onClick={handleButtonPress}>
                Press Button
              </div>
              <div className="menu-option" onClick={copyAddress}>
                Copy Address
              </div>
              <div className="menu-option" onClick={onClose}>
                Close
              </div>
            </div>
          )}
        </div>
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
            {wallet?.address || "Unknown"}
            {copyMessage && <span className="copy-message">{copyMessage}</span>}
          </div>
        </div>
        
        <div className="counters">
          <div className="counter">
            <span className="counter-label">Presses</span>
            <div className="led-display">{pressCount}</div>
          </div>
        </div>

        <div className="button-area">
          <div 
            className={`red-button ${isPressed ? 'pressed' : ''}`}
            onClick={handleButtonPress}
            ref={buttonRef}
          >
            {/* Orange pops */}
            {orangePops.map(orange => (
              <div
                key={orange.id}
                className="orange-pop"
                style={{
                  left: `${orange.x}px`,
                  top: `${orange.y}px`,
                  transform: `rotate(${orange.rotation}deg) scale(${orange.scale})`,
                  '--random-x': `${orange.velocityX * 12}px`,
                  '--random-y': `${orange.velocityY * 12}px`,
                  '--random-rotation': `${orange.rotation + (Math.random() > 0.5 ? 180 : -180)}deg`,
                } as React.CSSProperties}
              >
                <img src="/orange.svg" alt="Orange" />
              </div>
            ))}
            
            <img 
              src={isPressed ? "/button-pressed.png" : "/button.png"} 
              alt="Big Red Button" 
              className="button-image"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BigRedButton; 