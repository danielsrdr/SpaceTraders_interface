import {
  caveProgressPercent,
  clearCaveProgressStorage,
  getCaveProgress,
  initCaveProgress,
  recordCrystalBroken,
} from './cave-progress.store';

describe('cave-progress.store', () => {
  beforeEach(() => {
    clearCaveProgressStorage();
  });

  it('persists broken crystal keys per planet', () => {
    initCaveProgress('Crystal-Prime', 10);
    recordCrystalBroken('Crystal-Prime', '1,2,3', 10);
    recordCrystalBroken('Crystal-Prime', '4,5,6', 10);

    const progress = getCaveProgress('Crystal-Prime');
    expect(progress?.crystalsBroken).toBe(2);
    expect(caveProgressPercent(progress)).toBe(20);
  });

  it('does not double-count the same block key', () => {
    initCaveProgress('Crystal-Prime', 5);
    recordCrystalBroken('Crystal-Prime', '1,1,1', 5);
    recordCrystalBroken('Crystal-Prime', '1,1,1', 5);
    expect(getCaveProgress('Crystal-Prime')?.crystalsBroken).toBe(1);
  });
});
