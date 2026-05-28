/**
 * Stock status classification for material inventory items.
 *
 * Determines the stock notice badge to display based on
 * on_hand_stock relative to reorder_level.
 */

export type StockStatus = 'normal' | 'low-stock' | 'out-of-stock';

/**
 * Classify the stock status of a material based on its on-hand stock
 * and reorder level.
 *
 * - "out-of-stock": on_hand_stock <= 0
 * - "low-stock": 0 < on_hand_stock <= reorder_level
 * - "normal": on_hand_stock > reorder_level
 *
 * @param onHandStock - Current on-hand stock quantity
 * @param reorderLevel - The reorder threshold level
 * @returns The stock status classification
 */
export function getStockStatus(onHandStock: number, reorderLevel: number): StockStatus {
  if (onHandStock <= 0) {
    return 'out-of-stock';
  }
  if (onHandStock <= reorderLevel) {
    return 'low-stock';
  }
  return 'normal';
}

/**
 * Badge display configuration for each stock status.
 */
export interface StockBadgeConfig {
  label: string;
  classes: string;
}

/**
 * Get the badge display configuration (label + Tailwind classes) for a stock status.
 */
export function getStockBadgeConfig(status: StockStatus): StockBadgeConfig {
  switch (status) {
    case 'out-of-stock':
      return {
        label: 'Out of Stock',
        classes: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    case 'low-stock':
      return {
        label: 'Low Stock',
        classes: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      };
    case 'normal':
      return {
        label: 'Normal',
        classes: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      };
  }
}
