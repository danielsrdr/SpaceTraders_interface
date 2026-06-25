import type { TradeGoodType } from '../../models/system.model';

export type GoodCategory = 'fuel' | 'minerals' | 'chemicals' | 'food' | 'tech' | 'goods';

const CATEGORY_RULES: ReadonlyArray<{ category: GoodCategory; keywords: string[] }> = [
  { category: 'fuel', keywords: ['FUEL', 'HYDROGEN', 'HYDROCARBON'] },
  {
    category: 'minerals',
    keywords: [
      'ORE',
      'IRON',
      'COPPER',
      'ALUMINUM',
      'SILVER',
      'GOLD',
      'PLATINUM',
      'URANITE',
      'MERITIUM',
      'DIAMOND',
      'QUARTZ',
      'SILICON',
      'PRECIOUS',
      'STONE',
      'SAND',
      'GEMSTONE',
    ],
  },
  {
    category: 'chemicals',
    keywords: [
      'AMMONIA',
      'NITROGEN',
      'ICE',
      'WATER',
      'POLYNUCLEOTIDE',
      'PLASTIC',
      'BIOCOMPOSITE',
      'EXOTIC',
      'ANTIMATTER',
      'OXYGEN',
      'GAS',
    ],
  },
  {
    category: 'food',
    keywords: ['FOOD', 'FERTILIZER', 'MEDICINE', 'DRUGS', 'FABRIC', 'CLOTHING'],
  },
  {
    category: 'tech',
    keywords: [
      'MACHINERY',
      'ELECTRONIC',
      'MICROPROCESSOR',
      'CIRCUIT',
      'EQUIPMENT',
      'SHIP',
      'PART',
      'PLATING',
      'MODULE',
      'MOUNT',
      'INSTRUMENT',
      'MAINFRAME',
      'NANOBOT',
      'STABILIZER',
      'EMITTER',
      'REACTOR',
      'ENGINE',
      'PROCESSOR',
      'ROBOT',
      'DRONE',
    ],
  },
];

export function goodCategory(symbol: string): GoodCategory {
  const value = symbol.toUpperCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => value.includes(keyword))) {
      return rule.category;
    }
  }
  return 'goods';
}

export function goodLabel(symbol: string): string {
  return symbol
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Three.js hex color per good category, used to tint crates/goods in the 3D market. */
export const CATEGORY_COLORS: Record<GoodCategory, number> = {
  fuel: 0xf97316,
  minerals: 0x94a3b8,
  chemicals: 0x38bdf8,
  food: 0x84cc16,
  tech: 0xa855f7,
  goods: 0xfbbf24,
};

export function goodColor(symbol: string): number {
  return CATEGORY_COLORS[goodCategory(symbol)];
}

/** Color per trade direction: export=green, import=amber, exchange=cyan. */
export const TRADE_TYPE_COLORS: Record<TradeGoodType, number> = {
  EXPORT: 0x22c55e,
  IMPORT: 0xf59e0b,
  EXCHANGE: 0x22d3ee,
};

export function tradeTypeColor(type: TradeGoodType): number {
  return TRADE_TYPE_COLORS[type];
}

/** Number of crates to stack for a given supply level (1 = scarce, 6 = abundant). */
export function supplyToStack(supply?: string): number {
  switch ((supply ?? '').toUpperCase()) {
    case 'SCARCE':
      return 1;
    case 'LIMITED':
      return 2;
    case 'MODERATE':
      return 3;
    case 'HIGH':
      return 5;
    case 'ABUNDANT':
      return 6;
    default:
      return 2;
  }
}

/**
 * Normalize a market trade volume into a 0..1 intensity factor used to drive
 * stall sign height and point-light brightness. Typical volumes range up to a
 * few thousand units; we saturate well before that for readable contrast.
 */
export function volumeToIntensity(volume?: number): number {
  if (!volume || volume <= 0) return 0.15;
  return Math.min(1, Math.log10(volume + 1) / 3);
}
