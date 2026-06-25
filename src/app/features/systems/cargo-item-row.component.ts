import { Component, computed, input, output } from '@angular/core';
import { CargoItem } from '../../models/ship.model';
import { GoodIconComponent } from './good-icon.component';
import { GoodCategory, goodCategory, goodLabel } from './trade-good-visuals';

@Component({
  selector: 'app-cargo-item-row',
  imports: [GoodIconComponent],
  template: `
    <button
      type="button"
      class="sk-crt-row w-full text-left"
      [class.sk-crt-row--active]="selected()"
      (click)="pick.emit(item().symbol)"
    >
      <app-good-icon [category]="category()" />
      <span class="min-w-0 flex-1 truncate text-xs text-white">{{ label() }}</span>
      <span class="shrink-0 text-[11px] text-phosphor">× {{ item().units }}</span>
    </button>
  `,
})
export class CargoItemRowComponent {
  readonly item = input.required<CargoItem>();
  readonly selected = input(false);
  readonly pick = output<string>();

  readonly category = computed<GoodCategory>(() => goodCategory(this.item().symbol));
  readonly label = computed(() => goodLabel(this.item().symbol));
}
