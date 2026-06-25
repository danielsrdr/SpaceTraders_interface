import { Injectable, signal } from '@angular/core';

export interface DialogState {
  title: string;
  message: string;
  onConfirm?: () => void;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly dialog = signal<DialogState | null>(null);

  showInfo(title: string, message: string, onConfirm?: () => void): void {
    this.dialog.set({ title, message, onConfirm });
  }

  confirm(): void {
    const state = this.dialog();
    state?.onConfirm?.();
    this.close();
  }

  close(): void {
    this.dialog.set(null);
  }
}
