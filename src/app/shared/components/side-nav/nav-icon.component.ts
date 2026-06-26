import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NavIconName =
  | 'home'
  | 'systems'
  | 'ships'
  | 'contracts'
  | 'factions'
  | 'leaderboard'
  | 'profile'
  | 'data'
  | 'api'
  | 'autopilot'
  | 'dashboard'
  | 'codex'
  | 'logout'
  | 'locked';

@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        line-height: 0;
      }
    `,
  ],
  template: `
    <svg
      class="sk-nav-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3.5 11 12 4l8.5 7" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M10 20v-5h4v5" />
        }
        @case ('systems') {
          <circle cx="12" cy="12" r="3.4" />
          <ellipse cx="12" cy="12" rx="9.2" ry="4" transform="rotate(-22 12 12)" />
        }
        @case ('ships') {
          <path d="M12 3c2.6 1.7 4 4.7 4 8.2 0 2.4-.7 4.6-1.8 6.3H9.8C8.7 15.8 8 13.6 8 11.2 8 7.7 9.4 4.7 12 3Z" />
          <circle cx="12" cy="10" r="1.6" />
          <path d="M8.2 14 5.5 16.5 6.4 19m9.4-5 2.7 2.5-.9 2.5" />
          <path d="M10.5 17.7c.5 1.4 1.5 2.6 1.5 2.6s1-1.2 1.5-2.6" />
        }
        @case ('contracts') {
          <path d="M6 3.5h8.5L18 7v13.5H6Z" />
          <path d="M14 3.5V7h4" />
          <path d="M8.8 11h6.4M8.8 14h6.4M8.8 17h4" />
        }
        @case ('factions') {
          <path d="M12 3.2 19 5.4v5.3c0 4.6-3 8-7 9.6-4-1.6-7-5-7-9.6V5.4Z" />
          <path d="M12 8v6M9 11h6" />
        }
        @case ('leaderboard') {
          <path d="M7 4h10v4.5a5 5 0 0 1-10 0Z" />
          <path d="M7 5.5H4.3v1.8A2.7 2.7 0 0 0 7 10m10-4.5h2.7v1.8A2.7 2.7 0 0 1 17 10" />
          <path d="M12 13.5V17m-3 3.5h6m-4.5 0c0-1.4 1-2.5 1.5-3.5.5 1 1.5 2.1 1.5 3.5" />
        }
        @case ('profile') {
          <circle cx="12" cy="8.2" r="3.6" />
          <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
        }
        @case ('data') {
          <ellipse cx="12" cy="6" rx="6.5" ry="2.6" />
          <path d="M5.5 6v6c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V6" />
          <path d="M5.5 12v6c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-6" />
        }
        @case ('api') {
          <path d="m8.5 8.5-4 3.5 4 3.5m7-7 4 3.5-4 3.5" />
          <path d="m13.5 6-3 12" />
        }
        @case ('autopilot') {
          <circle cx="12" cy="12" r="8.2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 3.8v3M12 17.2v3M3.8 12h3M17.2 12h3" />
        }
        @case ('dashboard') {
          <path d="M4 20h16" />
          <path d="M7 20v-5" />
          <path d="M12 20V9" />
          <path d="M17 20v-8" />
        }
        @case ('codex') {
          <path d="M12 6.5C10.5 5 8 4.5 5 4.8V18c3-.3 5.5.2 7 1.7 1.5-1.5 4-2 7-1.7V4.8c-3-.3-5.5.2-7 1.7Z" />
          <path d="M12 6.5V20" />
        }
        @case ('logout') {
          <path d="M12.5 4H5.5C4.7 4 4 4.7 4 5.5v13c0 .8.7 1.5 1.5 1.5h7" />
          <path d="M13.5 12H20m0 0-3-3m3 3-3 3" />
        }
        @case ('locked') {
          <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.6" />
          <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" />
          <circle cx="12" cy="15" r="1.2" />
        }
        @default {
          <circle cx="12" cy="12" r="8" />
        }
      }
    </svg>
  `,
})
export class NavIconComponent {
  readonly name = input.required<NavIconName>();
}
