import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgentStore } from '../../../core/state/agent.store';
import { NavCommandsService, PaletteCommand } from '../../navigation/nav-commands.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { ShipCommandsService } from '../../services/ship-commands.service';
import { PriceComparatorService } from '../../services/price-comparator.service';
import { NavIconComponent } from '../side-nav/nav-icon.component';

@Component({
  selector: 'app-command-palette',
  imports: [FormsModule, NavIconComponent],
  templateUrl: './command-palette.component.html',
})
export class CommandPaletteComponent {
  readonly agentStore = inject(AgentStore);
  private readonly palette = inject(CommandPaletteService);
  private readonly navCommands = inject(NavCommandsService);
  private readonly shipCommands = inject(ShipCommandsService);
  private readonly priceComparator = inject(PriceComparatorService);

  readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('queryInput');
  readonly selectedIndex = signal(0);
  readonly marketCommands = signal<PaletteCommand[]>([]);
  readonly priceCommands = signal<PaletteCommand[]>([]);

  readonly open = this.palette.open;
  readonly query = this.palette.query;

  readonly results = computed(() => {
    const q = this.query();
    const ship = this.shipCommands.paletteCommands(q);
    const price = this.priceCommands();
    const nav = this.navCommands.search(q, [...ship, ...price, ...this.marketCommands()]);
    return nav;
  });

  constructor() {
    effect(() => {
      if (this.palette.open()) {
        this.selectedIndex.set(0);
        void this.shipCommands.ensureContext();
        void this.loadDynamicCommands(this.query());
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });

    effect(() => {
      const q = this.query();
      void this.loadDynamicCommands(q);
    });
  }

  onQueryChange(value: string): void {
    this.palette.query.set(value);
    this.selectedIndex.set(0);
  }

  onBackdropClick(): void {
    this.palette.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.results();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex.update((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        this.runSelected();
        break;
      case 'Escape':
        event.preventDefault();
        this.palette.close();
        break;
      default:
        break;
    }
  }

  run(cmd: PaletteCommand): void {
    this.palette.close();
    if (cmd.locked) {
      void cmd.execute();
      return;
    }
    void cmd.execute();
  }

  runSelected(): void {
    const cmd = this.results()[this.selectedIndex()];
    if (cmd) this.run(cmd);
  }

  groupLabel(group: PaletteCommand['group']): string {
    switch (group) {
      case 'navigation':
        return 'Navigation';
      case 'ship':
        return 'Ship';
      case 'action':
        return 'Actions';
      default: {
        const _exhaustive: never = group;
        void _exhaustive;
        return '';
      }
    }
  }

  private async loadDynamicCommands(query: string): Promise<void> {
    if (!this.agentStore.isAuthenticated()) return;
    const market = await this.shipCommands.loadDockedMarketCommands(query);
    this.marketCommands.set(market);

    const priceQ = query.trim();
    if (priceQ.toLowerCase().startsWith('prix:') || priceQ.toLowerCase().startsWith('price:')) {
      const symbol = priceQ.split(':')[1]?.trim();
      if (symbol) {
        const cmds = await this.priceComparator.paletteCommandsForSymbol(symbol);
        this.priceCommands.set(cmds);
        return;
      }
    }
    this.priceCommands.set([]);
  }
}
