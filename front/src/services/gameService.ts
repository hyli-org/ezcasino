import { GameState } from '../types/game';
import { Blob } from "hyle";
import { sessionKeyService, Wallet } from 'hyle-wallet';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const SESSION_PRIVATE_KEY_STORAGE_KEY = 'ezcasino_private_key';

class GameService {  
  private privateKey: string | null = null;

  async initialize(wallet: Wallet, password: string) {
    return this.initializeSessionKey(wallet, password);
  }

  private async initializeSessionKey(wallet: Wallet, password: string) {
    // Try to get existing session key
    const storedPrivateKey = localStorage.getItem(SESSION_PRIVATE_KEY_STORAGE_KEY);
    console.log('wallet', wallet);

    if (storedPrivateKey) {
      this.privateKey = storedPrivateKey;
      return;
    }

    // Generate new session key if none exists
    try {
      const [_publicKey, privateKey] = sessionKeyService.generateSessionKey();
      localStorage.setItem(SESSION_PRIVATE_KEY_STORAGE_KEY, privateKey);
    
      await sessionKeyService.registerSessionKey(wallet.username, password, Date.now() + (7 * 24 * 60 * 60 * 1000), privateKey, ["blackjack", "hyllar"]);
    } catch (error) {
      console.error('Failed to initialize session key:', error);
      throw error;
    }
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