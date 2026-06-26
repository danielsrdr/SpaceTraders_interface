import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { FleetStore } from '../../core/state/fleet.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { AuthService } from '../../core/auth/auth.service';
import { getAgentSystem } from '../../models/agent.model';
import { NavActivityService } from '../services/nav-activity.service';
import { SnackbarService } from '../services/snackbar.service';
import { LogbookDrawerService } from '../services/logbook-drawer.service';
import { NavIconName } from '../components/side-nav/nav-icon.component';

export interface NavItemView {
  id: string;
  label: string;
  icon: NavIconName;
  route?: string;
  action?: 'logout' | 'systems' | 'logbook-drawer';
  locked: boolean;
  activity: boolean;
  activityKind?: 'good' | 'warn';
  unlockHint?: string;
  keywords: string[];
}

export interface PaletteCommand {
  id: string;
  label: string;
  icon: NavIconName;
  hint?: string;
  group: 'navigation' | 'ship' | 'action';
  keywords: string[];
  locked: boolean;
  unlockHint?: string;
  execute: () => void | Promise<void>;
}

const FACTIONS_UNLOCK_HINT = 'Accept your first contract to unlock Factions.';
const DATA_UNLOCK_HINT = 'Extract resources with a ship to unlock the Data terminal.';

@Injectable({ providedIn: 'root' })
export class NavCommandsService {
  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly discovery = inject(DiscoveryStore);
  private readonly activity = inject(NavActivityService);
  private readonly auth = inject(AuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly logbookDrawer = inject(LogbookDrawerService);
  private readonly router = inject(Router);

  readonly factionsUnlockHint = FACTIONS_UNLOCK_HINT;
  readonly dataUnlockHint = DATA_UNLOCK_HINT;

  readonly items = computed<NavItemView[]>(() => {
    const dataLocked = !this.discovery.dataUnlocked();
    const factionsLocked = !this.discovery.factionsUnlocked();
    const shipArrived = this.activity.shipArrivedAlert();
    const contractExpiring = this.activity.contractExpiringAlert();
    return [
      this.nav('home', 'Command Center', 'home', '/home', ['start', 'welcome', 'command', 'hub']),
      this.nav('dashboard', 'Dashboard', 'dashboard', '/dashboard', ['stats', 'overview']),
      this.nav('systems', 'Systems', 'systems', undefined, ['map', 'flight', 'galaxy'], 'systems'),
      this.nav('ships', 'Ships', 'ships', '/ships', ['fleet', 'vessels'], undefined, shipArrived, 'good'),
      this.nav('autopilot', 'Auto-pilot', 'autopilot', '/autopilot', ['automation', 'queue', 'orders']),
      this.nav('contracts', 'Contracts', 'contracts', '/contracts', ['missions', 'jobs'], undefined, contractExpiring, 'warn'),
      {
        ...this.nav('factions', 'Factions', 'factions', '/factions', ['diplomacy', 'registry']),
        locked: factionsLocked,
        unlockHint: FACTIONS_UNLOCK_HINT,
      },
      this.nav('codex', 'Codex', 'codex', '/codex', ['encyclopedia', 'achievements']),
      this.nav('leaderboard', 'Leaderboard', 'leaderboard', '/leaderboard', ['rankings', 'scores']),
      this.nav('profile', 'Profile', 'profile', '/profile', ['agent', 'settings', 'account']),
      {
        ...this.nav('data', 'Data', 'data', '/data', ['supply', 'chain', 'terminal']),
        locked: dataLocked,
        unlockHint: DATA_UNLOCK_HINT,
      },
      this.nav('api', 'API', 'api', '/api', ['explorer', 'endpoints', 'developer']),
      this.nav('logbook', 'Logbook', 'codex', '/logbook', ['log', 'history', 'journal']),
      {
        id: 'logbook-drawer',
        label: 'Open log drawer',
        icon: 'codex',
        action: 'logbook-drawer',
        locked: false,
        activity: false,
        keywords: ['log', 'drawer', 'quick'],
      },
      {
        id: 'logout',
        label: 'Logout',
        icon: 'logout',
        action: 'logout',
        locked: false,
        activity: false,
        keywords: ['sign out', 'exit'],
      },
    ];
  });

  readonly navPaletteCommands = computed<PaletteCommand[]>(() =>
    this.items().map((item) => this.toPaletteCommand(item)),
  );

  search(query: string, extra: PaletteCommand[] = []): PaletteCommand[] {
    const q = query.trim().toLowerCase();
    const all = [...this.navPaletteCommands(), ...extra];
    if (!q) return all.filter((c) => c.id !== 'logbook-drawer');
    return all.filter((cmd) => {
      if (cmd.id === 'logbook-drawer') return false;
      const haystack = [cmd.label, cmd.hint ?? '', ...cmd.keywords].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  executeItem(item: NavItemView): void {
    if (item.locked) {
      this.snackbar.show(item.unlockHint ?? 'Locked.', 'info');
      return;
    }
    if (item.action === 'logout') {
      this.auth.logout();
      return;
    }
    if (item.action === 'systems') {
      this.navigateToSystems();
      return;
    }
    if (item.action === 'logbook-drawer') {
      this.logbookDrawer.toggle();
      return;
    }
    if (item.route) {
      void this.router.navigate([item.route]);
    }
  }

  navigateToSystems(): void {
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

  private nav(
    id: string,
    label: string,
    icon: NavIconName,
    route: string | undefined,
    keywords: string[],
    action?: NavItemView['action'],
    activity = false,
    activityKind?: 'good' | 'warn',
  ): NavItemView {
    return {
      id,
      label,
      icon,
      route,
      action,
      locked: false,
      activity,
      activityKind,
      keywords,
    };
  }

  private toPaletteCommand(item: NavItemView): PaletteCommand {
    return {
      id: item.id,
      label: item.label,
      icon: item.icon,
      hint: item.route ?? item.action,
      group: 'navigation',
      keywords: item.keywords,
      locked: item.locked,
      unlockHint: item.unlockHint,
      execute: () => this.executeItem(item),
    };
  }
}
