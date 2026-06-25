export type ShipModalTab =
  | 'reg'
  | 'nav'
  | 'crew'
  | 'frame'
  | 'react'
  | 'fuel'
  | 'cargo'
  | 'maint'
  | 'upgrades'
  | 'refine'
  | null;

export type ShipHotspotName =
  | 'hotspot-reg'
  | 'hotspot-nav'
  | 'hotspot-crew'
  | 'hotspot-frame'
  | 'hotspot-reactor'
  | 'hotspot-fuel'
  | 'hotspot-cargo';

export const HOTSPOT_TO_MODAL: Record<ShipHotspotName, Exclude<ShipModalTab, null>> = {
  'hotspot-reg': 'reg',
  'hotspot-nav': 'nav',
  'hotspot-crew': 'crew',
  'hotspot-frame': 'frame',
  'hotspot-reactor': 'react',
  'hotspot-fuel': 'fuel',
  'hotspot-cargo': 'cargo',
};

export const HOTSPOT_LABELS: Record<ShipHotspotName, string> = {
  'hotspot-reg': 'Registration',
  'hotspot-nav': 'Navigation',
  'hotspot-crew': 'Crew',
  'hotspot-frame': 'Frame',
  'hotspot-reactor': 'Reactor',
  'hotspot-fuel': 'Fuel',
  'hotspot-cargo': 'Cargo',
};

export function resolveHotspotTab(name: string): Exclude<ShipModalTab, null> | null {
  if (name in HOTSPOT_TO_MODAL) {
    return HOTSPOT_TO_MODAL[name as ShipHotspotName];
  }
  return null;
}

export function resolveHotspotLabel(name: string): string | null {
  if (name in HOTSPOT_LABELS) {
    return HOTSPOT_LABELS[name as ShipHotspotName];
  }
  return null;
}

export const MODAL_TAB_LABELS: Record<Exclude<ShipModalTab, null>, string> = {
  reg: 'Registration',
  nav: 'Navigation',
  crew: 'Crew',
  frame: 'Frame',
  react: 'Reactor',
  fuel: 'Fuel',
  cargo: 'Cargo',
  maint: 'Maintenance',
  upgrades: 'Upgrades',
  refine: 'Refine',
};

export function formatCooldown(cooldown: {
  remainingSeconds?: number;
  totalSeconds?: number;
  expiration?: string;
} | null): string {
  if (!cooldown) return 'No active cooldown';
  const remaining = cooldown.remainingSeconds ?? 0;
  if (remaining <= 0) return 'Cooldown expired';
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return mins > 0 ? `${mins}m ${secs}s remaining` : `${secs}s remaining`;
}

export function formatCondition(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatFuel(current: number, capacity: number): string {
  if (capacity <= 0) return `${current}`;
  return `${current} / ${capacity} (${Math.round((current / capacity) * 100)}%)`;
}
