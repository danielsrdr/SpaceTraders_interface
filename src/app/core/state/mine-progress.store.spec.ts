import {
  clearMineProgressStorage,
  getMineProgress,
  initMineProgress,
  mineProgressPercent,
  recordOreBroken,
} from './mine-progress.store';

describe('mine-progress.store', () => {
  beforeEach(() => {
    clearMineProgressStorage();
  });

  it('persists broken ore keys per planet', () => {
    initMineProgress('Ore-Prime', 10);
    recordOreBroken('Ore-Prime', '1,2,3', 10);
    recordOreBroken('Ore-Prime', '4,5,6', 10);

    const progress = getMineProgress('Ore-Prime');
    expect(progress?.oresBroken).toBe(2);
    expect(mineProgressPercent(progress)).toBe(20);
  });

  it('does not double-count the same block key', () => {
    initMineProgress('Ore-Prime', 5);
    recordOreBroken('Ore-Prime', '1,1,1', 5);
    recordOreBroken('Ore-Prime', '1,1,1', 5);
    expect(getMineProgress('Ore-Prime')?.oresBroken).toBe(1);
  });
});
