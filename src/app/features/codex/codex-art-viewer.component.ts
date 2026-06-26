import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
  input,
} from '@angular/core';
import { drawFactionSigil, drawGoodGlyph } from './codex-art';

/** Live animated 2D canvas for a faction sigil or trade-good glyph (codex detail). */
@Component({
  selector: 'app-codex-art-viewer',
  template: '<canvas #canvas class="h-full w-full"></canvas>',
  styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class CodexArtViewerComponent implements AfterViewInit, OnDestroy {
  readonly kind = input.required<'faction' | 'good'>();
  readonly symbol = input.required<string>();

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly zone = inject(NgZone);
  private ctx: CanvasRenderingContext2D | null = null;
  private size = 256;
  private animFrameId = 0;
  private disposed = false;
  private reduceMotion = false;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasRef.nativeElement);
    this.zone.runOutsideAngular(() => this.loop());
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const css = Math.max(64, Math.floor(rect.width || 256));
    this.size = css;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.floor(css * dpr);
    canvas.height = Math.floor(css * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx = ctx;
    }
  }

  private loop(): void {
    const draw = (): void => {
      if (this.disposed || !this.ctx) return;
      const time = this.reduceMotion ? 0 : performance.now();
      if (this.kind() === 'faction') {
        drawFactionSigil(this.ctx, this.symbol(), this.size, time);
      } else {
        drawGoodGlyph(this.ctx, this.symbol(), this.size, time);
      }
      if (this.reduceMotion) return;
      this.animFrameId = requestAnimationFrame(draw);
    };
    draw();
  }
}
