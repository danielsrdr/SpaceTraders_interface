export type CockpitTab = 'nav' | 'market' | 'yard' | 'gate' | 'scan' | 'cargo';

export const COCKPIT_TABS: ReadonlyArray<{ id: CockpitTab; label: string }> = [
  { id: 'nav', label: 'Nav' },
  { id: 'market', label: 'Market' },
  { id: 'yard', label: 'Yard' },
  { id: 'gate', label: 'Gate' },
  { id: 'scan', label: 'Scan' },
  { id: 'cargo', label: 'Cargo' },
];
