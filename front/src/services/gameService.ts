import { authService } from './authService';
import { GameState } from '../types/game';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class GameService {
  private async makeRequest(endpoint: string, method: string = 'GET') {
    const sessionKey = authService.getSessionKey();
    if (!sessionKey) {
      throw new Error('No active session');
    }

    const action = endpoint.split('/').pop() || '';
    const signature = authService.signMessage(action);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Session-Key': sessionKey,
      'X-Request-Signature': signature
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async initGame(): Promise<GameState> {
    return this.makeRequest('/init', 'POST');
  }

  async hit(): Promise<GameState> {
    return this.makeRequest('/hit', 'POST');
  }

  async stand(): Promise<GameState> {
    return this.makeRequest('/stand', 'POST');
  }

  async doubleDown(): Promise<GameState> {
    return this.makeRequest('/double_down', 'POST');
  }

  async claim(): Promise<GameState> {
    return this.makeRequest('/claim', 'POST');
  }

  async getConfig(): Promise<{ contract_name: string }> {
    return this.makeRequest('/config', 'GET');
  }
}

export const gameService = new GameService(); 