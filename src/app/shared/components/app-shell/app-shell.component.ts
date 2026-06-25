import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageBackgroundService } from '../../services/page-background.service';
import { SideNavComponent } from '../side-nav/side-nav.component';
import { SnackbarComponent } from '../snackbar/snackbar.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { LogbookDrawerComponent } from '../logbook-drawer/logbook-drawer.component';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    SideNavComponent,
    SnackbarComponent,
    ConfirmDialogComponent,
    LogbookDrawerComponent,
  ],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  readonly background = inject(PageBackgroundService);
}
