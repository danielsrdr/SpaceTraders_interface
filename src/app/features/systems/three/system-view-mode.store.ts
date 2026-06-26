import { Injectable, signal } from '@angular/core';
import { PlanetView } from '../../../models/system.model';
import { TravelPlanStep } from '../travel-plan';
import { SystemViewMode } from './system-view-mode';

export type ViewModeTransition =
  | { type: 'START_LANDING'; planet: PlanetView; pendingSteps: TravelPlanStep[] }
  | { type: 'LANDING_COMPLETE' }
  | { type: 'EXIT_SURFACE' }
  | { type: 'LAUNCH_COMPLETE' }
  | { type: 'RESET_FLIGHT' };

@Injectable({ providedIn: 'root' })
export class SystemViewModeStore {
  readonly viewMode = signal<SystemViewMode>('flight');
  readonly landingPlanet = signal<PlanetView | null>(null);
  readonly surfaceEntryActive = signal(false);
  readonly launchHandoffActive = signal(false);
  readonly pendingTravelSteps = signal<TravelPlanStep[]>([]);
  readonly pendingMarketOpen = signal(false);

  dispatch(transition: ViewModeTransition): void {
    switch (transition.type) {
      case 'START_LANDING':
        this.pendingTravelSteps.set(transition.pendingSteps);
        this.landingPlanet.set(transition.planet);
        this.viewMode.set('landing');
        break;
      case 'LANDING_COMPLETE':
        this.surfaceEntryActive.set(true);
        this.viewMode.set('surface');
        this.landingPlanet.set(null);
        break;
      case 'EXIT_SURFACE':
        this.viewMode.set('launch');
        break;
      case 'LAUNCH_COMPLETE':
        this.launchHandoffActive.set(true);
        this.viewMode.set('flight');
        setTimeout(() => this.launchHandoffActive.set(false), 2200);
        break;
      case 'RESET_FLIGHT':
        this.viewMode.set('flight');
        this.landingPlanet.set(null);
        this.surfaceEntryActive.set(false);
        this.launchHandoffActive.set(false);
        this.pendingTravelSteps.set([]);
        break;
      default: {
        const _exhaustive: never = transition;
        void _exhaustive;
      }
    }
  }

  onSurfaceEntryComplete(): void {
    this.surfaceEntryActive.set(false);
  }

  clearPendingTravelSteps(): TravelPlanStep[] {
    const steps = this.pendingTravelSteps();
    this.pendingTravelSteps.set([]);
    return steps;
  }

  takePendingTravelSteps(): TravelPlanStep[] {
    return this.clearPendingTravelSteps();
  }
}
