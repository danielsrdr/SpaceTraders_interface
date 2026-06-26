export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector to highlight, or null for centered modal */
  target?: string | null;
  route?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome, agent',
    body: 'Skamkraft links your fleet to the SpaceTraders network. This brief tour covers the essentials.',
    target: null,
  },
  {
    id: 'palette',
    title: 'Command palette',
    body: 'Press Ctrl+K (Cmd+K on Mac) to jump anywhere or run ship commands — faster than the radial nav wheel.',
    target: '.sk-wheel',
  },
  {
    id: 'systems',
    title: 'Systems map',
    body: 'Your fleet lives here. Navigate, trade, extract, and land on planetary surfaces.',
    target: null,
    route: '/systems',
  },
  {
    id: 'contracts',
    title: 'Contracts',
    body: 'Accept your first contract to unlock the Factions registry and start earning credits.',
    target: null,
    route: '/contracts',
  },
  {
    id: 'codex',
    title: 'Codex',
    body: 'Chart waypoints, factions, and goods as you discover them. Locked entries show hints for how to unlock them.',
    target: null,
    route: '/codex',
  },
  {
    id: 'logbook',
    title: 'Log & alerts',
    body: 'The Log button opens your ship\'s journal. The Alerts bell keeps a history of arrivals, contracts, and milestones.',
    target: null,
  },
  {
    id: 'done',
    title: 'Ready to fly',
    body: 'Press ? anytime for keyboard shortcuts. Good hunting, captain.',
    target: null,
  },
];
