import { useState, useEffect } from 'react';
import Game from './components/Game';
import './App.css';
import { WalletProvider } from 'hyle-wallet';

function App() {
  const [backgroundTheme, setBackgroundTheme] = useState<'day' | 'night'>('day');

  useEffect(() => {
    document.body.className = `${backgroundTheme}-theme`;
  }, [backgroundTheme]);

  const toggleTheme = () => {
    setBackgroundTheme(prev => prev === 'day' ? 'night' : 'day');
  };

  return (
    <WalletProvider config={{
        nodeBaseUrl: import.meta.env.VITE_NODE_BASE_URL,
        walletServerBaseUrl: import.meta.env.VITE_WALLET_SERVER_BASE_URL,
        applicationWsUrl: import.meta.env.VITE_WALLET_WS_URL
      }}>
      <div className="sun" onClick={toggleTheme} style={{ cursor: 'pointer' }}></div>
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
      <div className="App">
        <Game onBackgroundChange={setBackgroundTheme} theme={backgroundTheme} />
      </div>
    </WalletProvider>
  );
}

export default App;
