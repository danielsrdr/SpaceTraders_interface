import { Injectable, signal } from '@angular/core';

export type SnackbarType = 'success' | 'error' | 'warning' | 'info';

export interface SnackbarMessage {
  text: string;
  type: SnackbarType;
}

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  readonly message = signal<SnackbarMessage | null>(null);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, type: SnackbarType = 'info', duration = 3000): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.message.set({ text, type });
    this.hideTimer = setTimeout(() => this.dismiss(), duration);
  }

  dismiss(): void {
    this.message.set(null);
  }
}
