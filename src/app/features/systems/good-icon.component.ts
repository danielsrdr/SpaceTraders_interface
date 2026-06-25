import { Component, input } from '@angular/core';
import { GoodCategory } from './trade-good-visuals';

@Component({
  selector: 'app-good-icon',
  template: `
    <svg
      class="sk-good-icon"
      [attr.data-cat]="category()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (category()) {
        @case ('fuel') {
          <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />
        }
        @case ('minerals') {
          <path d="M6 3h12l3 6-9 12L3 9z" />
        }
        @case ('chemicals') {
          <path d="M10 3h4M11 3v5l-5 10a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-5-10V3" />
        }
        @case ('food') {
          <path d="M12 4C8 4 5 7 5 11c0 5 4 9 7 9s7-4 7-9c0-4-3-7-7-7zM12 4v16" />
        }
        @case ('tech') {
          <path d="M8 8h8v8H8zM4 10h2M4 14h2M18 10h2M18 14h2M10 4v2M14 4v2M10 18v2M14 18v2" />
        }
        @default {
          <path d="M4 7l8-4 8 4-8 4zM4 7v10l8 4M20 7v10l-8 4" />
        }
      }
    </svg>
  `,
})
export class GoodIconComponent {
  readonly category = input.required<GoodCategory>();
}
