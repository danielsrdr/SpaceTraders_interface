import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AppShellComponent } from './shared/components/app-shell/app-shell.component';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { ProfileComponent } from './features/profile/profile.component';
import { LeaderboardComponent } from './features/leaderboard/leaderboard.component';
import { ContractsComponent } from './features/contracts/contracts.component';
import { ApiExplorerComponent } from './features/api-explorer/api-explorer.component';
import { FactionsComponent } from './features/factions/factions.component';
import { SupplyChainComponent } from './features/data/supply-chain.component';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
      { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
      { path: 'home', component: HomeComponent, canActivate: [authGuard] },
      { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
      { path: 'leaderboard', component: LeaderboardComponent, canActivate: [authGuard] },
      { path: 'contracts', component: ContractsComponent, canActivate: [authGuard] },
      {
        path: 'ships',
        loadComponent: () => import('./features/ships/ships.component').then((m) => m.ShipsComponent),
        canActivate: [authGuard],
      },
      {
        path: 'autopilot',
        loadComponent: () =>
          import('./features/automation/autopilot-panel.component').then((m) => m.AutopilotPanelComponent),
        canActivate: [authGuard],
      },
      { path: 'factions', component: FactionsComponent, canActivate: [authGuard] },
      {
        path: 'systems',
        loadComponent: () =>
          import('./features/systems/system-map.component').then((m) => m.SystemMapComponent),
        canActivate: [authGuard],
      },
      {
        path: 'logbook',
        loadComponent: () => import('./features/logbook/logbook.component').then((m) => m.LogbookComponent),
        canActivate: [authGuard],
      },
      { path: 'data', component: SupplyChainComponent, canActivate: [authGuard] },
      { path: 'api', component: ApiExplorerComponent, canActivate: [authGuard] },
      { path: '**', redirectTo: 'home' },
    ],
  },
];
