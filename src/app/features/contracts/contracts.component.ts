import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LogbookStore } from '../../core/state/logbook.store';
import { ContractTerms, ContractView, mapContract } from '../../models/contract.model';
import { ShipData } from '../../models/ship.model';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { ProgressionService } from '../progression/progression.service';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { SoundService } from '../../shared/services/sound.service';
import { GoodIconComponent } from '../systems/good-icon.component';
import { goodCategory, goodLabel } from '../systems/trade-good-visuals';
import { ContractMiniMapComponent } from './contract-mini-map.component';
import { MissionDirectorPanelComponent } from '../mission-director/mission-director-panel.component';
import { MissionDirectorService } from '../mission-director/mission-director.service';
import { factionColor } from '../../shared/faction-colors';

type ContractStatus = 'hold' | 'progress' | 'completed';
type DeliveryTerm = ContractTerms['deliver'][number];

@Component({
  selector: 'app-contracts',
  imports: [FormsModule, GoodIconComponent, ContractMiniMapComponent, MissionDirectorPanelComponent],
  templateUrl: './contracts.component.html',
})
export class ContractsComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly discovery = inject(DiscoveryStore);
  private readonly progression = inject(ProgressionService);
  private readonly logbook = inject(LogbookStore);
  private readonly sound = inject(SoundService);
  private readonly router = inject(Router);
  readonly director = inject(MissionDirectorService);
  readonly factionColor = factionColor;

  readonly muted = this.sound.muted;
  readonly celebrate = signal(false);
  readonly goodCategory = goodCategory;
  readonly goodLabel = goodLabel;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;

  readonly contracts = signal<ContractView[]>([]);
  readonly selected = signal<ContractView | null>(null);
  readonly detailLoading = signal(false);
  readonly acceptingId = signal<string | null>(null);
  readonly fulfillingId = signal<string | null>(null);
  readonly deliveringId = signal<string | null>(null);
  readonly showNegotiateModal = signal(false);
  readonly showDeliverModal = signal(false);
  readonly deliverContract = signal<ContractView | null>(null);
  readonly dockedShips = signal<ShipData[]>([]);
  readonly negotiatingShip = signal<string | null>(null);

  readonly deliverShipSymbol = signal('');
  readonly deliverTradeSymbol = signal('');
  readonly deliverUnits = signal(1);

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.load();
  }

  isDeliveryComplete(c: ContractView): boolean {
    return c.deliver.every((d) => (d.unitsFulfilled ?? 0) >= d.unitsRequired);
  }

  statusKey(c: ContractView): ContractStatus {
    if (!c.accepted) return 'hold';
    return c.fulfilled ? 'completed' : 'progress';
  }

  statusLabel(c: ContractView): string {
    const status = this.statusKey(c);
    switch (status) {
      case 'hold':
        return 'On hold';
      case 'progress':
        return 'In progress';
      case 'completed':
        return 'Completed';
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
  }

  progressPct(d: DeliveryTerm): number {
    if (d.unitsRequired <= 0) return 0;
    return Math.min(100, Math.round(((d.unitsFulfilled ?? 0) / d.unitsRequired) * 100));
  }

  totalRemaining(c: ContractView): number {
    return c.deliver.reduce(
      (sum, d) => sum + Math.max(0, d.unitsRequired - (d.unitsFulfilled ?? 0)),
      0,
    );
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  toggleMute(): void {
    this.sound.toggleMute();
  }

  plotCourse(destination: string): void {
    if (!destination) return;
    const system = destination.split('-').slice(0, 2).join('-');
    void this.router.navigate(['/systems'], {
      queryParams: { name: system, travelTo: destination, fallback: '0' },
    });
  }

  private triggerCelebrate(): void {
    this.celebrate.set(true);
    if (this.celebrateTimer) clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(() => this.celebrate.set(false), 1800);
  }

  async load(): Promise<void> {
    try {
      const list = await this.api.getContracts(1, 10);
      this.contracts.set(list);
    } catch {
      this.snackbar.show('Failed to load contracts', 'error');
    }
  }

  async showDetails(contract: ContractView): Promise<void> {
    this.detailLoading.set(true);
    this.selected.set(contract);
    try {
      const detail = await this.api.getContract(contract.id);
      this.selected.set(mapContract(detail));
    } catch {
      this.snackbar.show('Failed to load contract details', 'error');
    } finally {
      this.detailLoading.set(false);
    }
  }

  async accept(contract: ContractView): Promise<void> {
    this.acceptingId.set(contract.id);
    try {
      await this.api.acceptContract(contract.id);
      this.discovery.unlockFactions();
      const briefing = this.director.briefingForContract(contract);
      this.progression.recordContract({
        payment: contract.paymentAccepted,
        faction: contract.faction,
        contract,
        event: 'accept',
      });
      this.logbook.recordContract(`Accepted ${contract.type} contract — ${briefing.title}`, undefined, {
        contractId: contract.id,
        directorLine: briefing.voiceLine,
      });
      this.sound.playAccept();
      await this.load();
      this.snackbar.show('Contract accepted', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to accept contract';
      this.snackbar.show(msg, 'error');
    } finally {
      this.acceptingId.set(null);
    }
  }

  async fulfill(contract: ContractView): Promise<void> {
    this.fulfillingId.set(contract.id);
    try {
      await this.api.fulfillContract(contract.id);
      const debrief = this.director.debriefForContract(contract);
      this.progression.recordContract({
        payment: contract.paymentFulfill,
        faction: contract.faction,
        contract,
        event: 'fulfill',
      });
      this.logbook.recordContract(
        `Fulfilled ${contract.type} contract (+${contract.paymentFulfill.toLocaleString()}c)`,
        undefined,
        { contractId: contract.id, directorLine: debrief.debrief },
      );
      this.sound.playFulfill();
      this.triggerCelebrate();
      await this.load();
      this.snackbar.show('Contract fulfilled', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fulfill contract';
      this.snackbar.show(msg, 'error');
    } finally {
      this.fulfillingId.set(null);
    }
  }

  async openDeliver(contract: ContractView): Promise<void> {
    try {
      const ships = await this.api.getAllShips();
      const docked = ships.filter((s) => s.nav.status === 'DOCKED');
      if (!docked.length) {
        this.snackbar.show('No docked ships available for delivery.', 'warning');
        return;
      }
      this.dockedShips.set(docked);
      this.deliverContract.set(contract);
      this.deliverShipSymbol.set(docked[0]?.symbol ?? '');
      this.deliverTradeSymbol.set(contract.deliver[0]?.tradeSymbol ?? '');
      this.deliverUnits.set(1);
      this.showDeliverModal.set(true);
    } catch {
      this.snackbar.show('Failed to load ships', 'error');
    }
  }

  closeDeliver(): void {
    this.showDeliverModal.set(false);
    this.deliverContract.set(null);
  }

  async submitDeliver(): Promise<void> {
    const contract = this.deliverContract();
    if (!contract) return;
    const units = this.deliverUnits();
    const tradeSymbol = this.deliverTradeSymbol();
    this.deliveringId.set(contract.id);
    try {
      await this.api.deliverContract(
        contract.id,
        this.deliverShipSymbol(),
        tradeSymbol,
        units,
      );
      this.progression.recordContract({
        faction: contract.faction,
        contract,
        event: 'deliver',
      });
      this.logbook.recordContract(`Delivered ${units} ${tradeSymbol} to ${contract.type} contract`, undefined, {
        contractId: contract.id,
      });
      this.closeDeliver();
      await this.load();
      this.snackbar.show('Cargo delivered', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delivery failed';
      this.snackbar.show(msg, 'error');
    } finally {
      this.deliveringId.set(null);
    }
  }

  async openNegotiate(): Promise<void> {
    try {
      const ships = await this.api.getAllShips();
      const docked = ships.filter((s) => s.nav.status === 'DOCKED');
      if (!docked.length) {
        this.snackbar.show(
          'No docked ships available. Dock a ship at a faction HQ to negotiate.',
          'warning',
        );
        return;
      }
      this.dockedShips.set(docked);
      this.showNegotiateModal.set(true);
    } catch {
      this.snackbar.show('Failed to load ships', 'error');
    }
  }

  closeNegotiate(): void {
    this.showNegotiateModal.set(false);
  }

  async negotiate(shipSymbol: string): Promise<void> {
    this.negotiatingShip.set(shipSymbol);
    try {
      const contract = await this.api.negotiateContract(shipSymbol);
      this.logbook.recordContract(`Negotiated ${contract.type} contract`);
      this.closeNegotiate();
      this.snackbar.show(
        `New contract negotiated! Type: ${contract.type}, Payment: ${contract.paymentFulfill} credits`,
        'success',
        5000,
      );
      await this.load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Negotiation failed';
      this.snackbar.show(msg, 'error', 5000);
    } finally {
      this.negotiatingShip.set(null);
    }
  }
}
