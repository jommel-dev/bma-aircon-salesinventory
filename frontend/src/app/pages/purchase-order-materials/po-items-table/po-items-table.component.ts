import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface PoLineItem {
  materialId: number | null;
  description: string;
  itemCode: string | null;
  unit: string;
  cost: number;       // material unit_price (admin-only display)
  rate: number;       // editable unit price
  discount: number;   // editable discount amount per unit
  qty: number;        // editable quantity
  total: number;      // computed: max(rate - discount, 0) * qty
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
   * Validates and applies a new Rate value for a line item.
   * Rate must be numeric, 0.01–999999.99, max 2 decimal places.
   * Rejects invalid input and retains previous valid value.
   */
  onRateChange(index: number, value: string): void {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0.01 || parsed > 999999.99) {
      return;
    }

    // Check max 2 decimal places
    const decimalParts = value.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > 2) {
      return;
    }

    const rate = Math.round(parsed * 100) / 100;
    const item = this.items[index];
    item.rate = rate;
    item.total = this.calculateTotal(rate, item.discount, item.qty);
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Validates and applies a new Discount value for a line item.
   * Discount must be numeric, 0–999999.99, max 2 decimal places.
   * Rejects invalid input and retains previous valid value.
   */
  onDiscountChange(index: number, value: string): void {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0 || parsed > 999999.99) {
      return;
    }

    const decimalParts = value.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > 2) {
      return;
    }

    const discount = Math.round(parsed * 100) / 100;
    const item = this.items[index];
    item.discount = discount;
    item.total = this.calculateTotal(item.rate, discount, item.qty);
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Validates and applies a new QTY value for a line item.
   * QTY must be an integer, 1–99999.
   * Rejects invalid input and retains previous valid value.
   */
  onQtyChange(index: number, value: string): void {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 99999) {
      return;
    }

    // Must be a whole number (reject decimals like "1.5")
    if (String(parsed) !== value.trim()) {
      return;
    }

    const item = this.items[index];
    item.qty = parsed;
    item.total = this.calculateTotal(item.rate, item.discount, parsed);
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
   * Calculate total for a single row: max(Rate - Discount, 0) × QTY rounded to 2 decimal places.
   */
  calculateTotal(rate: number, discount: number, qty: number): number {
    return Math.round(Math.max(rate - discount, 0) * qty * 100) / 100;
  }

  /**
   * Grand Total: sum of all line item totals. Returns 0 when empty.
   */
  get grandTotal(): number {
    if (this.items.length === 0) return 0;
    return Math.round(
      this.items.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100,
    ) / 100;
  }

  /**
   * Total QTY: sum of all line item quantities. Returns 0 when empty.
   */
  get totalQty(): number {
    if (this.items.length === 0) return 0;
    return this.items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  }
}
