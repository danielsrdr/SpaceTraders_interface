import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PageBackgroundService {
  readonly backgroundImage = signal("url('/assets/img/background.png')");

  setBackground(path: string): void {
    this.backgroundImage.set(`url('${path}')`);
  }
}
