import { Injectable, signal } from '@angular/core';

/** Reactive wrapper around the browser's online/offline state. */
@Injectable({ providedIn: 'root' })
export class OnlineStatusService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  isOnline(): boolean {
    return this.online();
  }
}
