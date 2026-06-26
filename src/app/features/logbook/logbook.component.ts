import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { logCategoryClass, LogbookStore, LogCategory, LogEntry } from '../../core/state/logbook.store';
import { FlightRecorderStore, Voyage } from '../../core/state/flight-recorder.store';
import { PageBackgroundService } from '../../shared/services/page-background.service';

@Component({
  selector: 'app-logbook',
  templateUrl: './logbook.component.html',
})
export class LogbookComponent implements OnInit {
  readonly logbook = inject(LogbookStore);
  readonly flightRecorder = inject(FlightRecorderStore);
  private readonly router = inject(Router);
  private readonly background = inject(PageBackgroundService);

  readonly entriesReversed = computed(() => [...this.logbook.entries()].reverse());
  readonly voyages = this.flightRecorder.recent;

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
  }

  formatDay(entry: LogEntry): string {
    return this.logbook.formatDay(entry);
  }

  categoryClass(category: LogCategory): string {
    return logCategoryClass(category);
  }

  formatVoyageDuration(voyage: Voyage): string {
    const mins = Math.max(1, Math.round((voyage.arrivalTime - voyage.departureTime) / 60_000));
    return `${mins} min`;
  }

  formatVoyageDate(voyage: Voyage): string {
    return new Date(voyage.departureTime).toLocaleString();
  }

  replay(voyage: Voyage): void {
    void this.router.navigate(['/systems'], {
      queryParams: { name: voyage.systemSymbol, replay: voyage.id, fallback: '0' },
    });
  }

  clear(): void {
    this.logbook.clear();
  }

  clearVoyages(): void {
    this.flightRecorder.clear();
  }
}
