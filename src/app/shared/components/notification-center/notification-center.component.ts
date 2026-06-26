import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../../core/state/agent.store';
import { NotificationEntry, NotificationStore } from '../../../core/state/notification.store';
import { NotificationDrawerService } from '../../services/notification-drawer.service';

@Component({
  selector: 'app-notification-center',
  templateUrl: './notification-center.component.html',
})
export class NotificationCenterComponent {
  readonly agentStore = inject(AgentStore);
  readonly notifications = inject(NotificationStore);
  readonly drawer = inject(NotificationDrawerService);
  private readonly router = inject(Router);

  readonly open = this.drawer.open;
  readonly unread = this.notifications.unreadCount;
  readonly entries = this.notifications.entriesReversed;

  toggle(): void {
    this.drawer.toggle();
    if (this.drawer.open()) {
      this.notifications.markAllRead();
    }
  }

  close(): void {
    this.drawer.close();
  }

  openEntry(entry: NotificationEntry): void {
    this.close();
    if (entry.route) {
      void this.router.navigate([entry.route]);
    }
  }

  categoryClass(entry: NotificationEntry): string {
    switch (entry.category) {
      case 'arrival':
        return 'text-cyan-300';
      case 'contract':
        return 'text-amber-300';
      case 'achievement':
        return 'text-emerald-300';
      case 'unlock':
        return 'text-violet-300';
      case 'trade':
        return 'text-sky-300';
      case 'system':
        return 'text-slate-300';
      default: {
        const _exhaustive: never = entry.category;
        void _exhaustive;
        return 'text-slate-300';
      }
    }
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }
}
