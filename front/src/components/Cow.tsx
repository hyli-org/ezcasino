import React, { useEffect, useRef, useState } from 'react';

interface CowProps {
  className: string;
  theme: 'day' | 'night';
}

const Cow: React.FC<CowProps> = ({ className, theme }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isEating, setIsEating] = useState(false);
  useEffect(() => {
    // Créer l'élément audio avec le bon son selon le thème
    const audio = new Audio(`/sounds/cow${theme === 'night' ? '2' : ''}.mp3`);
    audioRef.current = audio;
  }, [theme]); // Recharger le son quand le thème change

  const handleClick = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; // Réinitialiser le son
      audioRef.current.play().catch(error => {
        console.log('Error playing sound:', error);
      });
      
      // Ajouter la classe eating
      setIsEating(true);
      setTimeout(() => setIsEating(false), 1000); // Retirer la classe après 1 seconde
    }
  };

  return (
    <div className={`${className} ${isEating ? 'eating' : ''}`} onClick={handleClick}>
      <div className={`${className}-head`}>
        <div className="eye left"></div>
        <div className="eye right"></div>
        <div className="ear left"></div>
        <div className="ear right"></div>
      </div>
      <div className={`${className}-spots`}></div>
    </div>
  );
};

export default Cow; 