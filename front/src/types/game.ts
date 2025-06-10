export interface GameState {
  bank: number[];
  bank_count: number;
  user: number[];
  user_count: number;
  bet: number;
  state: 'Ongoing' | 'Lost' | 'Won';
  balance: number;
}

export interface GameResponse {
  tx_hash: string;
  table: GameState;
}

export interface TokenBalances {
  oranjBalance: number;
  oranjDeposited: number;
  vitBalance: number;
  vitEarned: number;
}

export interface InitGameRequest {
  account: string;
} 