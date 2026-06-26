export interface WaypointCodexEntry {
  type: string;
  label: string;
  description: string;
}

/** Canonical waypoint types with codex flavor text, ordered for display. */
export const WAYPOINT_CODEX: WaypointCodexEntry[] = [
  { type: 'PLANET', label: 'Planet', description: 'Habitable worlds and industrial cores — the backbone of any economy.' },
  { type: 'GAS_GIANT', label: 'Gas Giant', description: 'Vast bands of swirling gas; prime sites for siphoning volatiles.' },
  { type: 'MOON', label: 'Moon', description: 'Cratered satellites orbiting larger bodies, often rich in minerals.' },
  { type: 'ORBITAL_STATION', label: 'Orbital Station', description: 'Crewed orbital hubs offering markets, shipyards and repairs.' },
  { type: 'FUEL_STATION', label: 'Fuel Station', description: 'Remote refuelling depots that keep long hauls alive.' },
  { type: 'JUMP_GATE', label: 'Jump Gate', description: 'Ancient gateways linking distant systems across the void.' },
  { type: 'ASTEROID', label: 'Asteroid', description: 'Lone rocks drifting in the dark, waiting to be mined.' },
  { type: 'ASTEROID_FIELD', label: 'Asteroid Field', description: "Dense belts of tumbling ore — a miner's paradise." },
  { type: 'ASTEROID_BASE', label: 'Asteroid Base', description: 'Fortified outposts carved into asteroid rock.' },
  { type: 'ENGINEERED_ASTEROID', label: 'Engineered Asteroid', description: 'Artificially shaped asteroids with refined, concentrated resources.' },
  { type: 'NEBULA', label: 'Nebula', description: 'Glowing clouds of interstellar gas and luminous dust.' },
  { type: 'DEBRIS_FIELD', label: 'Debris Field', description: 'Scattered wreckage and salvage from forgotten conflicts.' },
  { type: 'GRAVITY_WELL', label: 'Gravity Well', description: 'A collapsed mass bending space itself — approach with caution.' },
  { type: 'ARTIFICIAL_GRAVITY_WELL', label: 'Artificial Gravity Well', description: 'Engineered singularities of unknown and unsettling origin.' },
  { type: 'ARTIFACT', label: 'Artifact', description: 'Mysterious relics left by a long-vanished civilization.' },
];

/**
 * Curated set of well-known trade goods for the codex. Any other goods the
 * player actually encounters are merged in at runtime, so this list only needs
 * to seed the "locked" entries that hint at what is out there to discover.
 */
export const GOODS_CODEX: string[] = [
  'PRECIOUS_STONES',
  'QUARTZ_SAND',
  'SILICON_CRYSTALS',
  'AMMONIA_ICE',
  'LIQUID_HYDROGEN',
  'LIQUID_NITROGEN',
  'ICE_WATER',
  'EXOTIC_MATTER',
  'ADVANCED_CIRCUITRY',
  'GRAVITON_EMITTERS',
  'IRON',
  'IRON_ORE',
  'COPPER',
  'COPPER_ORE',
  'ALUMINUM',
  'ALUMINUM_ORE',
  'SILVER',
  'SILVER_ORE',
  'GOLD',
  'GOLD_ORE',
  'PLATINUM',
  'PLATINUM_ORE',
  'DIAMONDS',
  'URANITE',
  'MERITIUM',
  'HYDROCARBON',
  'ANTIMATTER',
  'FERTILIZERS',
  'FABRICS',
  'FOOD',
  'JEWELRY',
  'MACHINERY',
  'FIREARMS',
  'ASSAULT_RIFLES',
  'MILITARY_EQUIPMENT',
  'EXPLOSIVES',
  'LAB_INSTRUMENTS',
  'AMMUNITION',
  'ELECTRONICS',
  'SHIP_PLATING',
  'SHIP_PARTS',
  'EQUIPMENT',
  'FUEL',
  'MEDICINE',
  'CLOTHING',
  'MICROPROCESSORS',
  'PLASTICS',
  'POLYNUCLEOTIDES',
  'BIOCOMPOSITES',
  'QUANTUM_STABILIZERS',
  'NANOBOTS',
  'AI_MAINFRAMES',
  'QUANTUM_DRIVES',
  'ROBOTIC_DRONES',
  'CYBER_IMPLANTS',
  'GENE_THERAPEUTICS',
  'NEURAL_CHIPS',
  'MICRO_FUSION_GENERATORS',
  'SUPERGRAINS',
  'LASER_RIFLES',
  'HOLOGRAPHICS',
  'SHIP_SALVAGE',
  'RELIC_TECH',
  'NOVEL_LIFEFORMS',
  'BOTANICAL_SPECIMENS',
  'CULTURAL_ARTIFACTS',
];

export interface SurfaceBiomeCodexEntry {
  id: string;
  label: string;
  description: string;
}

export const SURFACE_BIOME_CODEX: SurfaceBiomeCodexEntry[] = [
  { id: 'jungle', label: 'Jungle', description: 'Dense canopy biomes with high moisture and thick undergrowth.' },
  { id: 'industrial', label: 'Industrial', description: 'Scarred terrain near extraction sites and freight corridors.' },
  { id: 'desert', label: 'Desert', description: 'Open dunes and dry basins swept by wind.' },
  { id: 'rocky', label: 'Rocky', description: 'Bare stone ridges and fractured highlands.' },
  { id: 'sand', label: 'Sand', description: 'Fine regolith plains common on arid or atmospheric moons.' },
];
