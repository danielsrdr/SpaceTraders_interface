import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthService } from '../../core/auth/auth.service';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { FactionData } from '../../models/faction.model';
import { PageBackgroundService } from '../../shared/services/page-background.service';

interface RegisterModel {
  accountToken: string;
  name: string;
  faction: string;
  remember: boolean;
}

@Component({
  selector: 'app-register',
  imports: [FormField, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(SpaceTradersApiService);
  private readonly router = inject(Router);
  private readonly background = inject(PageBackgroundService);

  readonly registerModel = signal<RegisterModel>({
    accountToken: '',
    name: '',
    faction: '',
    remember: false,
  });
  readonly registerForm = form(this.registerModel, (schema) => {
    required(schema.accountToken);
    required(schema.name);
    required(schema.faction);
  });

  readonly factions = signal<FactionData[]>([]);
  readonly errors = signal<string[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.loadFactions();
  }

  private async loadFactions(): Promise<void> {
    try {
      const list = await this.api.getAllFactions();
      this.factions.set(list);
    } catch {
      this.errors.set(['Failed to load factions.']);
    }
  }

  async submit(): Promise<void> {
    this.errors.set([]);
    this.loading.set(true);
    const model = this.registerModel();
    const errs = await this.auth.register(
      model.name,
      model.faction,
      model.accountToken,
      model.remember,
    );
    this.loading.set(false);
    if (errs.length) {
      this.errors.set(errs);
      return;
    }
    await this.router.navigate(['/home']);
  }

  cancel(): void {
    this.registerModel.set({ accountToken: '', name: '', faction: '', remember: false });
    this.errors.set([]);
  }
}
