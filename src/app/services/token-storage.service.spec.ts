import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('encodes and decodes tokens in session storage', () => {
    const service = new TokenStorageService();
    service.setToken('hello-token', false);

    const encoded = sessionStorage.getItem('st_token');
    expect(encoded).not.toBe('hello-token');
    expect(encoded).toBe(btoa('hello-token'.split('').reverse().join('')));

    const reloaded = new TokenStorageService();
    expect(reloaded.getToken()).toBe('hello-token');
  });

  it('stores remember-me tokens in localStorage', () => {
    const service = new TokenStorageService();
    service.setToken('remember-me', true);

    expect(localStorage.getItem('st_token')).toBeTruthy();
    expect(localStorage.getItem('st_remember')).toBe('true');
    expect(sessionStorage.getItem('st_token')).toBeNull();

    const reloaded = new TokenStorageService();
    expect(reloaded.getToken()).toBe('remember-me');
  });

  it('stores session-only tokens in sessionStorage', () => {
    const service = new TokenStorageService();
    service.setToken('session-only', false);

    expect(sessionStorage.getItem('st_token')).toBeTruthy();
    expect(localStorage.getItem('st_token')).toBeNull();
    expect(localStorage.getItem('st_remember')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('reads legacy token key when present', () => {
    localStorage.setItem('token', 'legacy-token');

    const service = new TokenStorageService();
    expect(service.getToken()).toBe('legacy-token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.migrateFromLegacy()).toBe(false);
  });

  it('clears corrupted encoded tokens', () => {
    sessionStorage.setItem('st_token', '!!!not-valid-base64!!!');

    const service = new TokenStorageService();
    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('st_token')).toBeNull();
  });

  it('rejects empty tokens', () => {
    const service = new TokenStorageService();
    expect(() => service.setToken('', false)).toThrow('Invalid token');
  });

  it('clearToken removes all storage keys', () => {
    const service = new TokenStorageService();
    service.setToken('to-clear', true);
    service.clearToken();

    expect(service.getToken()).toBeNull();
    expect(localStorage.getItem('st_token')).toBeNull();
    expect(localStorage.getItem('st_remember')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('st_token')).toBeNull();
  });
});
