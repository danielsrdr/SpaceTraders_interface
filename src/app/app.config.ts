import { ApplicationConfig, APP_INITIALIZER, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideSpaceTradersConfig } from './services/cache.service';
import { AuthService } from './core/auth/auth.service';
import { Router } from '@angular/router';

function initializeApp() {
  const auth = inject(AuthService);
  const router = inject(Router);
  return async () => {
    const relogged = await auth.relog();
    const path = router.url;
    if (!relogged && !path.startsWith('/login') && !path.startsWith('/register')) {
      await router.navigate(['/register']);
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideSpaceTradersConfig(),
    { provide: APP_INITIALIZER, useFactory: initializeApp, multi: true },
  ],
};
