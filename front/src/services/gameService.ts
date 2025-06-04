import { GameState } from '../types/game';
import { Blob } from 'hyli';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class GameService {

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
    return this.makeRequest('/api/init', 'POST', wallet_blobs, identity);
  }

  async hit(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/api/hit', 'POST', wallet_blobs, identity);
  }

  async stand(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/api/stand', 'POST', wallet_blobs, identity);
  }

  async doubleDown(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/api/double_down', 'POST', wallet_blobs, identity);
  }

  async claim(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    return this.makeRequest('/api/claim', 'POST', wallet_blobs, identity);
  }

  async withdraw(wallet_blobs: [Blob, Blob], identity: string): Promise<GameState> {
    let balance = await this.getBalance(identity);
    const body = {
      wallet_blobs,
      balance
    };
    return this.makeRequest('/api/withdraw', 'POST', body, identity);
  }

  async getBalance(identity: string): Promise<number> {
    return this.makeRequest(`/v1/indexer/contract/blackjack/user/${identity}/balance`, 'GET');
  }

  async getConfig(): Promise<{ contract_name: string }> {
    return this.makeRequest('/api/config', 'GET');
  }

  async getCurrentGameState(identity: string): Promise<GameState | null> {
    try {
      // Get the full contract state
      const contractState = await this.makeRequest('/v1/indexer/contract/blackjack/state', 'GET');

      // Check if the user has an ongoing table
      const userTable = contractState.tables[identity];
      if (!userTable) {
        return null; // No ongoing game
      }

      // Get user balance
      const balance = await this.getBalance(identity);

      // Convert the table state to GameState format
      const gameState: GameState = {
        bank: userTable.bank,
        bank_count: this.calculateHandValue(userTable.bank),
        user: userTable.user,
        user_count: this.calculateHandValue(userTable.user),
        bet: userTable.bet,
        state: userTable.state === 'Lost' ? 'Lost' :
               userTable.state === 'Won' ? 'Won' : 'Ongoing',
        balance: balance
      };

      return gameState;
    } catch (error) {
      console.error('Error fetching current game state:', error);
      return null;
    }
  }

  private calculateHandValue(cards: number[]): number {
    let value = 0;
    let aces = 0;

    for (const card of cards) {
      if (card === 1) {
        aces++;
        value += 1; // Start with Ace as 1
      } else if (card >= 11 && card <= 13) {
        value += 10; // J, Q, K are worth 10
      } else {
        value += card;
      }
    }

    // Try to use Aces as 11 if it doesn't bust
    for (let i = 0; i < aces; i++) {
      if (value + 10 <= 21) {
        value += 10; // Convert Ace from 1 to 11
      }
    }

    return value;
  }
}

export const gameService = new GameService();