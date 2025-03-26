import { GameState, InitGameRequest } from '../types/game';

const API_BASE_URL = 'http://localhost:3000/api';

export const gameService = {
  initGame: async (account: string): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account } as InitGameRequest),
    });

    if (!response.ok) {
      throw new Error('Failed to initialize game');
    }

    return response.json();
  },

  hit: async (account: string): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}/hit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account } as InitGameRequest),
    });

    if (!response.ok) {
      throw new Error('Failed to hit');
    }

    return response.json();
  },

  stand: async (account: string): Promise<GameState> => {
    const response = await fetch(`${API_BASE_URL}/stand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account } as InitGameRequest),
    });

    if (!response.ok) {
      throw new Error('Failed to stand');
    }

    return response.json();
  },
}; 