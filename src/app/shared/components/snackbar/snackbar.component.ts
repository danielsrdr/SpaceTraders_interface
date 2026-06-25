import { Component, inject } from '@angular/core';
import { SnackbarService, SnackbarType } from '../../services/snackbar.service';

@Component({
  selector: 'app-snackbar',
  templateUrl: './snackbar.component.html',
})
export class SnackbarComponent {
  readonly snackbar = inject(SnackbarService);

  snackbarBg(type: SnackbarType): string {
    const map: Record<SnackbarType, string> = {
      success: 'bg-[#004422]',
      error: 'bg-[#440000]',
      warning: 'bg-[#443300]',
      info: 'bg-[#001144]',
    };
    return map[type];
  }
}
