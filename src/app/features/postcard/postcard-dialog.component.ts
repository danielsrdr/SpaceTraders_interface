import { Component, effect, inject, input, output, signal } from '@angular/core';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { PostcardOptions, renderPostcard } from './postcard-canvas';

interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Preview + export modal for a generated system postcard. Renders the stylized
 * canvas when `options` is set and exposes Download / Copy / Share (PNG).
 */
@Component({
  selector: 'app-postcard-dialog',
  templateUrl: './postcard-dialog.component.html',
})
export class PostcardDialogComponent {
  readonly options = input<PostcardOptions | null>(null);
  readonly close = output<void>();

  private readonly snackbar = inject(SnackbarService);

  readonly busy = signal(false);
  readonly dataUrl = signal<string | null>(null);
  readonly canShareFiles = signal(false);

  private blob: Blob | null = null;
  private systemSymbol = '';

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

  private async render(opts: PostcardOptions): Promise<void> {
    this.busy.set(true);
    this.systemSymbol = opts.systemSymbol;
    try {
      // Ensure the pixel font is ready so canvas text uses it rather than a fallback.
      try {
        await document.fonts?.ready;
      } catch {
        // Font loading API unavailable; proceed with whatever is loaded.
      }
      const canvas = renderPostcard(opts);
      this.dataUrl.set(canvas.toDataURL('image/png'));
      this.blob = await canvasToBlob(canvas);
      this.canShareFiles.set(this.computeCanShareFiles());
    } finally {
      this.busy.set(false);
    }
  }

  private filename(): string {
    const safe = (this.systemSymbol || 'system').replace(/[^a-z0-9_-]+/gi, '_');
    return `skamkraft-${safe}.png`;
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
    this.snackbar.show('Postcard downloaded.', 'success');
  }

  async copy(): Promise<void> {
    if (!this.blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob })]);
      this.snackbar.show('Postcard copied to clipboard.', 'success');
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
      await nav.share({ files: [file], title: 'My skamkraft postcard' });
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
