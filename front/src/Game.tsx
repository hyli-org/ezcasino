const handleStartMenuItemClick = (action: string) => {
  switch (action) {
    case 'new-game':
      startNewGame();
      break;
    case 'weather':
      if (toggleWeatherWidget) {
        toggleWeatherWidget();
      }
      break;
    case 'adware':
      // Toggle adware feature - we'll need to add this from App component
      window.dispatchEvent(new CustomEvent('toggle-adware'));
      break;
    case 'oranj-tokens':
      setShowBigRedButton(true);
      break;
    case 'msn-chat':
      // Toggle MSN Chat
      window.dispatchEvent(new CustomEvent('toggle-msn-chat'));
      break;
    case 'shutdown':
      setShowShutdown(true);
      const shutdownSound = new Audio('/sounds/shutdown.mp3');
      shutdownSound.play();
      // Attendre que le son se termine avant de fermer
      setTimeout(() => {
        window.close();
      }, 3000);
      break;
  }
  setShowStartMenu(false);
}; 