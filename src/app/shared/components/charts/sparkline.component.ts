import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  template: `
    @if (points()) {
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        class="block"
        aria-hidden="true"
      >
        <polyline
          [attr.points]="points()"
          fill="none"
          [attr.stroke]="stroke()"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    }
  `,
})
export class SparklineComponent {
  readonly values = input<number[]>([]);
  readonly width = input(80);
  readonly height = input(24);
  readonly stroke = input('rgba(69, 128, 255, 0.85)');

  readonly points = computed(() => {
    const values = this.values();
    if (!values.length) return '';
    const w = this.width();
    const h = this.height();
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 2) - 1;
        return `${x},${y}`;
      })
      .join(' ');
  });
}
