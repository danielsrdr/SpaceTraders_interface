import { effect, inject, Injectable, untracked } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { NotificationStore, NotificationSeverity } from '../../core/state/notification.store';
import { SnackbarService, SnackbarType } from './snackbar.service';
import { NavActivityService } from './nav-activity.service';

function severityFromSnackbar(type: SnackbarType): NotificationSeverity {
  switch (type) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return 'info';
    }
  }
}

/**
 * Fans out gameplay events into the persistent notification center.
 * Instantiated from app-shell so it stays active app-wide.
 */
@Injectable({ providedIn: 'root' })
export class NotificationBridgeService {
  private readonly agentStore = inject(AgentStore);
  private readonly notifications = inject(NotificationStore);
  private readonly snackbar = inject(SnackbarService);
  private readonly navActivity = inject(NavActivityService);

  private prevShipArrived = false;
  private prevContractExpiring = false;

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      untracked(() => {
        if (agent) {
          this.notifications.attach(agent.name);
        } else {
          this.notifications.detach();
        }
      });
    });

    effect(() => {
      const msg = this.snackbar.message();
      if (!msg) return;
      if (msg.text.startsWith('Achievement unlocked')) return;
      untracked(() => {
        this.notifications.push({
          category: 'system',
          severity: severityFromSnackbar(msg.type),
          title: msg.text,
        });
      });
    });

    effect(() => {
      const arrived = this.navActivity.shipArrivedAlert();
      if (arrived && !this.prevShipArrived) {
        untracked(() => {
          this.notifications.push({
            category: 'arrival',
            severity: 'success',
            title: 'Ship arrived',
            body: 'A ship has completed its transit.',
            route: '/ships',
          });
        });
      }
      this.prevShipArrived = arrived;
    });

    effect(() => {
      const expiring = this.navActivity.contractExpiringAlert();
      if (expiring && !this.prevContractExpiring) {
        untracked(() => {
          this.notifications.push({
            category: 'contract',
            severity: 'warning',
            title: 'Contract expiring soon',
            body: 'Review your active contracts.',
            route: '/contracts',
          });
        });
      }
      this.prevContractExpiring = expiring;
    });
  }

  notifyAchievement(title: string): void {
    this.notifications.push({
      category: 'achievement',
      severity: 'success',
      title: `Achievement unlocked — ${title}`,
      route: '/codex',
    });
  }

  notifyUnlock(title: string, body: string): void {
    this.notifications.push({
      category: 'unlock',
      severity: 'success',
      title,
      body,
    });
  }
}
