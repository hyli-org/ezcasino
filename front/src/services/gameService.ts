import { GameState } from '../types/game';
import { Blob } from 'hyli';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const SESSION_PRIVATE_KEY_STORAGE_KEY = 'ezcasino_private_key';

class GameService {  
  private privateKey: string | null = null;

  setSessionPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
    localStorage.setItem(SESSION_PRIVATE_KEY_STORAGE_KEY, privateKey);
  }

  getPrivateKey(): string | null {
    if (!this.privateKey) {
      const storedPrivateKey = localStorage.getItem(SESSION_PRIVATE_KEY_STORAGE_KEY);
      if (storedPrivateKey) {
        this.privateKey = storedPrivateKey;
      }
    }
    return this.privateKey;
  }

  clearSession() {
    localStorage.removeItem(SESSION_PRIVATE_KEY_STORAGE_KEY);
    this.privateKey = null;
  }

  private async makeRequest(endpoint: string, method: string = 'GET', body?: any, identity?: string) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Identity': identity || '',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }
    console.log('Making request to:', `${API_BASE_URL}${endpoint}`, fetchOptions);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async initGame(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/init', 'POST', wallet_blobs, identity);
  }

  async hit(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/hit', 'POST', wallet_blobs, identity);
  }

  async stand(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/stand', 'POST', wallet_blobs, identity);
  }

  async doubleDown(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/double_down', 'POST', wallet_blobs, identity);
  }

  async claim(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/claim', 'POST', wallet_blobs, identity);
  }

  async getConfig(): Promise<{ contract_name: string }> {
    return this.makeRequest('/config', 'GET');
  }
}

export const gameService = new GameService(); 