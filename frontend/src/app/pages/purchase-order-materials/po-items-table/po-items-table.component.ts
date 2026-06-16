import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface PoLineItem {
  materialId: number | null;
  description: string;
  itemCode: string | null;
  unit: string;
  cost: number;       // editable purchase cost per unit
  rate: number;       // sell price (display only, from material)
  discount: number;   // not used in PO, kept for compatibility
  qty: number;        // editable quantity
  total: number;      // computed: cost * qty
}

@Component({
  selector: 'app-po-items-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './po-items-table.component.html',
})
export class PoItemsTableComponent {
  /** The list of PO line items to display in the table. */
  @Input() items: PoLineItem[] = [];

  /** Whether the current user is admin/superadmin (controls Cost column visibility). */
  @Input() isAdmin = false;

  /** Whether the table is in read-only mode (all inputs disabled, no action buttons). */
  @Input() isReadOnly = false;

  /** Emitted when a row is removed; payload is the index of the removed item. */
  @Output() itemRemoved = new EventEmitter<number>();

  /** Emitted when a row's Rate, Discount, or QTY is changed; payload includes index and updated item. */
  @Output() itemChanged = new EventEmitter<{ index: number; item: PoLineItem }>();

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validates and applies a new Cost value for a line item.
   * Cost must be numeric, 0.01–999999.99, max 2 decimal places.
   */
  onCostChange(index: number, value: string): void {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0.01 || parsed > 999999.99) {
      return;
    }

    const decimalParts = value.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > 2) {
      return;
    }

    const cost = Math.round(parsed * 100) / 100;
    const item = this.items[index];
    item.cost = cost;
    item.total = this.calculateTotal(cost, item.qty);
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Validates and applies a new Rate (SRP/Sell Price) value for a line item.
   * Rate must be numeric, 0–999999.99, max 2 decimal places.
   */
  onRateChange(index: number, value: string): void {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0 || parsed > 999999.99) {
      return;
    }

    const decimalParts = value.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > 2) {
      return;
    }

    const rate = Math.round(parsed * 100) / 100;
    const item = this.items[index];
    item.rate = rate;
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Validates and applies a new QTY value for a line item.
   * QTY must be an integer, 1–99999.
   */
  onQtyChange(index: number, value: string): void {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 99999) {
      return;
    }

    if (String(parsed) !== value.trim()) {
      return;
    }

    const item = this.items[index];
    item.qty = parsed;
    item.total = this.calculateTotal(item.cost, parsed);
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Removes a line item at the given index.
   */
  removeItem(index: number): void {
    this.itemRemoved.emit(index);
  }

  // ─── Computed Values ────────────────────────────────────────────────────────

  /**
   * Calculate total for a single row: Cost × QTY rounded to 2 decimal places.
   */
  calculateTotal(cost: number, qty: number): number {
    return Math.round(cost * qty * 100) / 100;
  }

  /**
   * Grand Total: sum of all line item totals.
   */
  get grandTotal(): number {
    if (this.items.length === 0) return 0;
    return Math.round(
      this.items.reduce((sum, item) => sum + this.calculateTotal(item.cost, item.qty), 0) * 100,
    ) / 100;
  }

  /**
   * Total QTY: sum of all line item quantities.
   */
  get totalQty(): number {
    if (this.items.length === 0) return 0;
    return this.items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  }
}
