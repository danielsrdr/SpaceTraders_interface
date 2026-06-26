import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { MarketData, TradeGoodType } from '../../../models/system.model';
import {
  goodColor,
  goodLabel,
  supplyToStack,
  tradeTypeColor,
  volumeToIntensity,
} from '../trade-good-visuals';
import type { SurfaceCollider } from './surface-collider-registry';

export interface MarketStallAnchor {
  symbol: string;
  type: TradeGoodType;
  position: Vector3;
}

export interface MarketBuildResult {
  group: Group;
  stalls: MarketStallAnchor[];
  colliders: SurfaceCollider[];
}

// Stall counter footprint (BoxGeometry 2.4 x 1 x 1.4) sitting on the 0.35-high
// platform, padded slightly to cover legs and crates.
const STALL_HALF_X = 1.3;
const STALL_HALF_Z = 0.9;
const STALL_BASE_Y = 0.35;
const STALL_TOP_Y = 1.35;

interface StallGood {
  symbol: string;
  type: TradeGoodType;
  tradeVolume?: number;
  supply?: string;
  purchasePrice?: number;
  sellPrice?: number;
}

const COLUMNS = 4;
const CELL = 3.6;

function normalizeGoods(market: MarketData | null): StallGood[] {
  if (!market) return [];
  if (market.tradeGoods?.length) {
    return market.tradeGoods.map((g) => ({
      symbol: g.symbol,
      type: g.type,
      tradeVolume: g.tradeVolume,
      supply: typeof g.supply === 'string' ? g.supply : undefined,
      purchasePrice: g.purchasePrice,
      sellPrice: g.sellPrice,
    }));
  }
  const fromList = (list: { symbol: string }[], type: TradeGoodType): StallGood[] =>
    list.map((g) => ({ symbol: g.symbol, type }));
  return [
    ...fromList(market.exports, 'EXPORT'),
    ...fromList(market.imports, 'IMPORT'),
    ...fromList(market.exchange, 'EXCHANGE'),
  ];
}

function makePriceSprite(good: StallGood): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const hex = '#' + new Color(tradeTypeColor(good.type)).getHexString();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(goodLabel(good.symbol).slice(0, 16), canvas.width / 2, 42);

  ctx.font = '600 22px sans-serif';
  ctx.fillStyle = hex;
  ctx.fillText(good.type, canvas.width / 2, 72);

  if (good.purchasePrice != null || good.sellPrice != null) {
    ctx.font = '600 24px monospace';
    ctx.fillStyle = '#e2e8f0';
    const buy = good.purchasePrice != null ? `B ${good.purchasePrice}` : '';
    const sell = good.sellPrice != null ? `S ${good.sellPrice}` : '';
    ctx.fillText([buy, sell].filter(Boolean).join('   '), canvas.width / 2, 106);
  }

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.scale.set(4, 2, 1);
  return sprite;
}

function buildStall(local: Vector3, good: StallGood): Group {
  const stall = new Group();
  stall.name = `stall-${good.symbol}`;
  stall.position.copy(local);

  const typeColor = tradeTypeColor(good.type);
  const intensity = volumeToIntensity(good.tradeVolume);

  const woodMat = new MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
  const counter = new Mesh(new BoxGeometry(2.4, 1, 1.4), woodMat);
  counter.position.set(0, 0.5, 0);
  counter.castShadow = true;
  stall.add(counter);

  const signHeight = 0.4 + intensity * 1.6;
  const signMat = new MeshStandardMaterial({
    color: typeColor,
    emissive: new Color(typeColor),
    emissiveIntensity: 0.6 + intensity * 1.6,
  });
  const sign = new Mesh(new BoxGeometry(2.4, signHeight, 0.18), signMat);
  sign.position.set(0, 1 + signHeight / 2 + 0.6, -0.6);
  // Tagged so the surface day/night cycle can boost the glow after dusk.
  sign.userData['nightGlow'] = signMat.emissiveIntensity;
  stall.add(sign);

  const post = new MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  for (const px of [-1.05, 1.05]) {
    const leg = new Mesh(new BoxGeometry(0.16, 1.6, 0.16), post);
    leg.position.set(px, 0.8, -0.6);
    stall.add(leg);
  }

  const crateColor = goodColor(good.symbol);
  const crateMat = new MeshStandardMaterial({ color: crateColor, roughness: 0.7 });
  const crates = supplyToStack(good.supply);
  for (let i = 0; i < crates; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const crate = new Mesh(new BoxGeometry(0.55, 0.55, 0.55), crateMat);
    crate.position.set(-0.35 + col * 0.7, 1.3 + row * 0.6, 0.1);
    crate.castShadow = true;
    stall.add(crate);
  }

  const light = new PointLight(typeColor, 0.6 + intensity * 2.2, 8);
  light.position.set(0, 2.6, 0.4);
  // Tagged so the surface day/night cycle ramps the stall lamps on after dusk.
  light.userData['nightLight'] = light.intensity;
  stall.add(light);

  const priceSprite = makePriceSprite(good);
  priceSprite.position.set(0, 3.7, 0);
  stall.add(priceSprite);

  return stall;
}

function marketGroup(
  originX: number,
  originZ: number,
  groundY: number,
  market: MarketData | null,
): MarketBuildResult {
  const group = new Group();
  group.name = 'market-structures';
  group.position.set(originX, groundY, originZ);

  const darkMat = new MeshStandardMaterial({
    color: 0x1e293b,
    emissive: new Color(0x0ea5e9),
    emissiveIntensity: 0.2,
  });

  const goods = normalizeGoods(market);
  const cols = Math.min(COLUMNS, Math.max(1, goods.length));
  const rows = Math.max(1, Math.ceil(goods.length / cols));
  const width = cols * CELL + 2;
  const depth = rows * CELL + 2;

  const platform = new Mesh(new BoxGeometry(width, 0.35, depth), darkMat);
  platform.position.set(width / 2 - 1, 0.18, depth / 2 - 1);
  platform.receiveShadow = true;
  group.add(platform);

  const stalls: MarketStallAnchor[] = [];
  const colliders: SurfaceCollider[] = [];

  goods.forEach((good, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const localX = col * CELL;
    const localZ = row * CELL;
    const local = new Vector3(localX, 0.35, localZ);
    group.add(buildStall(local, good));
    stalls.push({
      symbol: good.symbol,
      type: good.type,
      position: new Vector3(originX + localX, groundY + 1, originZ + localZ),
    });
    const worldX = originX + localX;
    const worldZ = originZ + localZ;
    colliders.push({
      kind: 'box',
      minX: worldX - STALL_HALF_X,
      maxX: worldX + STALL_HALF_X,
      minZ: worldZ - STALL_HALF_Z,
      maxZ: worldZ + STALL_HALF_Z,
      baseY: groundY + STALL_BASE_Y,
      topY: groundY + STALL_TOP_Y,
    });
  });

  if (!goods.length) {
    const beacon = new PointLight(0x22d3ee, 1.5, 16);
    beacon.position.set(width / 2, 3, depth / 2);
    beacon.userData['nightLight'] = beacon.intensity;
    group.add(beacon);
  }

  return { group, stalls, colliders };
}

export function buildMarketStructuresAt(
  originX: number,
  originZ: number,
  groundY = 0,
  market: MarketData | null = null,
): MarketBuildResult {
  return marketGroup(originX, originZ, groundY, market);
}

/** @deprecated Mine surface props are built via mine-pit.builder */
export function buildMineStructuresAt(_originX: number, _originZ: number): Group {
  return new Group();
}

/** @deprecated */
export function buildMineStructures(): Group {
  return new Group();
}
