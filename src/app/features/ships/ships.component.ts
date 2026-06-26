import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipCargo, ShipCooldown, ShipData } from '../../models/ship.model';
import { ShipModule, ShipMount } from '../../models/api.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { DialogService } from '../../shared/services/dialog.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { ShipViewer3dComponent } from './ship-viewer-3d.component';
import { FleetCompareComponent } from './fleet-compare.component';
import { buildPartFlavor, isReadTab } from './ship-flavor';
import {
  formatCondition,
  formatCooldown,
  formatFuel,
  MODAL_TAB_LABELS,
  type ShipModalTab,
} from './ship-hotspots';

type ShipsViewMode = 'hangar' | 'compare';

const REFINE_GOODS = [
  'IRON',
  'COPPER',
  'SILVER',
  'GOLD',
  'ALUMINUM',
  'PLATINUM',
  'URANITE',
  'MERITIUM',
  'FUEL',
];

@Component({
  selector: 'app-ships',
  imports: [FormsModule, ShipViewer3dComponent, FleetCompareComponent],
  templateUrl: './ships.component.html',
  host: { class: 'block h-full min-h-0' },
})
export class ShipsComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(DialogService);

  private readonly viewer = viewChild(ShipViewer3dComponent);

  readonly ships = signal<ShipData[]>([]);
  readonly slideIndex = signal(0);
  readonly mode = signal<ShipsViewMode>('hangar');
  readonly inspectTab = signal<Exclude<ShipModalTab, null> | null>(null);
  readonly currentShip = computed(() => this.ships()[this.slideIndex()] ?? null);
  readonly modalShip = signal<ShipData | null>(null);
  readonly modalTab = signal<ShipModalTab>(null);
  readonly modalLoading = signal(false);
  readonly loading = signal(false);
  readonly actionLoading = signal(false);

  readonly cargo = signal<ShipCargo | null>(null);
  readonly cooldown = signal<ShipCooldown | null>(null);
  readonly navInfo = signal<ShipData['nav'] | null>(null);
  readonly mounts = signal<ShipMount[]>([]);
  readonly modules = signal<ShipModule[]>([]);
  readonly repairQuote = signal<number | null>(null);
  readonly scrapValue = signal<number | null>(null);

  readonly transferTarget = signal('');
  readonly transferSymbol = signal('');
  readonly transferUnits = signal(1);
  readonly jettisonSymbol = signal('');
  readonly jettisonUnits = signal(1);
  readonly mountSymbol = signal('');
  readonly moduleSymbol = signal('');
  readonly refineProduce = signal('IRON');

  readonly refineGoods = REFINE_GOODS;
  readonly modalTabLabels = MODAL_TAB_LABELS;
  readonly formatCooldown = formatCooldown;
  readonly formatCondition = formatCondition;
  readonly formatFuel = formatFuel;

  ngOnInit(): void {
    this.background.setBackground('/assets/spaceships/hangar.png');
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.api.getAllShips();
      this.ships.set(list);
      this.slideIndex.set(0);
      this.syncModalShip(list);
    } catch {
      this.snackbar.show('Failed to load ships', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  private syncModalShip(list: ShipData[]): void {
    const open = this.modalShip();
    if (!open) return;
    const updated = list.find((s) => s.symbol === open.symbol);
    if (updated) this.modalShip.set(updated);
  }

  prev(): void {
    const len = this.ships().length;
    if (!len) return;
    this.inspectTab.set(null);
    this.slideIndex.update((i) => (i <= 0 ? len - 1 : i - 1));
  }

  next(): void {
    const len = this.ships().length;
    if (!len) return;
    this.inspectTab.set(null);
    this.slideIndex.update((i) => (i >= len - 1 ? 0 : i + 1));
  }

  setMode(mode: ShipsViewMode): void {
    this.inspectTab.set(null);
    this.mode.set(mode);
  }

  inspect(ship: ShipData, tab: Exclude<ShipModalTab, null>): void {
    if (isReadTab(tab)) {
      this.inspectTab.set(tab);
    } else {
      void this.openModal(ship, tab);
    }
  }

  closeInspect(): void {
    this.inspectTab.set(null);
    this.viewer()?.resetView();
  }

  manageInspect(ship: ShipData): void {
    const tab = this.inspectTab();
    if (tab) void this.openModal(ship, tab);
  }

  flavorFor(ship: ShipData): string {
    const tab = this.inspectTab();
    return tab ? buildPartFlavor(ship, tab) : '';
  }

  conditionPercent(value: number): number {
    return Math.round(value * 100);
  }

  fuelPercent(ship: ShipData): number {
    if (ship.fuel.capacity <= 0) return 100;
    return Math.round((ship.fuel.current / ship.fuel.capacity) * 100);
  }

  cargoPercent(ship: ShipData): number {
    const cargo = ship.cargo;
    if (!cargo || cargo.capacity <= 0) return 0;
    return Math.round((cargo.units / cargo.capacity) * 100);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'DOCKED':
        return 'sk-status-docked';
      case 'IN_ORBIT':
        return 'sk-status-orbit';
      case 'IN_TRANSIT':
        return 'sk-status-transit';
      default:
        return 'sk-status-unknown';
    }
  }

  async openModal(ship: ShipData, tab: ShipModalTab): Promise<void> {
    if (!tab) return;

    this.modalShip.set(ship);
    this.modalTab.set(tab);
    this.navInfo.set(ship.nav);
    this.cargo.set(ship.cargo ?? null);
    this.cooldown.set(null);
    this.mounts.set([]);
    this.modules.set([]);
    this.repairQuote.set(null);
    this.scrapValue.set(null);
    this.modalLoading.set(true);

    try {
      const fresh = await this.api.getShip(ship.symbol);
      this.modalShip.set(fresh);
      this.navInfo.set(fresh.nav);
      if (fresh.cargo) this.cargo.set(fresh.cargo);

      const others = this.ships().filter((s) => s.symbol !== fresh.symbol);
      if (others.length) this.transferTarget.set(others[0].symbol);

      if (tab === 'nav') await this.refreshNav(fresh.symbol);
      if (tab === 'cargo') await this.refreshCargo(fresh.symbol);
      if (tab === 'upgrades') await this.refreshUpgrades(fresh.symbol);
      if (tab === 'maint') await this.refreshMaintenance(fresh.symbol);
    } catch {
      this.snackbar.show('Failed to load ship details', 'error');
    } finally {
      this.modalLoading.set(false);
    }
  }

  closeModal(): void {
    this.modalShip.set(null);
    this.modalTab.set(null);
    this.modalLoading.set(false);
  }

  modalTitle(tab: ShipModalTab): string {
    if (!tab) return '';
    return this.modalTabLabels[tab];
  }

  async refreshNav(shipSymbol: string): Promise<void> {
    try {
      const [nav, cd] = await Promise.all([
        this.api.getShipNav(shipSymbol),
        this.api.getShipCooldown(shipSymbol),
      ]);
      this.navInfo.set(nav);
      this.cooldown.set(cd);
    } catch {
      this.snackbar.show('Failed to load navigation data', 'error');
    }
  }

  private async refreshCargo(shipSymbol: string): Promise<void> {
    try {
      this.cargo.set(await this.api.getShipCargo(shipSymbol));
    } catch {
      this.snackbar.show('Failed to load cargo', 'error');
    }
  }

  private async refreshUpgrades(shipSymbol: string): Promise<void> {
    try {
      const [mountList, moduleList] = await Promise.all([
        this.api.getMounts(shipSymbol),
        this.api.getShipModules(shipSymbol),
      ]);
      this.mounts.set(mountList);
      this.modules.set(moduleList);
    } catch {
      this.snackbar.show('Failed to load upgrades', 'error');
    }
  }

  private async refreshMaintenance(shipSymbol: string): Promise<void> {
    try {
      const [repair, scrap] = await Promise.all([
        this.api.getRepairQuote(shipSymbol),
        this.api.getScrapValue(shipSymbol),
      ]);
      this.repairQuote.set(repair.transaction?.totalPrice ?? null);
      this.scrapValue.set(scrap.transaction?.totalPrice ?? null);
    } catch {
      this.snackbar.show('Failed to load maintenance quotes', 'error');
    }
  }

  async jettison(shipSymbol: string): Promise<void> {
    const symbol = this.jettisonSymbol().trim();
    if (!symbol) {
      this.snackbar.show('Enter a cargo symbol to jettison', 'warning');
      return;
    }
    this.actionLoading.set(true);
    try {
      await this.api.jettisonCargo(shipSymbol, symbol, this.jettisonUnits());
      await this.refreshCargo(shipSymbol);
      this.snackbar.show('Cargo jettisoned', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Jettison failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async transfer(shipSymbol: string): Promise<void> {
    const target = this.transferTarget().trim();
    const symbol = this.transferSymbol().trim();
    if (!target) {
      this.snackbar.show('Select a destination ship', 'warning');
      return;
    }
    if (!symbol) {
      this.snackbar.show('Enter a cargo symbol to transfer', 'warning');
      return;
    }
    this.actionLoading.set(true);
    try {
      await this.api.transferCargo(shipSymbol, target, symbol, this.transferUnits());
      await this.refreshCargo(shipSymbol);
      this.snackbar.show('Cargo transferred', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Transfer failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  repair(shipSymbol: string): void {
    this.dialog.showInfo(
      'Repair ship',
      `Repair this ship for ${this.repairQuote() ?? '?'} credits?`,
      () => void this.doRepair(shipSymbol),
    );
  }

  private async doRepair(shipSymbol: string): Promise<void> {
    this.actionLoading.set(true);
    try {
      await this.api.repairShip(shipSymbol);
      await this.load();
      const ship = this.modalShip();
      if (ship?.symbol === shipSymbol) {
        await this.refreshMaintenance(shipSymbol);
      }
      this.snackbar.show('Ship repaired', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Repair failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  scrap(shipSymbol: string): void {
    this.dialog.showInfo(
      'Scrap ship',
      `Scrap ${shipSymbol} for ${this.scrapValue() ?? '?'} credits? This cannot be undone.`,
      () => void this.doScrap(shipSymbol),
    );
  }

  private async doScrap(shipSymbol: string): Promise<void> {
    this.actionLoading.set(true);
    try {
      await this.api.scrapShip(shipSymbol);
      this.closeModal();
      await this.load();
      this.snackbar.show('Ship scrapped', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Scrap failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async installMount(shipSymbol: string): Promise<void> {
    const symbol = this.mountSymbol().trim();
    if (!symbol) {
      this.snackbar.show('Enter mount symbol from cargo', 'warning');
      return;
    }
    this.actionLoading.set(true);
    try {
      const result = await this.api.installMount(shipSymbol, symbol);
      this.mounts.set(result.data.mounts ?? []);
      await this.refreshCargo(shipSymbol);
      this.snackbar.show('Mount installed', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Install failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async removeMount(shipSymbol: string, symbol: string): Promise<void> {
    this.actionLoading.set(true);
    try {
      await this.api.removeMount(shipSymbol, symbol);
      await this.refreshUpgrades(shipSymbol);
      this.snackbar.show('Mount removed', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Remove failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async installModule(shipSymbol: string): Promise<void> {
    const symbol = this.moduleSymbol().trim();
    if (!symbol) {
      this.snackbar.show('Enter module symbol from cargo', 'warning');
      return;
    }
    this.actionLoading.set(true);
    try {
      const result = await this.api.installShipModule(shipSymbol, symbol);
      this.modules.set(result.data.modules ?? []);
      await this.refreshCargo(shipSymbol);
      this.snackbar.show('Module installed', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Install failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async removeModule(shipSymbol: string, symbol: string): Promise<void> {
    this.actionLoading.set(true);
    try {
      await this.api.removeShipModule(shipSymbol, symbol);
      await this.refreshUpgrades(shipSymbol);
      this.snackbar.show('Module removed', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Remove failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async refine(shipSymbol: string): Promise<void> {
    this.actionLoading.set(true);
    try {
      await this.api.refineShip(shipSymbol, this.refineProduce());
      await this.refreshCargo(shipSymbol);
      this.snackbar.show('Refining complete', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Refine failed', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  otherShips(current: string): ShipData[] {
    return this.ships().filter((s) => s.symbol !== current);
  }
}
