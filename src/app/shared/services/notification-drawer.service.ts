import { Injectable, signal } from '@angular/core';

/** Global open state for the notifications drawer (app-shell). */
@Injectable({ providedIn: 'root' })
export class NotificationDrawerService {
  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  openDrawer(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
