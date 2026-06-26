import { Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-json-tree',
  imports: [JsonTreeComponent],
  template: `
    @if (isObject(data())) {
      <ul class="m-0 list-none pl-3 font-mono text-xs">
        @for (entry of entries(); track entry.key) {
          <li class="py-0.5">
            @if (isExpandable(entry.value)) {
              <button
                type="button"
                class="text-left text-cyan-300/90 hover:text-cyan-200"
                (click)="toggle(entry.key)"
              >
                {{ isOpen(entry.key) ? '▼' : '▶' }} {{ entry.key }}:
              </button>
              @if (isOpen(entry.key)) {
                <app-json-tree [data]="entry.value" />
              } @else {
                <span class="text-white/50">{{ preview(entry.value) }}</span>
              }
            } @else {
              <span class="text-cyan-300/70">{{ entry.key }}:</span>
              <span class="ml-1 text-emerald-200/90">{{ formatLeaf(entry.value) }}</span>
            }
          </li>
        }
      </ul>
    } @else if (isArrayData()) {
      <ul class="m-0 list-none pl-3 font-mono text-xs">
        @for (item of asArray(); track $index) {
          <li class="py-0.5">
            <span class="text-white/40">[{{ $index }}]</span>
            <app-json-tree [data]="item" />
          </li>
        }
      </ul>
    } @else {
      <span class="font-mono text-xs text-emerald-200/90">{{ formatLeaf(data()) }}</span>
    }
  `,
})
export class JsonTreeComponent {
  readonly data = input<unknown>(null);

  private readonly openKeys = signal<Set<string>>(new Set());

  entries(): { key: string; value: unknown }[] {
    const value = this.data();
    if (!this.isObject(value)) return [];
    return Object.entries(value).map(([key, val]) => ({ key, value: val }));
  }

  readonly asArray = computed(() => (Array.isArray(this.data()) ? (this.data() as unknown[]) : []));

  readonly isArrayData = computed(() => Array.isArray(this.data()));

  toggle(key: string): void {
    this.openKeys.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  isOpen(key: string): boolean {
    return this.openKeys().has(key);
  }

  isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  isExpandable(value: unknown): boolean {
    return value !== null && typeof value === 'object';
  }

  preview(value: unknown): string {
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (this.isObject(value)) return '{…}';
    return String(value);
  }

  formatLeaf(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
  }
}
