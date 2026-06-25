import { Component, computed, inject, signal } from '@angular/core';
import { AgentStore } from '../../../core/state/agent.store';
import { logCategoryClass, LogbookStore, LogCategory, LogEntry } from '../../../core/state/logbook.store';

@Component({
  selector: 'app-logbook-drawer',
  templateUrl: './logbook-drawer.component.html',
})
export class LogbookDrawerComponent {
  readonly agentStore = inject(AgentStore);
  readonly logbook = inject(LogbookStore);

  readonly open = signal(false);
  readonly entriesReversed = computed(() => [...this.logbook.entries()].reverse());

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  formatDay(entry: LogEntry): string {
    return this.logbook.formatDay(entry);
  }

  categoryClass(category: LogCategory): string {
    return logCategoryClass(category);
  }
}
