import { getStockStatus, getStockBadgeConfig, StockStatus } from './stock-status.util';

describe('getStockStatus', () => {
  describe('Out of Stock classification', () => {
    it('should return "out-of-stock" when on_hand_stock is 0', () => {
      expect(getStockStatus(0, 10)).toBe('out-of-stock');
    });

    it('should return "out-of-stock" when on_hand_stock is negative', () => {
      expect(getStockStatus(-5, 10)).toBe('out-of-stock');
    });

    it('should return "out-of-stock" when on_hand_stock is -1', () => {
      expect(getStockStatus(-1, 0)).toBe('out-of-stock');
    });
  });

  describe('Low Stock classification', () => {
    it('should return "low-stock" when on_hand_stock equals reorder_level', () => {
      expect(getStockStatus(10, 10)).toBe('low-stock');
    });

    it('should return "low-stock" when on_hand_stock is between 0 and reorder_level', () => {
      expect(getStockStatus(5, 10)).toBe('low-stock');
    });

    it('should return "low-stock" when on_hand_stock is 1 and reorder_level is 1', () => {
      expect(getStockStatus(1, 1)).toBe('low-stock');
    });

    it('should return "low-stock" when on_hand_stock is 1 and reorder_level is 100', () => {
      expect(getStockStatus(1, 100)).toBe('low-stock');
    });
  });

  describe('Normal classification', () => {
    it('should return "normal" when on_hand_stock exceeds reorder_level', () => {
      expect(getStockStatus(11, 10)).toBe('normal');
    });

    it('should return "normal" when on_hand_stock is much greater than reorder_level', () => {
      expect(getStockStatus(1000, 10)).toBe('normal');
    });

    it('should return "normal" when on_hand_stock is 1 and reorder_level is 0', () => {
      expect(getStockStatus(1, 0)).toBe('normal');
    });
  });

  describe('Edge cases', () => {
    it('should return "out-of-stock" when both values are 0', () => {
      expect(getStockStatus(0, 0)).toBe('out-of-stock');
    });

    it('should return "out-of-stock" when on_hand_stock is 0 and reorder_level is 0', () => {
      expect(getStockStatus(0, 0)).toBe('out-of-stock');
    });
  });
});

describe('getStockBadgeConfig', () => {
  it('should return red badge config for out-of-stock', () => {
    const config = getStockBadgeConfig('out-of-stock');
    expect(config.label).toBe('Out of Stock');
    expect(config.classes).toContain('bg-red-100');
    expect(config.classes).toContain('text-red-700');
  });

  it('should return orange badge config for low-stock', () => {
    const config = getStockBadgeConfig('low-stock');
    expect(config.label).toBe('Low Stock');
    expect(config.classes).toContain('bg-orange-100');
    expect(config.classes).toContain('text-orange-700');
  });

  it('should return green badge config for normal', () => {
    const config = getStockBadgeConfig('normal');
    expect(config.label).toBe('Normal');
    expect(config.classes).toContain('bg-green-100');
    expect(config.classes).toContain('text-green-700');
  });
});
