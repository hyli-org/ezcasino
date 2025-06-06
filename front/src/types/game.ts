export interface GameState {
  bank: number[];
  bank_count: number;
  user: number[];
  user_count: number;
  bet: number;
  state: 'Ongoing' | 'Lost' | 'Won';
  balance: number;
}

export interface InitGameRequest {
  account: string;
} 