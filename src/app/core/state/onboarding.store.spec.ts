import { TestBed } from '@angular/core/testing';
import { AgentStore } from './agent.store';
import { OnboardingStore } from './onboarding.store';

const AGENT = 'Onboard-Pilot';
const STORAGE_KEY = `sk_onboarding_${AGENT}`;

function setAgent(): void {
  TestBed.inject(AgentStore).setAgent({
    token: 't',
    name: AGENT,
    faction: 'COSMIC',
    credits: 0,
    hq: 'X1-TEST',
    ships_cpt: 1,
  });
}

describe('OnboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AgentStore, OnboardingStore],
    });
  });

  it('activates onboarding for a new agent', () => {
    setAgent();
    const store = TestBed.inject(OnboardingStore);
    store.attach(AGENT);
    expect(store.shouldShow()).toBe(true);
    expect(store.stepIndex()).toBe(0);
  });

  it('persists completion and hides onboarding on reload', () => {
    setAgent();
    const store = TestBed.inject(OnboardingStore);
    store.attach(AGENT);
    store.complete();

    const store2 = TestBed.inject(OnboardingStore);
    store2.attach(AGENT);
    expect(store2.shouldShow()).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).completed).toBe(true);
  });

  it('restart clears completed and dismissed flags', () => {
    setAgent();
    const store = TestBed.inject(OnboardingStore);
    store.attach(AGENT);
    store.dismiss();
    store.restart();
    expect(store.shouldShow()).toBe(true);
    expect(store.stepIndex()).toBe(0);
  });

  it('next advances the step index', () => {
    setAgent();
    const store = TestBed.inject(OnboardingStore);
    store.attach(AGENT);
    store.next();
    expect(store.stepIndex()).toBe(1);
  });
});
