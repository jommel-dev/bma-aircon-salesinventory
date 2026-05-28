import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LineItem } from '../../../shared/services/sales-order-material.service';

@Component({
  selector: 'app-product-items-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-items-table.component.html',
})
export class ProductItemsTableComponent {
  /** The list of line items to display in the table. */
  @Input() items: LineItem[] = [];

  /** Whether the current user is admin/superadmin (controls Cost column visibility). */
  @Input() isAdmin = false;

  /** Emitted when a row is removed; payload is the index of the removed item. */
  @Output() itemRemoved = new EventEmitter<number>();

  /** Emitted when a row's Rate or QTY is changed; payload includes index and updated item. */
  @Output() itemChanged = new EventEmitter<{ index: number; item: LineItem }>();

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validates and applies a new Rate value for a line item.
   * Rate must be numeric, 0.01–999999.99, max 2 decimal places.
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
    item.total = this.calculateTotal(rate, item.discount ?? 0, item.qty);
    this.itemChanged.emit({ index, item: { ...item } });
  }

  /**
   * Validates and applies a new Discount value for a line item.
   * Discount is a fixed amount per item, 0–999999.99, max 2 decimal places.
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
   */
  onQtyChange(index: number, value: string): void {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 99999) {
      return;
    }

    // Must be a whole number
    if (String(parsed) !== value.trim()) {
      return;
    }

    const item = this.items[index];
    item.qty = parsed;
    item.total = this.calculateTotal(item.rate, item.discount ?? 0, parsed);
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
   * Calculate total for a single row: (Rate - Discount) × QTY rounded to 2 decimal places.
   */
  calculateTotal(rate: number, discount: number, qty: number): number {
    const effectiveRate = Math.max(rate - discount, 0);
    return Math.round(effectiveRate * qty * 100) / 100;
  }

  /**
   * Grand Total: sum of all line item totals.
   */
  get grandTotal(): number {
    return Math.round(
      this.items.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100,
    ) / 100;
  }

  /**
   * Total QTY: sum of all line item quantities.
   */
  get totalQty(): number {
    return this.items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  }

  /**
   * Validates whether a rate value is within acceptable bounds.
   */
  isValidRate(value: number | null | undefined): boolean {
    if (value == null) return false;
    return value >= 0.01 && value <= 999999.99;
  }

  /**
   * Validates whether a qty value is within acceptable bounds.
   */
  isValidQty(value: number | null | undefined): boolean {
    if (value == null) return false;
    return Number.isInteger(value) && value >= 1 && value <= 99999;
  }
}
