import { Component, inject, OnInit, signal } from '@angular/core';
import { GameStatus } from '../../models/api.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);

  readonly status = signal<GameStatus | null>(null);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.status.set(await this.api.getStatus());
    } catch {
      this.snackbar.show('Failed to load server status', 'error');
    } finally {
      this.loading.set(false);
    }
  }
}
