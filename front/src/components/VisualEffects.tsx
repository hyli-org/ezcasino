import React, { useEffect, useState } from 'react';
import './VisualEffects.css';

interface VisualEffectsProps {
  isWin: boolean;
  isLose: boolean;
}

const VisualEffects: React.FC<VisualEffectsProps> = ({ isWin, isLose }) => {
  const [fireworks, setFireworks] = useState<Array<{ x: number; y: number; color: string; delay: number }>>([]);
  const [raindrops, setRaindrops] = useState<Array<{ x: number; y: number; speed: number }>>([]);
  const [lightning, setLightning] = useState<Array<{ x: number; y: number; path: string }>>([]);
  const [clouds, setClouds] = useState<Array<{ y: number; size: number; delay: number; startX: number }>>([]);

  const generateLightningPath = () => {
    const points = [];
    let x = 20; // Point de départ au centre
    let y = 0;
    points.push(`M ${x} ${y}`);

    // Générer des points aléatoires pour créer un zigzag
    while (y < 100) {
      x += (Math.random() - 0.5) * 30; // Déplacement horizontal aléatoire
      y += Math.random() * 20; // Déplacement vertical aléatoire
      points.push(`L ${x} ${y}`);
    }

    return points.join(' ');
  };

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
        y: Math.random() * (window.innerHeight / 3) + (window.innerHeight / 3), // Position sous les nuages
        path: generateLightningPath()
      }));
      setLightning(newLightning);

      // Créer des nuages répartis sur toute la largeur
      const newClouds = Array.from({ length: 8 }, (_, index) => ({
        y: Math.random() * (window.innerHeight / 3), // Nuages dans le tiers supérieur
        size: 150 + Math.random() * 100, // Taille aléatoire
        delay: Math.random() * 10, // Délai aléatoire pour un effet plus naturel
        startX: (index * window.innerWidth) / 8 // Répartir les nuages sur toute la largeur
      }));
      setClouds(newClouds);
    }
  }, [isWin, isLose]);

  return (
    <div className={`visual-effects ${isLose ? 'lose' : ''}`}>
      <div className="sun" />
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
          {clouds.map((cloud, index) => (
            <div
              key={`cloud-${index}`}
              className="cloud"
              style={{
                width: cloud.size,
                height: cloud.size / 2,
                top: cloud.y,
                left: cloud.startX,
                animationDelay: `${cloud.delay}s`
              }}
            />
          ))}
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
            >
              <svg viewBox="0 0 40 100">
                <path d={flash.path} />
              </svg>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default VisualEffects; 