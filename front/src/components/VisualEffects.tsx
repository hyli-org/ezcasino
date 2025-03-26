import React, { useEffect, useState } from 'react';
import './VisualEffects.css';

interface VisualEffectsProps {
  isWin: boolean;
  isLose: boolean;
}

const VisualEffects: React.FC<VisualEffectsProps> = ({ isWin, isLose }) => {
  const [fireworks, setFireworks] = useState<Array<{ x: number; y: number; color: string; delay: number }>>([]);
  const [raindrops, setRaindrops] = useState<Array<{ x: number; y: number; speed: number }>>([]);
  const [lightning, setLightning] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (isWin) {
      // Créer des feux d'artifice plus nombreux et colorés
      const newFireworks = Array.from({ length: 30 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * (window.innerHeight / 2),
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
        delay: Math.random() * 2 // Délai aléatoire pour un effet plus naturel
      }));
      setFireworks(newFireworks);
    }

    if (isLose) {
      // Créer beaucoup plus de gouttes de pluie avec des vitesses différentes
      const newRaindrops = Array.from({ length: 200 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        speed: 1 + Math.random() * 2 // Vitesse aléatoire
      }));
      setRaindrops(newRaindrops);

      // Créer des éclairs
      const newLightning = Array.from({ length: 5 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * (window.innerHeight / 2)
      }));
      setLightning(newLightning);
    }
  }, [isWin, isLose]);

  return (
    <div className="visual-effects">
      {isWin && fireworks.map((firework, index) => (
        <div
          key={index}
          className="firework"
          style={{
            left: firework.x,
            top: firework.y,
            backgroundColor: firework.color,
            animationDelay: `${firework.delay}s`
          }}
        />
      ))}
      {isLose && (
        <>
          {raindrops.map((raindrop, index) => (
            <div
              key={index}
              className="raindrop"
              style={{
                left: raindrop.x,
                top: raindrop.y,
                animationDuration: `${1 / raindrop.speed}s`
              }}
            />
          ))}
          {lightning.map((flash, index) => (
            <div
              key={index}
              className="lightning"
              style={{
                left: flash.x,
                top: flash.y,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default VisualEffects; 