import HmacSHA256 from 'crypto-js/hmac-sha256';
import { enc, lib } from 'crypto-js';

const SESSION_KEY_STORAGE_KEY = 'blackjack_session_key';

class AuthService {
  private sessionKey: string | null = null;

  constructor() {
    // Récupérer la sessionKey du localStorage au démarrage
    this.sessionKey = localStorage.getItem(SESSION_KEY_STORAGE_KEY);
  }

  generateSessionKey(): string {
    // Génère une clé aléatoire de 32 bytes
    this.sessionKey = lib.WordArray.random(32).toString(enc.Hex);
    // Sauvegarder dans le localStorage
    localStorage.setItem(SESSION_KEY_STORAGE_KEY, this.sessionKey);
    return this.sessionKey;
  }

  getSessionKey(): string | null {
    return this.sessionKey;
  }

  signRequest(payload: any): string {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    // Convertit le payload en string et le signe avec la clé de session
    const payloadString = JSON.stringify(payload);
    return HmacSHA256(payloadString, this.sessionKey).toString(enc.Hex);
  }

  signMessage(message: string): string {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    return HmacSHA256(message, this.sessionKey).toString(enc.Hex);
  }

  clearSession() {
    this.sessionKey = null;
    localStorage.removeItem(SESSION_KEY_STORAGE_KEY);
  }
}

export const authService = new AuthService(); 