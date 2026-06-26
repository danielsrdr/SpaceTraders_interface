import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  evaluateAchievement,
  ProgressSnapshot,
} from './achievements';

const EMPTY: ProgressSnapshot = {
  peakCredits: 0,
  lifetimeRevenue: 0,
  lifetimeFuelBurned: 0,
  routesFlown: 0,
  systemsVisited: 0,
  waypointTypesSeen: 0,
  factionsMet: 0,
  goodsSeen: 0,
  planetsLanded: 0,
  biomesSeen: 0,
  stormsWitnessed: 0,
  minesCompleted: 0,
};

describe('ACHIEVEMENTS catalog', () => {
  it('generates unique ids for every tier', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes First Million', () => {
    expect(ACHIEVEMENT_BY_ID.get('wealth-1000000')?.title).toBe('First Million');
  });
});

describe('evaluateAchievement', () => {
  it('unlocks when metric meets threshold', () => {
    const achievement = ACHIEVEMENT_BY_ID.get('explorer-50')!;
    const result = evaluateAchievement(achievement, { ...EMPTY, systemsVisited: 50 });
    expect(result.unlocked).toBe(true);
    expect(result.ratio).toBe(1);
  });

  it('reports partial progress when below threshold', () => {
    const achievement = ACHIEVEMENT_BY_ID.get('explorer-50')!;
    const result = evaluateAchievement(achievement, { ...EMPTY, systemsVisited: 25 });
    expect(result.unlocked).toBe(false);
    expect(result.ratio).toBe(0.5);
    expect(result.value).toBe(25);
  });

  it('evaluates peak credits for wealth tiers', () => {
    const achievement = ACHIEVEMENT_BY_ID.get('wealth-1000000')!;
    const locked = evaluateAchievement(achievement, { ...EMPTY, peakCredits: 999_999 });
    const unlocked = evaluateAchievement(achievement, { ...EMPTY, peakCredits: 1_000_000 });
    expect(locked.unlocked).toBe(false);
    expect(unlocked.unlocked).toBe(true);
  });

  it('unlocks footprinter at 1 planet landed', () => {
    const achievement = ACHIEVEMENT_BY_ID.get('footprinter-1')!;
    const result = evaluateAchievement(achievement, { ...EMPTY, planetsLanded: 1 });
    expect(result.unlocked).toBe(true);
  });
});
