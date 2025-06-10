import React, { useState, useEffect } from 'react';
import '../styles/TransactionNotification.css';

export interface Notification {
  id: string;
  tx_hash: string;
  timestamp: number;
}

interface TransactionNotificationProps {
  notifications: Notification[];
  onRemoveNotification: (id: string) => void;
}

const TransactionNotification: React.FC<TransactionNotificationProps> = ({
  notifications,
  onRemoveNotification,
}) => {
  useEffect(() => {
    notifications.forEach((notification) => {
      const timer = setTimeout(() => {
        onRemoveNotification(notification.id);
      }, 3000);

      return () => clearTimeout(timer);
    });
  }, [notifications, onRemoveNotification]);

  const handleClick = (id: string) => {
    onRemoveNotification(id);
  };

  const copyTxHash = (txHash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(txHash);
  };

  return (
    <div className="notification-container">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="transaction-notification"
          style={{ top: `${index * 70}px` }}
          onClick={() => handleClick(notification.id)}
        >
          <div className="notification-content">
            <div className="notification-title">✅ Transaction Sent</div>
            <div className="notification-tx">
              <span>TX: </span>
              <span 
                className="tx-hash"
                onClick={(e) => copyTxHash(notification.tx_hash, e)}
                title="Click to copy"
              >
                {notification.tx_hash.substring(0, 8)}...{notification.tx_hash.substring(notification.tx_hash.length - 6)}
              </span>
            </div>
          </div>
          <div className="notification-close">×</div>
        </div>
      ))}
    </div>
  );
};

export default TransactionNotification; 