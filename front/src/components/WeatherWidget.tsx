import React, { useState, useEffect } from 'react';
import './WeatherWidget.css';

interface WeatherWidgetProps {
  onClose: () => void;
}

interface WeatherDay {
  date: string;
  type: 'sunny' | 'cloudy' | 'dust-storm' | 'windy';
  temperature: number;
  high: number;
  low: number;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ onClose }) => {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // June weather data (as requested by user)
  const weatherData: WeatherDay[] = [
    { date: 'June 1', type: 'sunny', temperature: 20, high: 25, low: 15 },
    { date: 'June 2', type: 'sunny', temperature: 22, high: 28, low: 16 },
    { date: 'June 3', type: 'sunny', temperature: 23, high: 29, low: 18 },
    { date: 'June 4', type: 'dust-storm', temperature: 19, high: 24, low: 14 },
    { date: 'June 5', type: 'dust-storm', temperature: 17, high: 22, low: 12 },
    { date: 'June 6', type: 'cloudy', temperature: 18, high: 23, low: 13 },
    { date: 'June 7', type: 'cloudy', temperature: 19, high: 24, low: 14 },
    { date: 'June 8', type: 'windy', temperature: 20, high: 26, low: 15 },
    { date: 'June 9', type: 'sunny', temperature: 22, high: 28, low: 16 },
    { date: 'June 10', type: 'sunny', temperature: 23, high: 29, low: 18 },
    { date: 'June 11', type: 'sunny', temperature: 24, high: 30, low: 19 },
    { date: 'June 12', type: 'windy', temperature: 21, high: 27, low: 16 }
  ];

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
    
    if (e.target instanceof HTMLElement && e.target.closest('.weather-title-bar')) {
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

      // Limit movement to window boundaries
      const maxX = window.innerWidth - 380; // Approximate widget width
      const maxY = window.innerHeight - 480; // Approximate widget height

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div 
      className="weather-widget"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="win95-title-bar weather-title-bar">
        <span>Mars Weather Forecast</span>
        <div className="window-controls">
          <button className="minimize">-</button>
          <button className="maximize">□</button>
          <button className="close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="weather-content">
        <div className="weather-header">
          <h2>Mars Weather Station</h2>
          <p className="location">Jezero Crater, Mars</p>
          <p className="disclaimer">Data from Mars Orbital Weather Satellite</p>
        </div>
        <div className="weather-days">
          {weatherData.map((day, index) => (
            <div className="weather-day" key={index}>
              <div className="day-date">{day.date}</div>
              <div className={`weather-icon weather-${day.type}`}></div>
              <div className="day-temp">{day.temperature}°C</div>
              <div className="day-range">
                <span className="high-temp">H: {day.high}°</span>
                <span className="low-temp">L: {day.low}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeatherWidget; 