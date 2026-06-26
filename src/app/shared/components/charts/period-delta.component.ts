import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-period-delta',
  template: `
    @if (deltaPct() !== null) {
      <span class="text-xs font-medium" [class]="toneClass()">
        {{ label() }}
      </span>
    }
  `,
})
export class PeriodDeltaComponent {
  readonly current = input(0);
  readonly previous = input(0);
  readonly format = input<'credits' | 'percent'>('percent');

  readonly deltaPct = computed(() => {
    const prev = this.previous();
    const curr = this.current();
    if (this.format() === 'credits') {
      const diff = curr - prev;
      return diff;
    }
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
  });

  readonly label = computed(() => {
    if (this.format() === 'credits') {
      const diff = this.deltaPct() as number;
      const sign = diff > 0 ? '+' : '';
      return `${sign}${Math.round(diff).toLocaleString()} vs prior`;
    }
    const pct = this.deltaPct() as number;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}% vs prior`;
  });

  readonly toneClass = computed(() => {
    const val = this.deltaPct() as number;
    if (val > 0) return 'text-emerald-300';
    if (val < 0) return 'text-rose-300';
    return 'text-white/45';
  });
}
