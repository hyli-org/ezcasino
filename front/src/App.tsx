import React, { useState, useEffect } from 'react';
import Game from './components/Game';
import './App.css'

function App() {
  const [backgroundTheme, setBackgroundTheme] = useState<'day' | 'night'>('day');

  useEffect(() => {
    document.body.className = `${backgroundTheme}-theme`;
  }, [backgroundTheme]);

  return (
    <>
      <div className="sun"></div>
      <div className="flower1"></div>
      <div className="flower2"></div>
      <div className="flower3"></div>
      <div className="flower4"></div>
      <div className="flower5"></div>
      <div className="flower6"></div>
      <div className="flower7"></div>
      <div className="flower8"></div>
      <div className="flower9"></div>
      <div className="flower10"></div>
      <div className="cow1">
        <div className="cow1-spots"></div>
        <div className="eye left"></div>
        <div className="eye right"></div>
        <div className="ear left"></div>
        <div className="ear right"></div>
      </div>
      <div className="cow2">
        <div className="cow2-spots"></div>
        <div className="eye left"></div>
        <div className="eye right"></div>
        <div className="ear left"></div>
        <div className="ear right"></div>
      </div>
      <div className="cow3">
        <div className="cow3-spots"></div>
        <div className="eye left"></div>
        <div className="eye right"></div>
        <div className="ear left"></div>
        <div className="ear right"></div>
      </div>
      <div className="App">
        <Game onBackgroundChange={setBackgroundTheme} />
      </div>
    </>
  );
}

export default App;
