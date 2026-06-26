import { Component, computed, inject } from '@angular/core';
import { AgentStore } from '../../../core/state/agent.store';
import { KeyboardShortcutService } from '../../services/keyboard-shortcut.service';

@Component({
  selector: 'app-keyboard-help-overlay',
  templateUrl: './keyboard-help-overlay.component.html',
})
export class KeyboardHelpOverlayComponent {
  readonly agentStore = inject(AgentStore);
  readonly shortcuts = inject(KeyboardShortcutService);

  readonly open = this.shortcuts.helpOpen;

  readonly grouped = computed(() => {
    const map = new Map<string, typeof this.shortcuts.shortcuts>();
    for (const entry of this.shortcuts.shortcuts) {
      const list = map.get(entry.context) ?? [];
      list.push(entry);
      map.set(entry.context, list);
    }
    return map;
  });

  contextLabel(context: string): string {
    switch (context) {
      case 'global':
        return 'Global';
      case 'systems':
        return 'Systems / Flight';
      case 'surface':
        return 'Planetary surface';
      default:
        return context;
    }
  }

  close(): void {
    this.shortcuts.closeHelp();
  }
}
