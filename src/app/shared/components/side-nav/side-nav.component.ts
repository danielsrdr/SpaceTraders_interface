import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../../core/state/agent.store';
import { FleetStore } from '../../../core/state/fleet.store';
import { DiscoveryStore } from '../../../core/state/discovery.store';
import { AuthService } from '../../../core/auth/auth.service';
import { getAgentSystem } from '../../../models/agent.model';
import { NavActivityService } from '../../services/nav-activity.service';
import { SnackbarService } from '../../services/snackbar.service';
import { NavIconComponent, NavIconName } from './nav-icon.component';

interface NavItem {
  id: string;
  label: string;
  icon: NavIconName;
  route?: string;
  action?: 'logout';
  locked: boolean;
  activity: boolean;
  activityKind?: 'good' | 'warn';
  unlockHint?: string;
}

@Component({
  selector: 'app-side-nav',
  templateUrl: './side-nav.component.html',
  imports: [NavIconComponent],
})
export class SideNavComponent {
  readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly discovery = inject(DiscoveryStore);
  private readonly activity = inject(NavActivityService);
  private readonly auth = inject(AuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

  readonly open = signal(false);

  readonly items = computed<NavItem[]>(() => {
    const dataLocked = !this.discovery.dataUnlocked();
    const factionsLocked = !this.discovery.factionsUnlocked();
    const shipArrived = this.activity.shipArrivedAlert();
    const contractExpiring = this.activity.contractExpiringAlert();
    return [
      { id: 'home', label: 'Home', icon: 'home', route: '/home', locked: false, activity: false },
      { id: 'systems', label: 'Systems', icon: 'systems', route: '/systems', locked: false, activity: false },
      {
        id: 'ships',
        label: 'Ships',
        icon: 'ships',
        route: '/ships',
        locked: false,
        activity: shipArrived,
        activityKind: 'good',
      },
      { id: 'autopilot', label: 'Auto-pilot', icon: 'autopilot', route: '/autopilot', locked: false, activity: false },
      {
        id: 'contracts',
        label: 'Contracts',
        icon: 'contracts',
        route: '/contracts',
        locked: false,
        activity: contractExpiring,
        activityKind: 'warn',
      },
      {
        id: 'factions',
        label: 'Factions',
        icon: 'factions',
        route: '/factions',
        locked: factionsLocked,
        activity: false,
        unlockHint: 'Accept your first contract to unlock Factions.',
      },
      { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard', route: '/leaderboard', locked: false, activity: false },
      { id: 'profile', label: 'Profile', icon: 'profile', route: '/profile', locked: false, activity: false },
      {
        id: 'data',
        label: 'Data',
        icon: 'data',
        route: '/data',
        locked: dataLocked,
        activity: false,
        unlockHint: 'Extract resources with a ship to unlock the Data terminal.',
      },
      { id: 'api', label: 'API', icon: 'api', route: '/api', locked: false, activity: false },
      { id: 'logout', label: 'Logout', icon: 'logout', action: 'logout', locked: false, activity: false },
    ];
  });

  readonly hasActivity = computed(() => this.items().some((item) => item.activity && !item.locked));

  angleFor(index: number): number {
    const count = this.items().length;
    if (count <= 1) return 180;
    const spread = 176;
    return 180 + spread / 2 - index * (spread / (count - 1));
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const host = event.currentTarget as HTMLElement;
    if (!next || !host.contains(next)) {
      this.open.set(false);
    }
  }

  onItemClick(item: NavItem, event: Event): void {
    event.preventDefault();
    if (item.locked) {
      this.snackbar.show(item.unlockHint ?? 'Locked.', 'info');
      return;
    }
    this.open.set(false);
    if (item.action === 'logout') {
      this.auth.logout();
      return;
    }
    if (item.id === 'systems') {
      this.navigateToSystems();
      return;
    }
    if (item.route) {
      void this.router.navigate([item.route]);
    }
  }

  private navigateToSystems(): void {
    const agent = this.agentStore.agent();
    if (!agent) {
      this.snackbar.show('Agent not loaded. Please refresh the page.', 'error');
      return;
    }
    const ships = this.fleetStore.ships();
    const shipSystem = ships.find((s) => s.nav.systemSymbol)?.nav.systemSymbol;
    const system = shipSystem ?? getAgentSystem(agent);
    void this.router.navigate(['/systems'], { queryParams: { name: system, fallback: '1' } });
  }
}
