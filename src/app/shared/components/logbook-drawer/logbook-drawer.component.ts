import { Component, computed, inject } from '@angular/core';
import { AgentStore } from '../../../core/state/agent.store';
import { logCategoryClass, LogbookStore, LogCategory, LogEntry } from '../../../core/state/logbook.store';
import { LogbookDrawerService } from '../../services/logbook-drawer.service';

@Component({
  selector: 'app-logbook-drawer',
  templateUrl: './logbook-drawer.component.html',
})
export class LogbookDrawerComponent {
  readonly agentStore = inject(AgentStore);
  readonly logbook = inject(LogbookStore);
  readonly drawer = inject(LogbookDrawerService);

  readonly open = this.drawer.open;
  readonly entriesReversed = computed(() => [...this.logbook.entries()].reverse());

  toggle(): void {
    this.drawer.toggle();
  }

  close(): void {
    this.drawer.close();
  }

  formatDay(entry: LogEntry): string {
    return this.logbook.formatDay(entry);
  }

  categoryClass(category: LogCategory): string {
    return logCategoryClass(category);
  }
}
