import { Component, effect, inject, input, output, signal } from '@angular/core';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LogbookStore } from '../../core/state/logbook.store';
import { SurfacePostcardOptions, renderSurfacePostcard } from './surface-postcard-canvas';

import {
  ShareCapableNavigator,
  canvasToBlob,
  computeCanShareFiles,
  sanitizeFilenamePart,
} from './postcard-share.util';

@Component({
  selector: 'app-surface-postcard-dialog',
  templateUrl: './surface-postcard-dialog.component.html',
})
export class SurfacePostcardDialogComponent {
  readonly options = input<SurfacePostcardOptions | null>(null);
  readonly close = output<void>();

  private readonly snackbar = inject(SnackbarService);
  private readonly logbook = inject(LogbookStore);

  readonly busy = signal(false);
  readonly dataUrl = signal<string | null>(null);
  readonly canShareFiles = signal(false);

  private blob: Blob | null = null;
  private planetName = '';

  constructor() {
    effect(() => {
      const opts = this.options();
      if (opts) {
        void this.render(opts);
      } else {
        this.dataUrl.set(null);
        this.blob = null;
      }
    });
  }

  private async render(opts: SurfacePostcardOptions): Promise<void> {
    this.busy.set(true);
    this.planetName = opts.planet.name;
    try {
      try {
        await document.fonts?.ready;
      } catch {
        // Font API unavailable.
      }
      const canvas = renderSurfacePostcard(opts);
      this.dataUrl.set(canvas.toDataURL('image/png'));
      this.blob = await canvasToBlob(canvas);
      this.canShareFiles.set(computeCanShareFiles(this.blob, this.filename()));
    } finally {
      this.busy.set(false);
    }
  }

  private filename(): string {
    return `skamkraft-surface-${sanitizeFilenamePart(this.planetName, 'surface')}.png`;
  }

  download(): void {
    const url = this.dataUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = this.filename();
    link.click();
    this.logbook.recordSurfaceStamp(this.planetName, url);
    this.snackbar.show('Surface stamp downloaded.', 'success');
  }

  async copy(): Promise<void> {
    if (!this.blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob })]);
      this.logbook.recordSurfaceStamp(this.planetName, this.dataUrl() ?? undefined);
      this.snackbar.show('Surface stamp copied to clipboard.', 'success');
    } catch {
      this.snackbar.show('Clipboard not available — use Download instead.', 'warning');
    }
  }

  async share(): Promise<void> {
    if (!this.blob) return;
    const nav = navigator as Navigator & ShareCapableNavigator;
    const file = new File([this.blob], this.filename(), { type: 'image/png' });
    if (typeof nav.share !== 'function' || !computeCanShareFiles(this.blob, this.filename())) {
      this.snackbar.show('Sharing not supported here — use Download.', 'info');
      return;
    }
    try {
      await nav.share({ files: [file], title: 'My surface stamp' });
      this.logbook.recordSurfaceStamp(this.planetName, this.dataUrl() ?? undefined);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.snackbar.show('Share failed.', 'error');
      }
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
