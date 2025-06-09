import React, { useState, useEffect } from 'react';
import './Hyli.css';

interface Transaction {
  id: string;
  identity: string;
  contract: string;
  timestamp: number;
}

interface HyliProps {
  onClose: () => void;
}

const Hyli: React.FC<HyliProps> = ({ onClose }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [windowPosition, setWindowPosition] = useState({ x: 50, y: window.innerHeight - 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Mock function to simulate new transactions arriving
  useEffect(() => {
    const generateMockTransaction = () => {
      const identities = [
        'user123',
        'wallet456',
        'player789',
        'hyli_user',
        'anonymous'
      ];
      
      const contracts = [
        'BlackjackGame',
        'TokenExchange',
        'IdentityVerifier',
        'DiceRoll',
        'Lottery'
      ];
      
      return {
        id: Math.random().toString(36).substring(2, 10),
        identity: identities[Math.floor(Math.random() * identities.length)],
        contract: contracts[Math.floor(Math.random() * contracts.length)],
        timestamp: Date.now()
      };
    };

    // Add initial mock transactions
    setTransactions([
      generateMockTransaction(),
      generateMockTransaction(),
      generateMockTransaction()
    ]);

    // Add a new transaction every few seconds
    const interval = setInterval(() => {
      setTransactions(prev => [generateMockTransaction(), ...prev]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Update position if window size changes
  useEffect(() => {
    const handleResize = () => {
      setWindowPosition(prev => ({
        ...prev,
        y: Math.min(prev.y, window.innerHeight - 500)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

      // Limit movement to screen edges
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 500;

      setWindowPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const copyAddress = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('Copied!');
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="hyli-window win95-window"
      style={{
        transform: `translate(${windowPosition.x}px, ${windowPosition.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="win95-title-bar">
        <div className="title-icon">
          <img src="/hyli.svg" alt="Hyli" className="title-icon-img" />
        </div>
        <span>Hyli Explorer</span>
        <div className="window-controls">
          <button className="minimize">-</button>
          <button className="maximize">□</button>
          <button className="close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="menu-bar">
        <span className="menu-item">File</span>
        <span className="menu-item">Edit</span>
        <span className="menu-item">View</span>
        <span className="menu-item">Help</span>
      </div>

      <div className="address-bar">
        <span className="address-label">Address:</span>
        <div className="address-input">
          <img src="/hyli.svg" alt="Hyli" className="address-icon" />
          hyli://explorer/transactions
        </div>
        <button className="win95-button go-button">Go</button>
      </div>

      <div className="transaction-container">
        <div className="transaction-header">
          <div className="transaction-cell time-cell">Time</div>
          <div className="transaction-cell hash-cell">TxHash</div>
          <div className="transaction-cell identity-cell">Identity</div>
          <div className="transaction-cell contract-cell">Contract</div>
        </div>
        
        <div className="transaction-list">
          {transactions.map((tx) => (
            <div key={tx.id} className="transaction-row">
              <div className="transaction-cell time-cell">{formatTime(tx.timestamp)}</div>
              <div 
                className="transaction-cell hash-cell clickable"
                onClick={() => copyAddress(tx.id)}
              >
                {tx.id}
              </div>
              <div 
                className="transaction-cell identity-cell clickable" 
                onClick={() => copyAddress(tx.identity)}
              >
                {tx.identity}
              </div>
              <div 
                className="transaction-cell contract-cell clickable"
                onClick={() => copyAddress(tx.contract)}
              >
                {tx.contract}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="status-bar">
        <div className="status-section">
          <img src="/hyli.svg" alt="Hyli" className="status-icon" />
          <span>Connected</span>
        </div>
        <div className="status-section">
          Transactions: {transactions.length}
        </div>
        {copyMessage && <div className="copy-message">{copyMessage}</div>}
      </div>
    </div>
  );
};

export default Hyli; 