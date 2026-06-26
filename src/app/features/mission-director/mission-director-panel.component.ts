import { Component, computed, inject } from '@angular/core';
import { factionColor } from '../../shared/faction-colors';
import { MissionDirectorService } from './mission-director.service';
import { tierLabel } from './mission-director.models';

@Component({
  selector: 'app-mission-director-panel',
  template: `
    <aside class="sk-panel">
      <p class="sk-panel-heading">Mission Director</p>
      @if (activeArc(); as arc) {
        <p class="m-0 text-sm text-cyan-200">{{ arc.title }}</p>
        <p class="sk-panel-meta">Arc actif · {{ arc.factionSymbol }}</p>
        @if (nextBeat(); as beat) {
          <p class="mt-2 text-xs text-white/60">Prochain objectif : contrat {{ beat }}</p>
        }
      } @else {
        <p class="sk-panel-meta">Acceptez un contrat faction pour lancer une campagne.</p>
      }

      @if (recent().length) {
        <div class="mt-4 border-t border-white/10 pt-3">
          <p class="m-0 text-[10px] tracking-[0.15em] text-white/45 uppercase">Ops récentes</p>
          <ul class="m-0 mt-2 list-none space-y-2 p-0">
            @for (op of recent(); track op.contractId + op.fulfilledAt) {
              <li class="text-xs">
                <span [style.color]="factionTint(op.factionSymbol)">{{ op.factionSymbol }}</span>
                · {{ op.briefingTitle }}
                <span class="block text-white/45">{{ op.debrief }}</span>
              </li>
            }
          </ul>
        </div>
      }
    </aside>
  `,
})
export class MissionDirectorPanelComponent {
  private readonly director = inject(MissionDirectorService);

  readonly activeArc = this.director.activeArc;
  readonly recent = this.director.recentOperations;

  readonly nextBeat = computed(() => {
    const arc = this.activeArc();
    if (!arc) return null;
    return this.director.nextArcBeat(arc.factionSymbol);
  });

  factionTint(symbol: string): string {
    return factionColor(symbol);
  }

  tierLabel = tierLabel;
}
