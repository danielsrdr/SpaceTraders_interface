import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly storageKey = 'st_token';
  private readonly rememberKey = 'st_remember';
  private readonly legacyKey = 'token';
  private token: string | null = null;

  constructor() {
    this.migrateFromLegacy();
  }

  setToken(token: string, remember = false): void {
    if (!token) throw new Error('Invalid token');
    this.token = token;
    const encoded = this.encode(token);

    if (remember) {
      localStorage.setItem(this.storageKey, encoded);
      localStorage.setItem(this.rememberKey, 'true');
      sessionStorage.removeItem(this.storageKey);
      localStorage.setItem(this.legacyKey, token);
    } else {
      sessionStorage.setItem(this.storageKey, encoded);
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.rememberKey);
      localStorage.removeItem(this.legacyKey);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;

    let encoded = sessionStorage.getItem(this.storageKey);
    if (!encoded && localStorage.getItem(this.rememberKey)) {
      encoded = localStorage.getItem(this.storageKey);
    }

    if (encoded) {
      try {
        this.token = this.decode(encoded);
        return this.token;
      } catch {
        this.clearToken();
        return null;
      }
    }

    const legacy = localStorage.getItem(this.legacyKey);
    if (legacy) {
      this.token = legacy;
      return legacy;
    }

    return null;
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  clearToken(): void {
    this.token = null;
    sessionStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.rememberKey);
    localStorage.removeItem(this.legacyKey);
  }

  migrateFromLegacy(): boolean {
    const legacyToken = localStorage.getItem(this.legacyKey);
    if (legacyToken && !this.isAuthenticated()) {
      this.setToken(legacyToken, true);
      return true;
    }
    return false;
  }

  private encode(token: string): string {
    return btoa(token.split('').reverse().join(''));
  }

  private decode(encoded: string): string {
    return atob(encoded).split('').reverse().join('');
  }
}
