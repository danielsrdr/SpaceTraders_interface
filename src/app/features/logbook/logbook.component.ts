import { Component, computed, inject, OnInit } from '@angular/core';
import { logCategoryClass, LogbookStore, LogCategory, LogEntry } from '../../core/state/logbook.store';
import { PageBackgroundService } from '../../shared/services/page-background.service';

@Component({
  selector: 'app-logbook',
  templateUrl: './logbook.component.html',
})
export class LogbookComponent implements OnInit {
  readonly logbook = inject(LogbookStore);
  private readonly background = inject(PageBackgroundService);

  readonly entriesReversed = computed(() => [...this.logbook.entries()].reverse());

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
  }

  formatDay(entry: LogEntry): string {
    return this.logbook.formatDay(entry);
  }

  categoryClass(category: LogCategory): string {
    return logCategoryClass(category);
  }

  clear(): void {
    this.logbook.clear();
  }
}
