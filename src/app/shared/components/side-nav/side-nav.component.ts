import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavCommandsService, NavItemView } from '../../navigation/nav-commands.service';
import { AgentStore } from '../../../core/state/agent.store';
import { NavIconComponent } from './nav-icon.component';

const PIN_KEY = 'sk_rail_pinned';

@Component({
  selector: 'app-side-nav',
  templateUrl: './side-nav.component.html',
  imports: [NavIconComponent],
  host: {
    '(mouseenter)': 'hovering.set(true)',
    '(mouseleave)': 'hovering.set(false)',
  },
})
export class SideNavComponent {
  readonly agentStore = inject(AgentStore);
  private readonly navCommands = inject(NavCommandsService);
  private readonly router = inject(Router);

  readonly pinned = signal(localStorage.getItem(PIN_KEY) === '1');
  readonly hovering = signal(false);

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('sk-rail-pinned', this.pinned());
    });
  }

  readonly expanded = computed(() => this.pinned() || this.hovering());

  readonly sections = computed(() => this.navCommands.railSections());

  isActive(item: NavItemView): boolean {
    if (!item.route) return false;
    const url = this.router.url.split('?')[0];
    if (item.route === '/home') return url === '/home' || url === '/';
    return url === item.route || url.startsWith(item.route + '/');
  }

  togglePin(): void {
    const next = !this.pinned();
    this.pinned.set(next);
    localStorage.setItem(PIN_KEY, next ? '1' : '0');
  }

  onItemClick(item: NavItemView, event: Event): void {
    event.preventDefault();
    this.navCommands.executeItem(item);
  }
}
