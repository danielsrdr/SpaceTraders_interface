import { Component, input, output } from '@angular/core';
import { ApiRequestRecord } from './api-explorer.store';

@Component({
  selector: 'app-api-history-panel',
  template: `
    <aside class="sk-panel flex min-h-0 flex-col overflow-hidden">
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="sk-panel-heading m-0 text-sm">History</p>
        @if (history().length) {
          <button type="button" class="sk-btn px-2 py-0.5 text-[10px]" (click)="clear.emit()">Clear</button>
        }
      </div>
      <ul class="min-h-0 flex-1 overflow-y-auto">
        @for (record of history(); track record.id) {
          <li>
            <button
              type="button"
              class="mb-1 w-full rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/10"
              [class.bg-white/15]="selectedId() === record.id"
              (click)="select.emit(record)"
            >
              <div class="flex items-center gap-2">
                <span class="font-bold" [class]="statusClass(record.status)">{{ record.status }}</span>
                <span class="truncate text-white/80">{{ record.method }} {{ record.path }}</span>
                <span class="ml-auto shrink-0 text-white/40">{{ record.durationMs }}ms</span>
              </div>
              <p class="m-0 truncate text-[10px] text-white/45">
                {{ formatTime(record.timestamp) }}
              </p>
            </button>
          </li>
        } @empty {
          <p class="sk-panel-meta text-xs">No requests yet.</p>
        }
      </ul>
    </aside>
  `,
})
export class ApiHistoryPanelComponent {
  readonly history = input<ApiRequestRecord[]>([]);
  readonly selectedId = input<string | null>(null);

  readonly select = output<ApiRequestRecord>();
  readonly clear = output<void>();

  statusClass(status: number): string {
    if (status >= 200 && status < 300) return 'text-emerald-300';
    if (status >= 400) return 'text-rose-300';
    return 'text-amber-300';
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }
}
