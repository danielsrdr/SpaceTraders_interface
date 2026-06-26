import { mapContract, type ContractData } from '../../../models/contract.model';
import type { PlanetView } from '../../../models/system.model';
import { resolveSurfaceContractBeacons } from './surface-contract-beacons';
import type { SurfacePoiDefinition } from './surface-poi-registry';

function planet(name: string, traits: string[] = ['MARKETPLACE']): PlanetView {
  return {
    name,
    system: 'TEST',
    type: 'PLANET',
    position: { x: 0, y: 0 },
    traits: traits.map((symbol) => ({ symbol, name: symbol })),
  };
}

function contract(partial: Partial<ContractData> & { id: string }): ReturnType<typeof mapContract> {
  const { deliver, terms, ...rest } = partial;
  return mapContract({
    factionSymbol: 'CITY',
    type: 'TRANSPORT',
    accepted: true,
    fulfilled: false,
    expiration: '',
    deadlineToAccept: '',
    terms: {
      deadline: '',
      payment: { onAccepted: 0, onFulfilled: 1000 },
      deliver: terms?.deliver ?? deliver ?? [],
    },
    ...rest,
  });
}

describe('resolveSurfaceContractBeacons', () => {
  const pois: SurfacePoiDefinition[] = [
    { kind: 'market', label: 'Market', position: { x: 8, z: 8 }, priority: 80 },
    { kind: 'depot', label: 'Fuel Depot', position: { x: 0, z: -14 }, priority: 55 },
  ];

  it('creates deliver crate beacon for active delivery to planet', () => {
    const p = planet('TEST-1');
    const beacons = resolveSurfaceContractBeacons(
      [
        contract({
          id: 'c1',
          deliver: [
            {
              tradeSymbol: 'FOOD',
              destinationSymbol: 'TEST-1',
              unitsRequired: 5,
              unitsFulfilled: 2,
            },
          ],
        }),
      ],
      p,
      pois,
    );
    expect(beacons.some((b) => b.kind === 'deliver-crate' && b.tradeSymbol === 'FOOD')).toBe(true);
  });

  it('returns empty when no matching destination', () => {
    const beacons = resolveSurfaceContractBeacons(
      [
        contract({
          id: 'c2',
          deliver: [
            {
              tradeSymbol: 'FOOD',
              destinationSymbol: 'OTHER',
              unitsRequired: 1,
            },
          ],
        }),
      ],
      planet('TEST-1'),
      pois,
    );
    expect(beacons.length).toBe(0);
  });
});
