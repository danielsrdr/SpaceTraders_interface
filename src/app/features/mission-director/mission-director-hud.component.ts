import { Component, input, inject } from '@angular/core';
import { ContractView } from '../../models/contract.model';
import { factionColor } from '../../shared/faction-colors';
import { MissionDirectorService } from './mission-director.service';

@Component({
  selector: 'app-mission-director-hud',
  template: `
    @if (contract(); as c) {
      <div class="rounded border border-white/10 bg-black/50 px-2 py-1 text-[10px]">
        <span [style.color]="factionColor(c.faction)">Director</span>
        <span class="text-white/70"> · {{ director.briefingForContract(c).stakes }}</span>
      </div>
    }
  `,
})
export class MissionDirectorHudComponent {
  readonly contract = input<ContractView | null>(null);
  readonly director = inject(MissionDirectorService);
  readonly factionColor = factionColor;
}
