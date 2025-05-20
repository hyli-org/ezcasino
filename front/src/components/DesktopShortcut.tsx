import React from 'react';
import './DesktopShortcut.css';

interface DesktopShortcutProps {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  labelStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
}

const DesktopShortcut: React.FC<DesktopShortcutProps> = ({ 
  icon, 
  label, 
  onClick,
  className = '',
  labelStyle,
  iconStyle
}) => {
  return (
    <div className={`desktop-shortcut ${className}`} onClick={onClick}>
      <img src={icon} alt={label} className="shortcut-icon" style={iconStyle} />
      <span className="shortcut-label" style={labelStyle}>{label}</span>
    </div>
  );
};

export default DesktopShortcut; 