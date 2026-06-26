import { PerspectiveCamera, Vector3 } from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { SurfaceCollision } from './surface-collision';
import { isSteepTerrainBlocked } from './surface-collision';

export interface FpsControlState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface FpsCollisionMode {
  collision: SurfaceCollision;
  useTerrainHeight: boolean;
}

export class FpsControls {
  readonly state: FpsControlState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };

  private readonly velocity = new Vector3();
  private readonly direction = new Vector3();
  private readonly keys = new Set<string>();
  private locked = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly domElement: HTMLElement,
    private readonly controls: PointerLockControls,
  ) {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onLock = this.onLock.bind(this);
    this.onUnlock = this.onUnlock.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.controls.addEventListener('lock', this.onLock);
    this.controls.addEventListener('unlock', this.onUnlock);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.controls.removeEventListener('lock', this.onLock);
    this.controls.removeEventListener('unlock', this.onUnlock);
    if (this.locked) this.controls.unlock();
  }

  requestLock(): void {
    this.controls.lock();
  }

  isLocked(): boolean {
    return this.locked;
  }

  update(
    delta: number,
    solidCheck: (x: number, y: number, z: number) => boolean,
    mode?: FpsCollisionMode,
  ): void {
    const speed = 8;
    const gravity = 22;
    const playerHeight = 1.7;
    const playerRadius = 0.35;
    const stepHeight = 0.4;

    this.velocity.y -= gravity * delta;

    this.direction.set(0, 0, 0);
    if (this.state.forward) this.direction.z -= 1;
    if (this.state.backward) this.direction.z += 1;
    if (this.state.left) this.direction.x -= 1;
    if (this.state.right) this.direction.x += 1;

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      this.direction.applyEuler(this.camera.rotation);
      this.direction.y = 0;
      this.direction.normalize();
    }

    const nextX = this.camera.position.x + this.direction.x * speed * delta;
    const nextZ = this.camera.position.z + this.direction.z * speed * delta;
    let nextY = this.camera.position.y + this.velocity.y * delta;

    const checkSolid = mode
      ? (x: number, y: number, z: number) => mode.collision.isSolid(x, y, z)
      : solidCheck;

    // Capsule body spans from just above the feet (so low obstacles are
    // steppable, not blocking) up to the eye/head.
    const bodyFeetY = this.camera.position.y - playerHeight;
    const bodyLowerY = bodyFeetY + stepHeight;
    const headY = this.camera.position.y;

    const blockedX =
      this.collides(nextX, this.camera.position.y, this.camera.position.z, playerRadius, playerHeight, checkSolid) ||
      (mode
        ? mode.collision.blocksCapsuleBody(nextX, this.camera.position.z, playerRadius, bodyLowerY, headY)
        : false) ||
      (mode?.useTerrainHeight &&
        isSteepTerrainBlocked(mode.collision, nextX, this.camera.position.z, this.camera.position.y));

    if (!blockedX) {
      this.camera.position.x = nextX;
    }

    const blockedZ =
      this.collides(this.camera.position.x, this.camera.position.y, nextZ, playerRadius, playerHeight, checkSolid) ||
      (mode
        ? mode.collision.blocksCapsuleBody(this.camera.position.x, nextZ, playerRadius, bodyLowerY, headY)
        : false) ||
      (mode?.useTerrainHeight &&
        isSteepTerrainBlocked(mode.collision, this.camera.position.x, nextZ, this.camera.position.y));

    if (!blockedZ) {
      this.camera.position.z = nextZ;
    }

    const nextFeetY = nextY - playerHeight;

    if (mode?.useTerrainHeight) {
      const ground =
        mode.collision.getGroundHeight(this.camera.position.x, this.camera.position.z) + 0.05;
      // Highest collider top we can stand on / step up onto (e.g. crates, low rubble).
      const colliderTop = mode.collision.supportHeight(
        this.camera.position.x,
        this.camera.position.z,
        playerRadius,
        bodyFeetY + stepHeight,
      );
      const support = Math.max(ground, colliderTop);
      const undergroundSolid = checkSolid(
        this.camera.position.x,
        nextFeetY,
        this.camera.position.z,
      );

      if (undergroundSolid && this.velocity.y <= 0) {
        nextY = Math.max(support + playerHeight, nextFeetY + playerHeight);
        this.velocity.y = 0;
        if (this.state.jump) {
          this.velocity.y = 9;
        }
      } else if (nextFeetY <= support && this.velocity.y <= 0) {
        nextY = support + playerHeight;
        this.velocity.y = 0;
        if (this.state.jump) {
          this.velocity.y = 9;
        }
      }
    } else if (this.collides(this.camera.position.x, nextFeetY, this.camera.position.z, playerRadius, playerHeight, checkSolid)) {
      if (this.velocity.y <= 0) {
        nextY = Math.ceil(nextFeetY) + playerHeight;
        this.velocity.y = 0;
        if (this.state.jump) {
          this.velocity.y = 9;
        }
      }
    }

    // Ceiling: stop the head passing through an overhead collider or a tunnel
    // ceiling block while rising.
    if (mode && nextY > this.camera.position.y) {
      let ceiling = mode.collision.ceilingHeight(
        this.camera.position.x,
        this.camera.position.z,
        playerRadius,
        headY,
      );
      if (checkSolid(this.camera.position.x, nextY, this.camera.position.z)) {
        ceiling = Math.min(ceiling, Math.floor(nextY));
      }
      if (nextY > ceiling) {
        nextY = ceiling;
        if (this.velocity.y > 0) this.velocity.y = 0;
      }
    }

    this.camera.position.y = nextY;

    const minY = mode?.useTerrainHeight
      ? mode.collision.getGroundHeight(this.camera.position.x, this.camera.position.z) + playerHeight
      : playerHeight;

    if (this.camera.position.y < minY) {
      this.camera.position.y = minY;
      this.velocity.y = 0;
    }
  }

  private collides(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    solidCheck: (x: number, y: number, z: number) => boolean,
  ): boolean {
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y - height);
    const maxY = Math.floor(y);
    const minZ = Math.floor(z - radius);
    const maxZ = Math.floor(z + radius);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (solidCheck(bx + 0.5, by + 0.5, bz + 0.5)) return true;
        }
      }
    }
    return false;
  }

  private syncState(): void {
    this.state.forward = this.keys.has('KeyW');
    this.state.backward = this.keys.has('KeyS');
    this.state.left = this.keys.has('KeyA');
    this.state.right = this.keys.has('KeyD');
    this.state.jump = this.keys.has('Space');
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
      this.keys.add(event.code);
      this.syncState();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
    this.syncState();
  }

  private onLock(): void {
    this.locked = true;
  }

  private onUnlock(): void {
    this.locked = false;
  }
}

export function createPointerLockControls(
  camera: PerspectiveCamera,
  domElement: HTMLElement,
): PointerLockControls {
  return new PointerLockControls(camera, domElement);
}
