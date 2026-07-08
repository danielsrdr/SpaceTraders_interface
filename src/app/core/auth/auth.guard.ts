import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStorageService } from '../../services/token-storage.service';
import { AgentStore } from '../state/agent.store';

export const authGuard: CanActivateFn = () => {
  const agentStore = inject(AgentStore);
  const tokenStorage = inject(TokenStorageService);
  const router = inject(Router);
  if (tokenStorage.isAuthenticated() && agentStore.isAuthenticated()) return true;
  return router.createUrlTree(['/register']);
};

export const guestGuard: CanActivateFn = () => {
  const agentStore = inject(AgentStore);
  const router = inject(Router);
  if (!agentStore.isAuthenticated()) return true;
  return router.createUrlTree(['/home']);
};
