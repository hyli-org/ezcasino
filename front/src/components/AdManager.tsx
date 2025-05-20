import React, { useState, useEffect } from 'react';
import AdPopup, { AdType } from './AdPopup';
import { v4 as uuidv4 } from 'uuid';

// Define a maximum number of concurrent popups
const MAX_POPUPS = 15;

// Higher base z-index to ensure popups appear above game windows
const BASE_Z_INDEX = 10000;

// All possible ad types
const AD_TYPES: AdType[] = [
  'casino-bonus',
  'congratulations',
  'download-now',
  'hot-singles',
  'orange-fields',
  'free-money',
  'mars-storm',
  'secret-strategy'
];

interface AdManagerProps {
  isActive: boolean;
  onToggleAdware: () => void;
}

interface AdPopupState {
  id: string;
  type: AdType;
  position: { x: number, y: number };
  zIndex: number;
}

const AdManager: React.FC<AdManagerProps> = ({ isActive, onToggleAdware }) => {
  const [popups, setPopups] = useState<AdPopupState[]>([]);
  const [nextZIndex, setNextZIndex] = useState(BASE_Z_INDEX);
  const [isSpawning, setIsSpawning] = useState(false);
  
  // Initialize with initial popups when activated
  useEffect(() => {
    if (isActive && popups.length === 0 && !isSpawning) {
      // Start with 2-3 popups, but open them sequentially
      const initialCount = Math.floor(Math.random() * 2) + 2;
      setIsSpawning(true);
      
      // Open the first popup immediately
      spawnNewPopup();
      
      // Then open the rest with delays
      let currentDelay = 800;
      for (let i = 1; i < initialCount; i++) {
        setTimeout(() => {
          spawnNewPopup();
          if (i === initialCount - 1) {
            setIsSpawning(false);
          }
        }, currentDelay);
        currentDelay += 800; // Add delay between each popup
      }
      
      // Set interval to occasionally spawn new popups
      const interval = setInterval(() => {
        if (Math.random() < 0.3 && popups.length < MAX_POPUPS && !isSpawning) {
          spawnNewPopup();
        }
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [isActive, popups.length, isSpawning]);
  
  // Reset state when deactivated
  useEffect(() => {
    if (!isActive) {
      setPopups([]);
      setNextZIndex(BASE_Z_INDEX);
    }
  }, [isActive]);
  
  // Get a random position within the viewport, centered more on game area
  const getRandomPosition = () => {
    // Get window dimensions
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Generate completely random position across the entire screen
    const randomX = Math.floor(Math.random() * (windowWidth - 470));
    const randomY = Math.floor(Math.random() * (windowHeight - 320));
    
    return {
      x: randomX,
      y: randomY
    };
  };
  
  // Get a random ad type
  const getRandomAdType = (): AdType => {
    return AD_TYPES[Math.floor(Math.random() * AD_TYPES.length)];
  };
  
  // Create a new popup
  const spawnNewPopup = () => {
    if (popups.length >= MAX_POPUPS) return;
    
    const newPopup = {
      id: uuidv4(),
      type: getRandomAdType(),
      position: getRandomPosition(),
      zIndex: nextZIndex
    };
    
    setNextZIndex(prev => prev + 10); // Larger z-index increment to ensure stacking
    setPopups(prev => [...prev, newPopup]);
    
    // Play annoying sound
    try {
      const popupSound = new Audio('/sounds/popup.mp3');
      popupSound.volume = 0.3;
      popupSound.play();
    } catch (error) {
      console.log('Sound could not be played');
    }
  };
  
  // Create multiple popups sequentially
  const spawnMultiplePopups = (count: number) => {
    if (count <= 0 || isSpawning) return;
    
    setIsSpawning(true);
    
    // Open first popup immediately
    spawnNewPopup();
    
    // Queue the rest with delays
    const popupQueue: NodeJS.Timeout[] = [];
    let currentDelay = 800;
    
    for (let i = 1; i < count; i++) {
      if (popups.length + i >= MAX_POPUPS) break;
      
      const timeout = setTimeout(() => {
        spawnNewPopup();
        
        // Clean up the queue
        const index = popupQueue.indexOf(timeout);
        if (index > -1) {
          popupQueue.splice(index, 1);
        }
        
        // When all timeouts complete, reset isSpawning
        if (popupQueue.length === 0) {
          setIsSpawning(false);
        }
      }, currentDelay);
      
      popupQueue.push(timeout);
      currentDelay += 800; // Add delay between each popup
    }
    
    // Set up cleanup for component unmount
    return () => {
      popupQueue.forEach(timeout => clearTimeout(timeout));
      setIsSpawning(false);
    };
  };
  
  // Close a popup by id
  const handleClosePopup = (id: string) => {
    setPopups(prev => prev.filter(popup => popup.id !== id));
    
    // 15% chance to launch a "Please don't close me" popup
    if (Math.random() < 0.15 && !isSpawning) {
      setTimeout(() => {
        const pleaseStayTypes: AdType[] = ['casino-bonus', 'free-money', 'congratulations'];
        const stayType = pleaseStayTypes[Math.floor(Math.random() * pleaseStayTypes.length)];
        
        const pleaseStayPopup = {
          id: uuidv4(),
          type: stayType,
          position: getRandomPosition(),
          zIndex: nextZIndex
        };
        
        setNextZIndex(prev => prev + 10);
        setPopups(prev => [...prev, pleaseStayPopup]);
        
        // Play sound for "please don't close me" popup
        try {
          const popupSound = new Audio('/sounds/popup.mp3');
          popupSound.volume = 0.3;
          popupSound.play();
        } catch (error) {
          console.log('Sound could not be played');
        }
      }, 300);
    }
  };
  
  // Handle interaction that might spawn new popups
  const handleInteraction = () => {
    // 25% chance to spawn 1-3 new popups
    if (Math.random() < 0.25 && !isSpawning) {
      const newPopupCount = Math.floor(Math.random() * 3) + 1;
      spawnMultiplePopups(newPopupCount);
    }
  };
  
  // Function to close all popups (emergency escape)
  const closeAllPopups = () => {
    setPopups([]);
    setIsSpawning(false);
    onToggleAdware(); // Call the parent callback to disable adware
  };
  
  // Display a "Close All" button when there are many popups
  const renderCloseAllButton = () => {
    if (popups.length >= 5) {
      return (
        <div 
          className="close-all-button"
          onClick={closeAllPopups}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            zIndex: nextZIndex + 1,
            background: 'red',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px',
            fontFamily: '"MS Sans Serif", Arial, sans-serif',
            border: '2px solid white',
            boxShadow: '3px 3px 5px rgba(0, 0, 0, 0.5)'
          }}
        >
          CLOSE ALL ADS
        </div>
      );
    }
    return null;
  };
  
  if (!isActive) return null;
  
  return (
    <>
      {popups.map(popup => (
        <AdPopup
          key={popup.id}
          id={popup.id}
          type={popup.type}
          initialPosition={popup.position}
          onClose={handleClosePopup}
          onInteract={handleInteraction}
          zIndex={popup.zIndex}
        />
      ))}
      {renderCloseAllButton()}
    </>
  );
};

export default AdManager;