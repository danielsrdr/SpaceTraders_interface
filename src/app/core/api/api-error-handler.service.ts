import { inject, Injectable, Injector, isDevMode } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { OnlineStatusService } from '../../shared/services/online-status.service';
import { SpaceTradersApiError } from './spacetraders-api-error';

@Injectable({ providedIn: 'root' })
export class ApiErrorHandlerService {
  private readonly injector = inject(Injector);
  private readonly onlineStatus = inject(OnlineStatusService);
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;

  handle(error: SpaceTradersApiError, options?: { suppressGlobalHandler?: boolean }): void {
    if (options?.suppressGlobalHandler) return;

    if (error.status === 401) {
      if (this.logoutTimer) return;
      this.logoutTimer = setTimeout(() => {
        this.logoutTimer = null;
        this.injector.get(AuthService).logout();
      }, 300);
      return;
    }

    if (error.status && error.status >= 500 && isDevMode()) {
      console.debug('[API] server error', error.status, error.message);
    }

    if (!this.onlineStatus.isOnline() && isDevMode()) {
      console.debug('[API] request failed while offline', error.message);
    }
  }
}
