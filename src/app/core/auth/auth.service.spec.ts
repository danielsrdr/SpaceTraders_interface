import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AgentStore } from '../state/agent.store';
import { TokenStorageService } from '../../services/token-storage.service';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { LogbookStore } from '../state/logbook.store';
import { FlightRecorderStore } from '../state/flight-recorder.store';
import { Agent } from '../../models/agent.model';

const SAMPLE_AGENT: Agent = {
  token: 'valid-token',
  name: 'TEST-PILOT',
  credits: 5000,
  faction: 'COSMIC',
  hq: 'X1-TEST-1',
  ships_cpt: 1,
};

describe('AuthService', () => {
  let auth: AuthService;
  let tokenStorage: TokenStorageService;
  let agentStore: AgentStore;
  let getAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    getAgent = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        AgentStore,
        TokenStorageService,
        LogbookStore,
        FlightRecorderStore,
        {
          provide: SpaceTradersApiService,
          useValue: {
            getAgent,
            register: vi.fn(),
            clearCaches: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: { navigate: vi.fn() },
        },
      ],
    });

    auth = TestBed.inject(AuthService);
    tokenStorage = TestBed.inject(TokenStorageService);
    agentStore = TestBed.inject(AgentStore);
    agentStore.clear();
    tokenStorage.clearToken();
  });

  it('returns validation errors for empty login token', async () => {
    const errors = await auth.login('   ', false);
    expect(errors).toEqual(['token is required']);
    expect(tokenStorage.isAuthenticated()).toBe(false);
  });

  it('clears token and returns message when login token is invalid', async () => {
    getAgent.mockRejectedValue(new Error('Unauthorized'));

    const errors = await auth.login('bad-token', false);

    expect(errors).toEqual(['Token invalide.']);
    expect(tokenStorage.isAuthenticated()).toBe(false);
    expect(agentStore.isAuthenticated()).toBe(false);
  });

  it('stores token and agent on successful login', async () => {
    getAgent.mockResolvedValue(SAMPLE_AGENT);

    const errors = await auth.login('valid-token', true);

    expect(errors).toEqual([]);
    expect(tokenStorage.getToken()).toBe('valid-token');
    expect(agentStore.agent()?.name).toBe('TEST-PILOT');
    expect(localStorage.getItem('st_remember')).toBe('true');
  });

  it('clears token and agent when relog fails', async () => {
    tokenStorage.setToken('stored-token', false);
    getAgent.mockRejectedValue(new Error('Unauthorized'));

    const ok = await auth.relog();

    expect(ok).toBe(false);
    expect(tokenStorage.isAuthenticated()).toBe(false);
    expect(agentStore.isAuthenticated()).toBe(false);
  });
});
