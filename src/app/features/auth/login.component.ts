import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthService } from '../../core/auth/auth.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';

interface LoginModel {
  token: string;
  remember: boolean;
}

@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly background = inject(PageBackgroundService);

  readonly quickstartUrl = 'https://docs.spacetraders.io/quickstart/new-game';

  readonly loginModel = signal<LoginModel>({ token: '', remember: false });
  readonly loginForm = form(this.loginModel, (schema) => {
    required(schema.token);
  });

  readonly errors = signal<string[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
  }

  async submit(): Promise<void> {
    this.errors.set([]);
    this.loading.set(true);
    const model = this.loginModel();
    const errs = await this.auth.login(model.token, model.remember);
    this.loading.set(false);
    if (errs.length) {
      this.errors.set(errs);
      return;
    }
    await this.router.navigate(['/home']);
  }

  cancel(): void {
    this.loginModel.set({ token: '', remember: false });
    this.errors.set([]);
  }

  openQuickstart(): void {
    window.open(this.quickstartUrl, 'spacetraders-quickstart', 'width=960,height=720,noopener,noreferrer');
  }
}
