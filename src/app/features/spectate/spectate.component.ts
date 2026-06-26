import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlanetView } from '../../models/system.model';
import { ShipData } from '../../models/ship.model';
import { shipInTransit } from '../systems/planet-helpers';
import { SystemFlightViewComponent } from '../systems/system-flight-view.component';
import { decodeSnapshot, toPlanetViews, toShipData } from './spectate-state';

/**
 * Public, read-only replay host. Decodes a `#s=...` snapshot from the URL and
 * renders the deterministic flight view with no API access and no auth. The
 * orbit engine reproduces the same motion from the serialized planet data, so
 * the system + fleet "replay" identically for anyone who opens the link.
 */
@Component({
  selector: 'app-spectate',
  imports: [SystemFlightViewComponent],
  templateUrl: './spectate.component.html',
})
export class SpectateComponent implements OnInit {
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly planets = signal<PlanetView[]>([]);
  readonly ships = signal<ShipData[]>([]);
  readonly systemSymbol = signal('');
  readonly systemName = signal('');
  readonly captainName = signal('');
  readonly captainFaction = signal('');
  readonly heroShipSymbol = signal<string | null>(null);
  readonly heroShipRole = signal<string | null>(null);

  ngOnInit(): void {
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
    try {
      const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
      const payload = new URLSearchParams(hash).get('s');
      if (!payload) {
        this.fail('This link has no spectator data.');
        return;
      }
      const snapshot = await decodeSnapshot(payload);
      if (!snapshot) {
        this.fail('This spectator link is invalid or from an unsupported version.');
        return;
      }

      const ships = toShipData(snapshot);
      this.planets.set(toPlanetViews(snapshot));
      this.ships.set(ships);
      this.systemSymbol.set(snapshot.systemSymbol);
      this.systemName.set(snapshot.systemName);
      this.captainName.set(snapshot.captain?.name || 'Unknown captain');
      this.captainFaction.set(snapshot.captain?.faction ?? '');

      const hero = ships.find((s) => !shipInTransit(s)) ?? ships[0] ?? null;
      this.heroShipSymbol.set(hero?.symbol ?? null);
      this.heroShipRole.set(hero?.registration.role ?? null);
      this.loading.set(false);
    } catch {
      this.fail('Failed to decode the spectator link.');
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }

  goRegister(): void {
    void this.router.navigate(['/register']);
  }
}
