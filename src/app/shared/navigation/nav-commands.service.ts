import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { FleetStore } from '../../core/state/fleet.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { OrderQueueStore } from '../../core/state/order-queue.store';
import { AuthService } from '../../core/auth/auth.service';
import { getAgentSystem } from '../../models/agent.model';
import { NavActivityService } from '../services/nav-activity.service';
import { SnackbarService } from '../services/snackbar.service';
import { LogbookDrawerService } from '../services/logbook-drawer.service';
import { NavIconName } from '../components/side-nav/nav-icon.component';

export type NavSection = 'ops' | 'economy' | 'exploration' | 'meta';

export interface NavItemView {
  id: string;
  label: string;
  icon: NavIconName;
  route?: string;
  action?: 'logout' | 'systems' | 'logbook-drawer';
  section: NavSection;
  locked: boolean;
  activity: boolean;
  activityKind?: 'good' | 'warn';
  badge?: number;
  badgeKind?: 'neutral' | 'warn' | 'good';
  unlockHint?: string;
  keywords: string[];
}

export interface NavSectionGroup {
  id: NavSection;
  label: string;
  items: NavItemView[];
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

const SECTION_LABELS: Record<NavSection, string> = {
  ops: 'Ops',
  economy: 'Économie',
  exploration: 'Exploration',
  meta: 'Méta',
};

@Injectable({ providedIn: 'root' })
export class NavCommandsService {
  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly discovery = inject(DiscoveryStore);
  private readonly activity = inject(NavActivityService);
  private readonly orderQueue = inject(OrderQueueStore);
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
    const inTransit = this.fleetStore.ships().filter((s) => s.nav.status === 'IN_TRANSIT').length;
    const openContracts = this.activity
      .activeContracts()
      .filter((c) => c.accepted && !c.fulfilled).length;
    const autopilotActive = this.orderQueue.activeShips().length;

    return [
      this.nav('home', 'Command Center', 'home', '/home', 'ops', ['start', 'welcome', 'command', 'hub']),
      this.nav('dashboard', 'Dashboard', 'dashboard', '/dashboard', 'ops', ['stats', 'overview']),
      this.nav('systems', 'Systems', 'systems', undefined, 'ops', ['map', 'flight', 'galaxy'], 'systems'),
      this.nav('ships', 'Ships', 'ships', '/ships', 'ops', ['fleet', 'vessels'], undefined, shipArrived, 'good', inTransit, 'neutral'),
      this.nav('autopilot', 'Auto-pilot', 'autopilot', '/autopilot', 'ops', ['automation', 'queue', 'orders'], undefined, false, undefined, autopilotActive, 'good'),
      this.nav('contracts', 'Contracts', 'contracts', '/contracts', 'economy', ['missions', 'jobs'], undefined, contractExpiring, 'warn', openContracts, contractExpiring ? 'warn' : 'neutral'),
      {
        ...this.nav('factions', 'Factions', 'factions', '/factions', 'economy', ['diplomacy', 'registry']),
        locked: factionsLocked,
        unlockHint: FACTIONS_UNLOCK_HINT,
      },
      {
        ...this.nav('data', 'Data', 'data', '/data', 'economy', ['supply', 'chain', 'terminal']),
        locked: dataLocked,
        unlockHint: DATA_UNLOCK_HINT,
      },
      this.nav('codex', 'Codex', 'codex', '/codex', 'exploration', ['encyclopedia', 'achievements']),
      this.nav('logbook', 'Logbook', 'codex', '/logbook', 'exploration', ['log', 'history', 'journal']),
      this.nav('leaderboard', 'Leaderboard', 'leaderboard', '/leaderboard', 'exploration', ['rankings', 'scores']),
      this.nav('profile', 'Profile', 'profile', '/profile', 'meta', ['agent', 'settings', 'account']),
      this.nav('api', 'API', 'api', '/api', 'meta', ['explorer', 'endpoints', 'developer']),
      this.nav('logbook-drawer', 'Open log drawer', 'codex', undefined, 'meta', ['log', 'drawer', 'quick'], 'logbook-drawer'),
      this.nav('logout', 'Logout', 'logout', undefined, 'meta', ['sign out', 'exit'], 'logout'),
    ];
  });

  readonly railSections = computed<NavSectionGroup[]>(() => {
    const visible = this.items().filter((item) => item.id !== 'logbook-drawer');
    const order: NavSection[] = ['ops', 'economy', 'exploration', 'meta'];
    return order.map((id) => ({
      id,
      label: SECTION_LABELS[id],
      items: visible.filter((item) => item.section === id),
    }));
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
    section: NavSection,
    keywords: string[],
    action?: NavItemView['action'],
    activity = false,
    activityKind?: 'good' | 'warn',
    badge?: number,
    badgeKind?: 'neutral' | 'warn' | 'good',
  ): NavItemView {
    return {
      id,
      label,
      icon,
      route,
      action,
      section,
      locked: false,
      activity,
      activityKind,
      badge: badge && badge > 0 ? badge : undefined,
      badgeKind,
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
