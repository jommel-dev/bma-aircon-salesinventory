/**
 * =====================================================
 * STOCK ADJUSTMENT DTO (Data Transfer Object)
 * =====================================================
 * Purpose: Defines the structure for stock adjustment requests
 *
 * Used by POST /inventory/materials/:id/adjust
 * Records a Stock_Movement with movement_type = 'ADJUST'
 * =====================================================
 */

export class StockAdjustmentDto {
  /**
   * Direction of the stock adjustment
   * - 'increase': adds quantity to on_hand_stock
   * - 'decrease': subtracts quantity from on_hand_stock
   */
  direction: 'increase' | 'decrease';

  /**
   * Quantity to adjust - must be between 1 and 999999
   */
  quantity: number;

  /**
   * Optional remarks for the adjustment - max 500 characters
   */
  remarks?: string;
}
