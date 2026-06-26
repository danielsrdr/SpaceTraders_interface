import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  readonly open = signal(false);
  readonly query = signal('');

  openPalette(initialQuery = ''): void {
    this.query.set(initialQuery);
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
  }

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.openPalette();
    }
  }
}
