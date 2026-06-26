import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { MineTunnelManager } from './mine-tunnel.manager';

export type MineCartState = 'idle' | 'loaded' | 'moving';

const CART_SPEED = 3;

export class MineCart {
  readonly root = new Group();
  private state: MineCartState = 'idle';
  private railZ = 0;
  private readonly bounds: ReturnType<MineTunnelManager['getRailBounds']>;

  constructor(tunnels: MineTunnelManager) {
    this.bounds = tunnels.getRailBounds();
    this.root.name = 'mine-cart';

    const body = new Mesh(
      new BoxGeometry(1.2, 0.8, 1.6),
      new MeshStandardMaterial({ color: 0x78716c, metalness: 0.5, flatShading: true }),
    );
    body.position.y = 0.4;
    body.castShadow = true;
    this.root.add(body);

    const cargo = new Mesh(
      new BoxGeometry(0.9, 0.5, 0.9),
      new MeshStandardMaterial({
        color: 0xb45309,
        emissive: 0x92400e,
        emissiveIntensity: 0.4,
        flatShading: true,
      }),
    );
    cargo.name = 'cart-cargo';
    cargo.position.set(0, 0.9, 0);
    cargo.visible = false;
    this.root.add(cargo);

    this.syncPosition();
  }

  get cartState(): MineCartState {
    return this.state;
  }

  load(): void {
    if (this.state !== 'idle') return;
    this.state = 'loaded';
    const cargo = this.root.getObjectByName('cart-cargo');
    if (cargo) cargo.visible = true;
  }

  tryPush(playerX: number, playerZ: number): boolean {
    const dist = Math.hypot(playerX - this.root.position.x, playerZ - this.root.position.z);
    if (dist > 2.5) return false;
    if (this.state === 'idle') {
      this.load();
      return true;
    }
    return false;
  }

  update(delta: number): boolean {
    if (this.state !== 'loaded' && this.state !== 'moving') return false;

    if (this.state === 'loaded') {
      this.state = 'moving';
    }

    this.railZ += CART_SPEED * delta;
    const span = this.bounds.zEnd - this.bounds.zStart;
    if (this.railZ >= span) {
      this.railZ = span;
      this.state = 'idle';
      const cargo = this.root.getObjectByName('cart-cargo');
      if (cargo) cargo.visible = false;
      this.syncPosition();
      return true;
    }

    this.syncPosition();
    return false;
  }

  reset(): void {
    this.state = 'idle';
    this.railZ = 0;
    const cargo = this.root.getObjectByName('cart-cargo');
    if (cargo) cargo.visible = false;
    this.syncPosition();
  }

  private syncPosition(): void {
    this.root.position.set(
      this.bounds.centerX,
      this.bounds.floorY + 0.5,
      this.bounds.zStart + this.railZ,
    );
  }
}

export function createMineCart(tunnels: MineTunnelManager | null): MineCart | null {
  if (!tunnels) return null;
  tunnels.ensureBuilt();
  return new MineCart(tunnels);
}
