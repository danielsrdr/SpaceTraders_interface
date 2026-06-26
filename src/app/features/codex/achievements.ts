/** Aggregated progression facts an achievement is evaluated against. */
export interface ProgressSnapshot {
  peakCredits: number;
  lifetimeRevenue: number;
  lifetimeFuelBurned: number;
  routesFlown: number;
  systemsVisited: number;
  waypointTypesSeen: number;
  factionsMet: number;
  goodsSeen: number;
}

export interface Achievement {
  id: string;
  family: string;
  color: string;
  tier: number;
  title: string;
  description: string;
  threshold: number;
  metric: (snapshot: ProgressSnapshot) => number;
}

export interface AchievementProgress {
  achievement: Achievement;
  value: number;
  ratio: number;
  unlocked: boolean;
}

interface FamilyTier {
  threshold: number;
  title: string;
  description: string;
}

interface FamilyDef {
  family: string;
  color: string;
  metric: (snapshot: ProgressSnapshot) => number;
  tiers: FamilyTier[];
}

const FAMILIES: FamilyDef[] = [
  {
    family: 'wealth',
    color: '#34d399',
    metric: (s) => s.peakCredits,
    tiers: [
      { threshold: 100_000, title: 'Getting Started', description: 'Hold 100,000 credits at once.' },
      { threshold: 1_000_000, title: 'First Million', description: 'Amass a fortune of 1,000,000 credits.' },
      { threshold: 10_000_000, title: 'Tycoon', description: 'Hold 10,000,000 credits at once.' },
      { threshold: 100_000_000, title: 'Magnate', description: 'Command 100,000,000 credits.' },
    ],
  },
  {
    family: 'revenue',
    color: '#fbbf24',
    metric: (s) => s.lifetimeRevenue,
    tiers: [
      { threshold: 50_000, title: 'Open for Business', description: 'Earn 50,000 credits in lifetime revenue.' },
      { threshold: 1_000_000, title: 'Trade Baron', description: 'Earn 1,000,000 credits in lifetime revenue.' },
      { threshold: 25_000_000, title: 'Merchant Lord', description: 'Earn 25,000,000 credits in lifetime revenue.' },
    ],
  },
  {
    family: 'explorer',
    color: '#38bdf8',
    metric: (s) => s.systemsVisited,
    tiers: [
      { threshold: 5, title: 'Wayfarer', description: 'Visit 5 different systems.' },
      { threshold: 10, title: 'Voyager', description: 'Visit 10 different systems.' },
      { threshold: 50, title: 'Pathfinder', description: 'Visit 50 different systems.' },
      { threshold: 100, title: 'Starfarer', description: 'Visit 100 different systems.' },
    ],
  },
  {
    family: 'cartographer',
    color: '#a78bfa',
    metric: (s) => s.waypointTypesSeen,
    tiers: [
      { threshold: 5, title: 'Surveyor', description: 'Chart 5 different waypoint types.' },
      { threshold: 10, title: 'Cartographer', description: 'Chart 10 different waypoint types.' },
      { threshold: 15, title: 'Master Cartographer', description: 'Chart 15 different waypoint types.' },
    ],
  },
  {
    family: 'diplomat',
    color: '#f472b6',
    metric: (s) => s.factionsMet,
    tiers: [
      { threshold: 3, title: 'Envoy', description: 'Encounter 3 different factions.' },
      { threshold: 7, title: 'Diplomat', description: 'Encounter 7 different factions.' },
      { threshold: 12, title: 'Ambassador', description: 'Encounter 12 different factions.' },
    ],
  },
  {
    family: 'trader',
    color: '#f59e0b',
    metric: (s) => s.goodsSeen,
    tiers: [
      { threshold: 5, title: 'Peddler', description: 'Catalog 5 different trade goods.' },
      { threshold: 20, title: 'Trader', description: 'Catalog 20 different trade goods.' },
      { threshold: 40, title: 'Quartermaster', description: 'Catalog 40 different trade goods.' },
    ],
  },
  {
    family: 'navigator',
    color: '#22d3ee',
    metric: (s) => s.routesFlown,
    tiers: [
      { threshold: 10, title: 'Helmsman', description: 'Complete 10 journeys between waypoints.' },
      { threshold: 100, title: 'Navigator', description: 'Complete 100 journeys between waypoints.' },
      { threshold: 500, title: 'Road Warrior', description: 'Complete 500 journeys between waypoints.' },
    ],
  },
  {
    family: 'fuel',
    color: '#fb923c',
    metric: (s) => s.lifetimeFuelBurned,
    tiers: [
      { threshold: 1_000, title: 'Burning Fuel', description: 'Burn 1,000 units of fuel.' },
      { threshold: 25_000, title: 'Gas Guzzler', description: 'Burn 25,000 units of fuel.' },
      { threshold: 250_000, title: 'Fuel Furnace', description: 'Burn 250,000 units of fuel.' },
    ],
  },
];

/** All achievements, generated from the tiered family templates. */
export const ACHIEVEMENTS: Achievement[] = FAMILIES.flatMap((family) =>
  family.tiers.map((tier, index) => ({
    id: `${family.family}-${tier.threshold}`,
    family: family.family,
    color: family.color,
    tier: index + 1,
    title: tier.title,
    description: tier.description,
    threshold: tier.threshold,
    metric: family.metric,
  })),
);

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function evaluateAchievement(achievement: Achievement, snapshot: ProgressSnapshot): AchievementProgress {
  const value = achievement.metric(snapshot);
  const ratio = achievement.threshold > 0 ? Math.min(1, value / achievement.threshold) : 0;
  return { achievement, value, ratio, unlocked: value >= achievement.threshold };
}
