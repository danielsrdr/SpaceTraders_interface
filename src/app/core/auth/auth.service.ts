import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../state/agent.store';
import { LogbookStore } from '../state/logbook.store';
import { FlightRecorderStore } from '../state/flight-recorder.store';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { TokenStorageService } from '../../services/token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly agentStore = inject(AgentStore);
  private readonly logbook = inject(LogbookStore);
  private readonly flightRecorder = inject(FlightRecorderStore);
  private readonly router = inject(Router);

  hasStoredToken(): boolean {
    return this.tokenStorage.isAuthenticated();
  }

  async relog(): Promise<boolean> {
    if (!this.hasStoredToken()) return false;
    try {
      const agent = await this.api.getAgent();
      this.agentStore.setAgent(agent);
      void this.logbook.attach(agent.name);
      this.flightRecorder.attach(agent.name);
      return true;
    } catch {
      this.tokenStorage.clearToken();
      this.agentStore.clear();
      return false;
    }
  }

  async login(token: string, remember: boolean): Promise<string[]> {
    const errors = this.validateLogin(token);
    if (errors.length) return errors;

    this.tokenStorage.setToken(token, remember);
    try {
      const agent = await this.api.getAgent();
      this.agentStore.setAgent(agent);
      void this.logbook.attach(agent.name);
      this.flightRecorder.attach(agent.name);
      return [];
    } catch {
      this.tokenStorage.clearToken();
      return ['Token invalide.'];
    }
  }

  async register(
    name: string,
    faction: string,
    accountToken: string,
    remember: boolean,
  ): Promise<string[]> {
    const errors = this.validateRegister(name, faction, accountToken);
    if (errors.length) return errors;

    try {
      const agent = await this.api.register(name, faction, accountToken);
      this.tokenStorage.setToken(agent.token, remember);
      this.agentStore.setAgent(agent);
      void this.logbook.attach(agent.name);
      this.flightRecorder.attach(agent.name);
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      return [message];
    }
  }

  logout(): void {
    this.tokenStorage.clearToken();
    this.api.clearCaches();
    this.agentStore.clear();
    this.logbook.detach();
    this.flightRecorder.detach();
    void this.router.navigate(['/login']);
  }

  private validateLogin(token: string): string[] {
    const errors: string[] = [];
    if (!token?.trim()) errors.push('token is required');
    return errors;
  }

  private validateRegister(name: string, faction: string, accountToken: string): string[] {
    const errors: string[] = [];
    if (!name?.trim()) errors.push('name is required');
    if (name.length > 14) errors.push('name max length is 14');
    if (!faction?.trim()) errors.push('faction is required');
    if (!accountToken?.trim()) errors.push('account token is required');
    return errors;
  }
}
