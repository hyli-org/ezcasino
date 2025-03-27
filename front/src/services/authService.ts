import { ec } from 'elliptic';
import { enc, lib, SHA256 } from 'crypto-js';

const SESSION_KEY_STORAGE_KEY = 'blackjack_session_key';
const PUBLIC_KEY_STORAGE_KEY = 'blackjack_public_key';

class AuthService {
  private sessionKey: string | null = null;
  private publicKey: string | null = null;
  private ec: ec;

  constructor() {
    this.ec = new ec('secp256k1');
    // Récupérer la sessionKey et la publicKey du localStorage au démarrage
    this.sessionKey = localStorage.getItem(SESSION_KEY_STORAGE_KEY);
    this.publicKey = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  }

  generateSessionKey(): string {
    // Génère une paire de clés ECDSA
    const keyPair = this.ec.genKeyPair();
    // Stocke la clé privée
    const privateKey = keyPair.getPrivate('hex');
    if (!privateKey) {
      throw new Error('Failed to generate private key');
    }
    this.sessionKey = privateKey;

    // Stocke la clé publique
    const publicKey = keyPair.getPublic('hex');
    if (!publicKey) {
      throw new Error('Failed to generate public key');
    }
    this.publicKey = publicKey;

    // Sauvegarder dans le localStorage
    localStorage.setItem(SESSION_KEY_STORAGE_KEY, this.sessionKey);
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, this.publicKey);
    return this.publicKey;
  }

  getSessionKey(): string | null {
    return this.publicKey; // On retourne la clé publique pour l'authentification
  }

  signRequest(payload: any): string {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    // Convertit le payload en string
    const payloadString = JSON.stringify(payload);
    // Crée un hash SHA256 du payload
    const hash = SHA256(payloadString);
    // Signe le hash avec ECDSA
    const keyPair = this.ec.keyFromPrivate(this.sessionKey);
    const signature = keyPair.sign(hash.toString());
    // Retourne la signature au format hexadécimal
    return signature.toDER('hex');
  }

  signMessage(message: string): string {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    // Crée un hash SHA256 du message
    const hash = SHA256(message);
    // Signe le hash avec ECDSA
    const keyPair = this.ec.keyFromPrivate(this.sessionKey);
    const signature = keyPair.sign(hash.toString());
    // Retourne la signature au format hexadécimal
    return signature.toDER('hex');
  }

  clearSession() {
    this.sessionKey = null;
    this.publicKey = null;
    localStorage.removeItem(SESSION_KEY_STORAGE_KEY);
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
  }
}

export const authService = new AuthService(); 