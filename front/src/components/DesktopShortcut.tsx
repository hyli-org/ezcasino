import React from 'react';
import './DesktopShortcut.css';

interface DesktopShortcutProps {
  icon: string;
  label: string;
  onClick: () => void;
}

const DesktopShortcut: React.FC<DesktopShortcutProps> = ({ icon, label, onClick }) => {
  return (
    <div className="desktop-shortcut" onClick={onClick}>
      <img src={icon} alt={label} className="shortcut-icon" />
      <span className="shortcut-label">{label}</span>
    </div>
  );
};

export default DesktopShortcut; 