import { SystemViewModeStore } from './system-view-mode.store';

describe('SystemViewModeStore', () => {
  let store: SystemViewModeStore;

  beforeEach(() => {
    store = new SystemViewModeStore();
  });

  it('starts in flight mode', () => {
    expect(store.viewMode()).toBe('flight');
  });

  it('transitions landing -> surface -> launch -> flight', () => {
    store.dispatch({ type: 'START_LANDING', planet: { name: 'X' } as never, pendingSteps: [] });
    expect(store.viewMode()).toBe('landing');

    store.dispatch({ type: 'LANDING_COMPLETE' });
    expect(store.viewMode()).toBe('surface');
    expect(store.surfaceEntryActive()).toBe(true);

    store.onSurfaceEntryComplete();
    expect(store.surfaceEntryActive()).toBe(false);

    store.dispatch({ type: 'EXIT_SURFACE' });
    expect(store.viewMode()).toBe('launch');

    store.dispatch({ type: 'LAUNCH_COMPLETE' });
    expect(store.viewMode()).toBe('flight');
  });

  it('resets to flight', () => {
    store.dispatch({ type: 'EXIT_SURFACE' });
    store.dispatch({ type: 'RESET_FLIGHT' });
    expect(store.viewMode()).toBe('flight');
    expect(store.pendingTravelSteps()).toEqual([]);
  });
});
