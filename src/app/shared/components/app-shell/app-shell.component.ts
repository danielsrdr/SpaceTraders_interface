import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AgentStore } from '../../../core/state/agent.store';
import { FleetStore } from '../../../core/state/fleet.store';
import { SessionStore } from '../../../core/state/session.store';
import { getAgentSystem } from '../../../models/agent.model';
import { PageBackgroundService } from '../../services/page-background.service';
import { OnlineStatusService } from '../../services/online-status.service';
import { RadioService } from '../../services/radio.service';
import { KeyboardShortcutService } from '../../services/keyboard-shortcut.service';
import { NotificationBridgeService } from '../../services/notification-bridge.service';
import { FactionThemeService } from '../../services/faction-theme.service';
import { SideNavComponent } from '../side-nav/side-nav.component';
import { SnackbarComponent } from '../snackbar/snackbar.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { LogbookDrawerComponent } from '../logbook-drawer/logbook-drawer.component';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { KeyboardHelpOverlayComponent } from '../keyboard-help-overlay/keyboard-help-overlay.component';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';
import { OnboardingTourComponent } from '../onboarding-tour/onboarding-tour.component';
import { PwaInstallService } from '../../services/pwa-install.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    SideNavComponent,
    SnackbarComponent,
    ConfirmDialogComponent,
    LogbookDrawerComponent,
    CommandPaletteComponent,
    KeyboardHelpOverlayComponent,
    NotificationCenterComponent,
    OnboardingTourComponent,
  ],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  readonly background = inject(PageBackgroundService);
  readonly onlineStatus = inject(OnlineStatusService);
  readonly pwaInstall = inject(PwaInstallService);
  // Instantiated so the control radio observes the logbook app-wide.
  readonly radio = inject(RadioService);
  // Global keyboard shortcuts (Ctrl+K, ?).
  readonly shortcuts = inject(KeyboardShortcutService);
  // Fans snackbar / nav activity into notification history.
  readonly notificationBridge = inject(NotificationBridgeService);
  // Applies faction accent CSS variables when enabled.
  readonly factionTheme = inject(FactionThemeService);

  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => this.trackSession(event));
    destroyRef.onDestroy(() => sub.unsubscribe());
  }

  installApp(): void {
    void this.pwaInstall.promptInstall();
  }

  private trackSession(event: NavigationEnd): void {
    if (!this.agentStore.isAuthenticated()) return;
    const url = event.urlAfterRedirects.split('?')[0];
    const queryParams: Record<string, string> = {};
    const query = event.urlAfterRedirects.split('?')[1];
    if (query) {
      for (const part of query.split('&')) {
        const [key, value] = part.split('=');
        if (key) queryParams[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
      }
    }
    const agent = this.agentStore.agent();
    const selected = this.fleetStore.selectedShip();
    this.session.save({
      route: url,
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
      shipSymbol: selected?.symbol,
      systemSymbol: selected?.nav.systemSymbol ?? (agent ? getAgentSystem(agent) : undefined),
    });
  }
}
