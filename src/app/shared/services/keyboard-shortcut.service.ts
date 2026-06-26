import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { CommandPaletteService } from './command-palette.service';

export interface ShortcutEntry {
  keys: string;
  description: string;
  context: 'global' | 'systems' | 'surface';
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService {
  private readonly palette = inject(CommandPaletteService);
  private readonly destroyRef = inject(DestroyRef);

  readonly helpOpen = signal(false);

  readonly shortcuts: ShortcutEntry[] = [
    { keys: 'Ctrl+K', description: 'Open command palette', context: 'global' },
    { keys: '?', description: 'Show keyboard shortcuts', context: 'global' },
    { keys: '1–9', description: 'Select fleet ship (flight view)', context: 'systems' },
    { keys: '← / →', description: 'Cycle fleet ships (flight view)', context: 'systems' },
    { keys: 'P', description: 'Reset camera', context: 'systems' },
    { keys: 'G', description: 'Toggle flight mode overlay', context: 'systems' },
    { keys: 'C', description: 'Toggle cockpit view', context: 'systems' },
    { keys: 'E', description: 'Interact (surface)', context: 'surface' },
    { keys: 'Q', description: 'Quick action (surface)', context: 'surface' },
    { keys: 'Esc', description: 'Exit surface / close overlays', context: 'surface' },
  ];

  constructor() {
    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    document.addEventListener('keydown', onKeyDown);
    this.destroyRef.onDestroy(() => document.removeEventListener('keydown', onKeyDown));
  }

  /** True when global overlays consume keyboard input. */
  blocksLocalShortcuts(): boolean {
    return this.palette.open() || this.helpOpen();
  }

  openHelp(): void {
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  toggleHelp(): void {
    this.helpOpen.update((v) => !v);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }

    if (this.palette.open()) return;

    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggleHelp();
    }

    if (event.key === 'Escape' && this.helpOpen()) {
      event.preventDefault();
      this.closeHelp();
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    return target.isContentEditable;
  }
}
