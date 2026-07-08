import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { authGuard, guestGuard } from './auth.guard';
import { AgentStore } from '../state/agent.store';
import { TokenStorageService } from '../../services/token-storage.service';
import { Agent } from '../../models/agent.model';
const SAMPLE_AGENT: Agent = {
  token: 'test-token',
  name: 'TEST-PILOT',
  credits: 1000,
  faction: 'COSMIC',
  hq: 'X1-TEST-1',
  ships_cpt: 1,
};

describe('authGuard', () => {
  let agentStore: AgentStore;
  let tokenStorage: { isAuthenticated: ReturnType<typeof vi.fn> };
  let createUrlTree: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createUrlTree = vi.fn((commands: unknown[]) => ({ commands }) as unknown as UrlTree);
    tokenStorage = { isAuthenticated: vi.fn(() => false) };

    TestBed.configureTestingModule({
      providers: [
        AgentStore,
        { provide: TokenStorageService, useValue: tokenStorage },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    agentStore = TestBed.inject(AgentStore);
    agentStore.clear();
  });

  it('allows access when token and AgentStore are authenticated', () => {
    tokenStorage.isAuthenticated.mockReturnValue(true);
    agentStore.setAgent(SAMPLE_AGENT);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirects to /register when AgentStore is not authenticated', () => {
    tokenStorage.isAuthenticated.mockReturnValue(true);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(createUrlTree).toHaveBeenCalledWith(['/register']);
    expect(result).toEqual({ commands: ['/register'] });
  });

  it('redirects to /register when token is missing', () => {
    agentStore.setAgent(SAMPLE_AGENT);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(createUrlTree).toHaveBeenCalledWith(['/register']);
    expect(result).toEqual({ commands: ['/register'] });
  });
});
describe('guestGuard', () => {
  let agentStore: AgentStore;
  let createUrlTree: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createUrlTree = vi.fn((commands: unknown[]) => ({ commands }) as unknown as UrlTree);

    TestBed.configureTestingModule({
      providers: [
        AgentStore,
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    agentStore = TestBed.inject(AgentStore);
    agentStore.clear();
  });

  it('allows access when AgentStore is not authenticated', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirects to /home when AgentStore is authenticated', () => {
    agentStore.setAgent(SAMPLE_AGENT);
    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
    expect(createUrlTree).toHaveBeenCalledWith(['/home']);
    expect(result).toEqual({ commands: ['/home'] });
  });
});
