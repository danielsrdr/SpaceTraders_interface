import { Component, computed, inject, signal } from '@angular/core';
import { NavCommandsService, NavItemView } from '../../navigation/nav-commands.service';
import { AgentStore } from '../../../core/state/agent.store';
import { NavIconComponent } from './nav-icon.component';

@Component({
  selector: 'app-side-nav',
  templateUrl: './side-nav.component.html',
  imports: [NavIconComponent],
})
export class SideNavComponent {
  readonly agentStore = inject(AgentStore);
  private readonly navCommands = inject(NavCommandsService);

  readonly open = signal(false);

  readonly items = computed(() =>
    this.navCommands.items().filter((item) => item.id !== 'logbook' && item.id !== 'logbook-drawer'),
  );

  readonly hasActivity = computed(() => this.items().some((item) => item.activity && !item.locked));

  angleFor(index: number): number {
    const count = this.items().length;
    if (count <= 1) return 180;
    const spread = 176;
    return 180 + spread / 2 - index * (spread / (count - 1));
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const host = event.currentTarget as HTMLElement;
    if (!next || !host.contains(next)) {
      this.open.set(false);
    }
  }

  onItemClick(item: NavItemView, event: Event): void {
    event.preventDefault();
    this.open.set(false);
    this.navCommands.executeItem(item);
  }
}
