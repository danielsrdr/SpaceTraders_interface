export type FactionTier = 'unknown' | 'contact' | 'trusted' | 'inner_circle';

export type ContractDirectorEvent = 'accept' | 'deliver' | 'fulfill';

export interface MissionBriefing {
  id: string;
  title: string;
  stakes: string;
  debrief: string;
  voiceLine: string;
}

export interface FactionStanding {
  factionSymbol: string;
  points: number;
  tier: FactionTier;
  contractsFulfilled: number;
  contractsAccepted: number;
}

export interface DirectorBeat {
  contractType: string;
  briefingId: string;
  debriefId: string;
}

export interface MissionArc {
  id: string;
  factionSymbol: string;
  title: string;
  beats: DirectorBeat[];
}

export interface CompletedOperation {
  contractId: string;
  factionSymbol: string;
  contractType: string;
  briefingTitle: string;
  debrief: string;
  fulfilledAt: number;
  arcId?: string;
}

export interface MissionDirectorState {
  standings: Record<string, FactionStanding>;
  activeArcId: string | null;
  completedArcs: string[];
  operations: CompletedOperation[];
  dismissedBriefings: string[];
}

export const TIER_THRESHOLDS: Record<FactionTier, number> = {
  unknown: 0,
  contact: 10,
  trusted: 80,
  inner_circle: 200,
};

export function tierFromPoints(points: number): FactionTier {
  if (points >= TIER_THRESHOLDS.inner_circle) return 'inner_circle';
  if (points >= TIER_THRESHOLDS.trusted) return 'trusted';
  if (points >= TIER_THRESHOLDS.contact) return 'contact';
  return 'unknown';
}

export function tierLabel(tier: FactionTier): string {
  switch (tier) {
    case 'unknown':
      return 'Unknown';
    case 'contact':
      return 'Contact';
    case 'trusted':
      return 'Trusted';
    case 'inner_circle':
      return 'Inner Circle';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export const POINTS_BY_EVENT: Record<ContractDirectorEvent, number> = {
  accept: 10,
  deliver: 30,
  fulfill: 50,
};
