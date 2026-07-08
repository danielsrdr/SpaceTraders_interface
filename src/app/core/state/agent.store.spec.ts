import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { AgentStore } from './agent.store';
import { Agent } from '../../models/agent.model';

const SAMPLE_AGENT: Agent = {
  token: 'test-token',
  name: 'TEST-PILOT',
  credits: 1000,
  faction: 'COSMIC',
  hq: 'X1-TEST-1',
  ships_cpt: 2,
};

describe('AgentStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AgentStore],
    });
  });

  it('isAuthenticated is false when no agent is set', () => {
    const store = TestBed.inject(AgentStore);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.agent()).toBeNull();
  });

  it('isAuthenticated is true after setAgent', () => {
    const store = TestBed.inject(AgentStore);
    store.setAgent(SAMPLE_AGENT);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.agent()?.name).toBe('TEST-PILOT');
  });

  it('patchCredits updates credits on the current agent', () => {
    const store = TestBed.inject(AgentStore);
    store.setAgent(SAMPLE_AGENT);
    store.patchCredits(2500);
    expect(store.agent()?.credits).toBe(2500);
    expect(store.agent()?.name).toBe('TEST-PILOT');
  });

  it('patchCredits is a no-op when no agent is set', () => {
    const store = TestBed.inject(AgentStore);
    store.patchCredits(999);
    expect(store.agent()).toBeNull();
  });

  it('clear resets agent and authentication state', () => {
    const store = TestBed.inject(AgentStore);
    store.setAgent(SAMPLE_AGENT);
    store.clear();
    expect(store.agent()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });
});
