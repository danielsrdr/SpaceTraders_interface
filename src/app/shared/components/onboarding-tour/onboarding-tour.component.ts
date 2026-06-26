import { Component, computed, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../../core/state/agent.store';
import { OnboardingStore } from '../../../core/state/onboarding.store';
import { ONBOARDING_STEPS } from '../../onboarding/onboarding-steps';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-onboarding-tour',
  templateUrl: './onboarding-tour.component.html',
})
export class OnboardingTourComponent {
  readonly agentStore = inject(AgentStore);
  private readonly onboarding = inject(OnboardingStore);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly steps = ONBOARDING_STEPS;
  readonly stepIndex = this.onboarding.stepIndex;
  readonly active = computed(() => this.onboarding.shouldShow() && this.agentStore.isAuthenticated());

  readonly currentStep = computed(() => this.steps[this.stepIndex()] ?? null);
  readonly isLast = computed(() => this.stepIndex() >= this.steps.length - 1);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      untracked(() => {
        if (agent) {
          this.onboarding.attach(agent.name);
        } else {
          this.onboarding.detach();
        }
      });
    });

    effect(() => {
      const step = this.currentStep();
      if (!step?.route || !this.active()) return;
      untracked(() => {
        void this.router.navigate([step.route!]);
      });
    });
  }

  next(): void {
    if (this.isLast()) {
      this.onboarding.complete();
      this.snackbar.show('Tour complete — good hunting!', 'success', 4000);
      return;
    }
    this.onboarding.next();
  }

  skip(): void {
    this.onboarding.dismiss();
  }
}
