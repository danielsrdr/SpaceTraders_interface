import { ContractView } from '../../../models/contract.model';
import { PlanetView, hasTrait } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import type { SurfaceZoneKind } from './system-view-mode';
import type { SurfacePoiDefinition } from './surface-poi-registry';

export interface SurfaceContractBeacon {
  contractId: string;
  kind: 'deliver-crate' | 'survey-ruins';
  poiKind: SurfaceZoneKind;
  tradeSymbol?: string;
  unitsRemaining?: number;
  label: string;
}

function unitsRemaining(deliverable: {
  unitsRequired: number;
  unitsFulfilled?: number;
}): number {
  return deliverable.unitsRequired - (deliverable.unitsFulfilled ?? 0);
}

function poiForKind(pois: SurfacePoiDefinition[], kind: SurfaceZoneKind): SurfacePoiDefinition | null {
  return pois.find((p) => p.kind === kind) ?? null;
}

/** Cross-reference active delivery contracts with surface POIs on the current waypoint. */
export function resolveSurfaceContractBeacons(
  contracts: ContractView[],
  planet: PlanetView,
  pois: SurfacePoiDefinition[],
): SurfaceContractBeacon[] {
  const active = contracts.filter((c) => c.accepted && !c.fulfilled);
  const beacons: SurfaceContractBeacon[] = [];
  const seen = new Set<string>();

  for (const contract of active) {
    for (const deliverable of contract.deliver) {
      const remaining = unitsRemaining(deliverable);
      if (remaining <= 0) continue;
      if (deliverable.destinationSymbol !== planet.name) continue;

      const depot = poiForKind(pois, 'depot');
      const market = poiForKind(pois, 'market');
      const anchor = depot ?? market;
      if (!anchor) continue;

      const key = `deliver:${contract.id}:${deliverable.tradeSymbol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      beacons.push({
        contractId: contract.id,
        kind: 'deliver-crate',
        poiKind: anchor.kind,
        tradeSymbol: deliverable.tradeSymbol,
        unitsRemaining: remaining,
        label: `Deliver ${deliverable.tradeSymbol}`,
      });
    }

    const hasRuins = pois.some((p) => p.kind === 'ruins');
    const isArtifact =
      hasRuins ||
      hasTrait(planet, 'ARTIFACT') ||
      resolveWaypointType(planet.type) === 'ARTIFACT' ||
      resolveWaypointType(planet.type) === 'DEBRIS_FIELD';

    const surveyMatch =
      contract.type.toUpperCase().includes('SURVEY') ||
      contract.deliver.some((d) => d.destinationSymbol === planet.name);

    if (isArtifact && hasRuins && surveyMatch) {
      const key = `survey:${contract.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        beacons.push({
          contractId: contract.id,
          kind: 'survey-ruins',
          poiKind: 'ruins',
          label: 'Survey artifact site',
        });
      }
    }
  }

  return beacons;
}

export function beaconPositionForPoi(
  poi: SurfacePoiDefinition,
  baseY: number,
): { x: number; y: number; z: number } {
  const { x, z } = poi.position;
  switch (poi.kind) {
    case 'market':
      return { x: x + 3, y: baseY + 0.6, z: z + 3 };
    case 'depot':
      return { x: x + 1, y: baseY + 0.5, z: z + 1 };
    case 'ruins':
      return { x, y: baseY + 0.4, z };
    default:
      return { x, y: baseY + 0.5, z };
  }
}
