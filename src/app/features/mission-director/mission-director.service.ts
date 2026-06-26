import { computed, inject, Injectable } from '@angular/core';
import { MissionDirectorStore } from '../../core/state/mission-director.store';
import { ContractView } from '../../models/contract.model';
import { RadioService } from '../../shared/services/radio.service';
import { arcForFaction, MISSION_ARCS } from './mission-arcs';
import { briefingFor, debriefFor } from './mission-briefings';
import {
  ContractDirectorEvent,
  MissionBriefing,
  MissionArc,
  POINTS_BY_EVENT,
  tierLabel,
} from './mission-director.models';

@Injectable({ providedIn: 'root' })
export class MissionDirectorService {
  private readonly store = inject(MissionDirectorStore);
  private readonly radio = inject(RadioService);

  readonly totalFulfilled = this.store.totalFulfilled;
  readonly recentOperations = computed(() => this.store.recentOperations(5));

  readonly activeArc = computed<MissionArc | null>(() => {
    const id = this.store.activeArcId();
    if (!id) return null;
    return MISSION_ARCS.find((a) => a.id === id) ?? null;
  });

  briefingForContract(contract: ContractView): MissionBriefing {
    return briefingFor(contract.type, contract.faction);
  }

  debriefForContract(contract: ContractView): MissionBriefing {
    return debriefFor(contract.type, contract.faction);
  }

  standingLabel(factionSymbol: string): string {
    return tierLabel(this.store.standing(factionSymbol).tier);
  }

  standingPoints(factionSymbol: string): number {
    return this.store.standing(factionSymbol).points;
  }

  tierProgress(factionSymbol: string): number {
    const points = this.standingPoints(factionSymbol);
    return Math.min(1, points / 200);
  }

  nextArcBeat(factionSymbol: string): string | null {
    const arc = this.activeArc() ?? arcForFaction(factionSymbol);
    if (!arc) return null;
    const fulfilled = this.store.standing(factionSymbol).contractsFulfilled;
    const beat = arc.beats[fulfilled % arc.beats.length];
    return beat?.contractType ?? null;
  }

  onContractEvent(
    event: ContractDirectorEvent,
    contract: Pick<ContractView, 'id' | 'type' | 'faction'>,
  ): { briefing?: MissionBriefing; debrief?: MissionBriefing; directorLine?: string } {
    const faction = contract.faction;
    const points = POINTS_BY_EVENT[event];
    if (event === 'accept') {
      this.store.addPoints(faction, points, 'accept');
      const arc = arcForFaction(faction);
      if (arc && !this.store.activeArcId()) {
        this.store.setActiveArc(arc.id);
      }
      const briefing = briefingFor(contract.type, faction);
      this.radio.announceDirector(briefing.voiceLine, faction);
      return { briefing, directorLine: briefing.voiceLine };
    }

    if (event === 'deliver') {
      this.store.addPoints(faction, points, 'accept');
      return {};
    }

    const debrief = debriefFor(contract.type, faction);
    this.store.addPoints(faction, points, 'fulfill');
    this.store.recordOperation({
      contractId: contract.id,
      factionSymbol: faction,
      contractType: contract.type,
      briefingTitle: debrief.title,
      debrief: debrief.debrief,
      fulfilledAt: Date.now(),
      arcId: this.store.activeArcId() ?? undefined,
    });
    const arc = this.activeArc();
    if (arc && this.store.standing(faction).contractsFulfilled >= arc.beats.length) {
      this.store.completeArc(arc.id);
    }
    this.radio.announceDirector(debrief.voiceLine, faction);
    return { debrief, directorLine: debrief.debrief };
  }
}
