import { computeMaterialRow, ComputedMaterialRow } from './material-computations.util';
import { Material } from '../../shared/services/material-inventory.service';

describe('computeMaterialRow', () => {
  function makeMaterial(overrides: Partial<Material> = {}): Material {
    return {
      id: 1,
      brand_id: 1,
      material_name: 'Test Material',
      material_code: 'TM-001',
      description: null,
      unit: 'pcs',
      unit_price: 100,
      sell_price: 150,
      on_hand_stock: 10,
      reorder_level: 5,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      ...overrides,
    };
  }

  it('should compute margin as sell_price - unit_price', () => {
    const material = makeMaterial({ unit_price: 100, sell_price: 150 });
    const result = computeMaterialRow(material);
    expect(result.margin).toBe(50);
  });

  it('should compute overallCost as unit_price * on_hand_stock', () => {
    const material = makeMaterial({ unit_price: 100, on_hand_stock: 10 });
    const result = computeMaterialRow(material);
    expect(result.overallCost).toBe(1000);
  });

  it('should compute overallPrice as sell_price * on_hand_stock', () => {
    const material = makeMaterial({ sell_price: 150, on_hand_stock: 10 });
    const result = computeMaterialRow(material);
    expect(result.overallPrice).toBe(1500);
  });

  it('should compute overallMargin as overallPrice - overallCost', () => {
    const material = makeMaterial({ unit_price: 100, sell_price: 150, on_hand_stock: 10 });
    const result = computeMaterialRow(material);
    // overallPrice = 150 * 10 = 1500, overallCost = 100 * 10 = 1000
    expect(result.overallMargin).toBe(500);
  });

  it('should round all computed values to 2 decimal places', () => {
    const material = makeMaterial({ unit_price: 33.333, sell_price: 66.667, on_hand_stock: 3 });
    const result = computeMaterialRow(material);
    // margin = 66.667 - 33.333 = 33.334 → 33.33
    expect(result.margin).toBe(33.33);
    // overallCost = 33.333 * 3 = 99.999 → 100.00
    expect(result.overallCost).toBe(100);
    // overallPrice = 66.667 * 3 = 200.001 → 200.00
    expect(result.overallPrice).toBe(200);
    // overallMargin = 200.00 - 100.00 = 100.00
    expect(result.overallMargin).toBe(100);
  });

  it('should handle zero stock correctly', () => {
    const material = makeMaterial({ unit_price: 50, sell_price: 75, on_hand_stock: 0 });
    const result = computeMaterialRow(material);
    expect(result.margin).toBe(25);
    expect(result.overallCost).toBe(0);
    expect(result.overallPrice).toBe(0);
    expect(result.overallMargin).toBe(0);
  });

  it('should handle negative margin when cost exceeds price', () => {
    const material = makeMaterial({ unit_price: 200, sell_price: 150, on_hand_stock: 5 });
    const result = computeMaterialRow(material);
    expect(result.margin).toBe(-50);
    expect(result.overallCost).toBe(1000);
    expect(result.overallPrice).toBe(750);
    expect(result.overallMargin).toBe(-250);
  });

  it('should preserve all original material fields', () => {
    const material = makeMaterial({ material_name: 'Copper Wire', material_code: 'CW-001' });
    const result = computeMaterialRow(material);
    expect(result.material_name).toBe('Copper Wire');
    expect(result.material_code).toBe('CW-001');
    expect(result.id).toBe(1);
    expect(result.brand_id).toBe(1);
  });
});
