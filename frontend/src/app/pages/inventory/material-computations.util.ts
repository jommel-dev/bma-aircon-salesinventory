import { Material } from '../../shared/services/material-inventory.service';

/**
 * Extended material row with computed columns for the material table.
 */
export interface ComputedMaterialRow extends Material {
  /** sell_price - unit_price, rounded to 2 decimal places */
  margin: number;
  /** unit_price * on_hand_stock, rounded to 2 decimal places */
  overallCost: number;
  /** sell_price * on_hand_stock, rounded to 2 decimal places */
  overallPrice: number;
  /** overallPrice - overallCost, rounded to 2 decimal places */
  overallMargin: number;
}

/**
 * Compute derived columns for a material row.
 * All computed values are rounded to 2 decimal places.
 */
export function computeMaterialRow(material: Material): ComputedMaterialRow {
  const margin = roundTo2(material.sell_price - material.unit_price);
  const overallCost = roundTo2(material.unit_price * material.on_hand_stock);
  const overallPrice = roundTo2(material.sell_price * material.on_hand_stock);
  const overallMargin = roundTo2(overallPrice - overallCost);

  return {
    ...material,
    margin,
    overallCost,
    overallPrice,
    overallMargin,
  };
}

/**
 * Round a number to 2 decimal places.
 */
function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
