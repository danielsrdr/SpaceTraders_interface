import { Component, computed, input, output } from '@angular/core';
import { MarketTradeGood } from '../../models/system.model';
import { GoodIconComponent } from './good-icon.component';
import { GoodCategory, goodCategory, goodLabel } from './trade-good-visuals';

@Component({
  selector: 'app-trade-good-row',
  imports: [GoodIconComponent],
  template: `
    <button
      type="button"
      class="sk-crt-row w-full text-left"
      [class.sk-crt-row--active]="selected()"
      (click)="pick.emit(good().symbol)"
    >
      <app-good-icon [category]="category()" />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1">
          <span class="truncate text-xs text-white">{{ label() }}</span>
          <span class="ml-auto text-[10px] tracking-wide text-phosphor-dim">{{ good().type }}</span>
        </div>
        <div class="flex items-center gap-2 text-[11px]">
          <span class="text-phosphor-dim">buy</span>
          <span class="text-white">{{ good().purchasePrice }}</span>
          <span class="text-phosphor-dim">sell</span>
          <span class="text-white">{{ good().sellPrice }}</span>
          <span class="ml-auto text-[10px] text-phosphor-dim">{{ good().supply }}</span>
        </div>
        @if (heldUnits() > 0) {
          <div class="mt-1 flex items-center gap-1.5">
            <div class="sk-gauge flex-1">
              <div class="sk-gauge-fill" [style.width.%]="gaugePct()"></div>
            </div>
            <span class="shrink-0 text-[10px] text-phosphor">
              {{ heldUnits() }} × = {{ proceeds() }}c
            </span>
          </div>
        }
      </div>
    </button>
  `,
})
export class TradeGoodRowComponent {
  readonly good = input.required<MarketTradeGood>();
  readonly heldUnits = input(0);
  readonly maxProceeds = input(0);
  readonly selected = input(false);
  readonly pick = output<string>();

  readonly category = computed<GoodCategory>(() => goodCategory(this.good().symbol));
  readonly label = computed(() => goodLabel(this.good().symbol));
  readonly proceeds = computed(() => this.heldUnits() * this.good().sellPrice);
  readonly gaugePct = computed(() => {
    const max = this.maxProceeds();
    if (max <= 0) return 0;
    return Math.min(100, Math.round((this.proceeds() / max) * 100));
  });
}
