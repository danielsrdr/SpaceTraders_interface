import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { AuthService } from '../../core/auth/auth.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { FactionThemeService } from '../../shared/services/faction-theme.service';
import { OnboardingStore } from '../../core/state/onboarding.store';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  private readonly agentStore = inject(AgentStore);
  private readonly auth = inject(AuthService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  readonly factionTheme = inject(FactionThemeService);
  private readonly onboarding = inject(OnboardingStore);

  readonly agent = computed(() => this.agentStore.agent());

  ngOnInit(): void {
    this.background.setBackground('/assets/profile/background.png');
  }

  copyToken(): void {
    const token = this.agent()?.token;
    if (token) {
      void navigator.clipboard.writeText(token);
      this.snackbar.show('Token copied to clipboard!', 'success');
    }
  }

  logout(): void {
    this.auth.logout();
    this.snackbar.show('Logged out successfully!', 'success');
  }

  toggleFactionTheme(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.factionTheme.setEnabled(checked);
  }

  replayTour(): void {
    this.onboarding.restart();
    this.snackbar.show('Tour restarted', 'info');
  }
}
