import { describe, expect, it } from 'vitest';
import type { MarketData } from '../../models/system.model';
import { hasTrait } from '../../models/system.model';
import type { PlanetView } from '../../models/system.model';

/** Pure aggregation helper tested without DI. */
function aggregateQuotes(
  systemSymbol: string,
  planets: PlanetView[],
  markets: MarketData[],
  symbols?: string[],
) {
  const sellMap = new Map<string, { waypoint: string; price: number; supply: string }>();
  const buyMap = new Map<string, { waypoint: string; price: number }>();

  for (const data of markets) {
    for (const good of data.tradeGoods ?? []) {
      if (symbols?.length && !symbols.includes(good.symbol)) continue;
      if (good.sellPrice > 0) {
        const prev = sellMap.get(good.symbol);
        if (!prev || good.sellPrice > prev.price) {
          sellMap.set(good.symbol, {
            waypoint: data.symbol,
            price: good.sellPrice,
            supply: String(good.supply),
          });
        }
      }
      if (good.purchasePrice > 0) {
        const prev = buyMap.get(good.symbol);
        if (!prev || good.purchasePrice < prev.price) {
          buyMap.set(good.symbol, { waypoint: data.symbol, price: good.purchasePrice });
        }
      }
    }
  }

  const allSymbols = symbols?.length ? symbols : [...new Set([...sellMap.keys(), ...buyMap.keys()])];
  return allSymbols.map((tradeSymbol) => {
    const bestSell = sellMap.get(tradeSymbol) ?? null;
    const bestBuy = buyMap.get(tradeSymbol) ?? null;
    const spread = bestSell && bestBuy ? bestSell.price - bestBuy.price : null;
    return { tradeSymbol, bestSell, bestBuy, spread };
  });
}

describe('price aggregation', () => {
  const planets: PlanetView[] = [
    {
      name: 'X1-MKT',
      system: 'X1',
      type: 'ORBITAL_STATION',
      traits: [{ symbol: 'MARKETPLACE', name: 'Marketplace', description: '' }],
      position: { x: 0, y: 0 },
    },
    {
      name: 'X1-MKT2',
      system: 'X1',
      type: 'ORBITAL_STATION',
      traits: [{ symbol: 'MARKETPLACE', name: 'Marketplace', description: '' }],
      position: { x: 1, y: 1 },
    },
  ];

  it('picks highest sell and lowest buy', () => {
    const markets: MarketData[] = [
      {
        symbol: 'X1-MKT',
        exports: [],
        imports: [],
        exchange: [],
        tradeGoods: [
          { symbol: 'IRON_ORE', type: 'EXPORT', purchasePrice: 10, sellPrice: 20, supply: 'MODERATE', tradeVolume: 1 },
        ],
      },
      {
        symbol: 'X1-MKT2',
        exports: [],
        imports: [],
        exchange: [],
        tradeGoods: [
          { symbol: 'IRON_ORE', type: 'EXPORT', purchasePrice: 8, sellPrice: 25, supply: 'HIGH', tradeVolume: 1 },
        ],
      },
    ];

    const quotes = aggregateQuotes(
      'X1',
      planets.filter((p) => hasTrait(p, 'MARKETPLACE')),
      markets,
      ['IRON_ORE'],
    );
    expect(quotes[0]?.bestSell?.waypoint).toBe('X1-MKT2');
    expect(quotes[0]?.bestSell?.price).toBe(25);
    expect(quotes[0]?.bestBuy?.waypoint).toBe('X1-MKT2');
    expect(quotes[0]?.bestBuy?.price).toBe(8);
    expect(quotes[0]?.spread).toBe(17);
  });
});
