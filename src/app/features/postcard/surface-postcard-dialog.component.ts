import { Component, effect, inject, input, output, signal } from '@angular/core';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { SurfacePostcardOptions, renderSurfacePostcard } from './surface-postcard-canvas';

interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

@Component({
  selector: 'app-surface-postcard-dialog',
  templateUrl: './surface-postcard-dialog.component.html',
})
export class SurfacePostcardDialogComponent {
  readonly options = input<SurfacePostcardOptions | null>(null);
  readonly close = output<void>();

  private readonly snackbar = inject(SnackbarService);

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
      this.canShareFiles.set(this.computeCanShareFiles());
    } finally {
      this.busy.set(false);
    }
  }

  private filename(): string {
    const safe = (this.planetName || 'surface').replace(/[^a-z0-9_-]+/gi, '_');
    return `skamkraft-surface-${safe}.png`;
  }

  private computeCanShareFiles(): boolean {
    if (!this.blob) return false;
    const nav = navigator as Navigator & ShareCapableNavigator;
    if (typeof nav.canShare !== 'function') return false;
    try {
      const probe = new File([this.blob], this.filename(), { type: 'image/png' });
      return nav.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  download(): void {
    const url = this.dataUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = this.filename();
    link.click();
    this.snackbar.show('Surface stamp downloaded.', 'success');
  }

  async copy(): Promise<void> {
    if (!this.blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob })]);
      this.snackbar.show('Surface stamp copied to clipboard.', 'success');
    } catch {
      this.snackbar.show('Clipboard not available — use Download instead.', 'warning');
    }
  }

  async share(): Promise<void> {
    if (!this.blob) return;
    const nav = navigator as Navigator & ShareCapableNavigator;
    const file = new File([this.blob], this.filename(), { type: 'image/png' });
    if (typeof nav.share !== 'function' || !this.computeCanShareFiles()) {
      this.snackbar.show('Sharing not supported here — use Download.', 'info');
      return;
    }
    try {
      await nav.share({ files: [file], title: 'My surface stamp' });
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
