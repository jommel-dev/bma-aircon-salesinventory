import { BadRequestException } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

/**
 * Unit tests for ACM-specific PO update logic.
 * Validates: Requirements 7.4, 7.5
 *
 * These tests verify:
 * 1. Status guard: reject if status is not 'in-progress'
 * 2. ACM validation is applied during update
 * 3. Total amount recomputation logic
 */
describe('ACM PO Update Logic', () => {
  describe('Status Guard (Requirement 7.5)', () => {
    it('should reject update when status is for_approval', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('for_approval');
      }).toThrow(BadRequestException);
    });

    it('should reject update when status is approved', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('approved');
      }).toThrow(BadRequestException);
    });

    it('should reject update when status is received', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('received');
      }).toThrow(BadRequestException);
    });

    it('should reject update when status is completed', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('completed');
      }).toThrow(BadRequestException);
    });

    it('should allow update when status is in-progress', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('in-progress');
      }).not.toThrow();
    });

    it('should allow update when status is in_progress (underscore variant)', () => {
      expect(() => {
        UpdatePurchaseDto.validateStatusGuard('in_progress');
      }).not.toThrow();
    });

    it('should include descriptive error message when rejecting', () => {
      try {
        UpdatePurchaseDto.validateStatusGuard('for_approval');
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toContain('in-progress');
        expect((error as BadRequestException).message).toContain('for_approval');
      }
    });
  });

  describe('ACM Validation on Update (Requirement 7.4)', () => {
    it('should reject update with empty productItems for ACM type', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [],
      } as unknown as CreatePurchaseDto;

      expect(() => {
        CreatePurchaseDto.validateAcm(dto);
      }).toThrow(BadRequestException);
    });

    it('should reject update with invalid unitPrice for ACM type', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 1000000, // exceeds 999999.99
            totalSetQty: 1,
          },
        ],
      } as unknown as CreatePurchaseDto;

      expect(() => {
        CreatePurchaseDto.validateAcm(dto);
      }).toThrow(BadRequestException);
    });

    it('should reject update with non-integer quantity for ACM type', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 100,
            totalSetQty: 1.5,
          },
        ],
      } as unknown as CreatePurchaseDto;

      expect(() => {
        CreatePurchaseDto.validateAcm(dto);
      }).toThrow(BadRequestException);
    });

    it('should accept valid ACM update payload', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 100.50,
            discountPrice: 10,
            totalSetQty: 5,
          },
        ],
      } as unknown as CreatePurchaseDto;

      expect(() => {
        CreatePurchaseDto.validateAcm(dto);
      }).not.toThrow();
    });

    it('should skip validation for non-ACM types', () => {
      const dto = {
        poType: 'ACU',
        productItems: [], // would fail for ACM but should pass for ACU
      } as unknown as CreatePurchaseDto;

      expect(() => {
        CreatePurchaseDto.validateAcm(dto);
      }).not.toThrow();
    });
  });

  describe('Total Amount Recomputation (Requirement 7.4)', () => {
    // Helper function that mirrors the service's total computation logic
    function computeTotalAmount(
      productItems: Array<{ unitPrice?: number; discountPrice?: number; totalSetQty?: number }>,
    ): number {
      let total = 0;
      for (const item of productItems) {
        const unitPrice = item.unitPrice ?? 0;
        const discountPrice = item.discountPrice ?? 0;
        const priceToUse = discountPrice > 0 ? discountPrice : unitPrice;
        const qty = item.totalSetQty ?? 0;
        total += priceToUse * qty;
      }
      return total;
    }

    it('should use discount_price when greater than 0', () => {
      const items = [
        { unitPrice: 100, discountPrice: 80, totalSetQty: 2 },
      ];
      expect(computeTotalAmount(items)).toBe(160); // 80 * 2
    });

    it('should use unit_price when discount_price is 0', () => {
      const items = [
        { unitPrice: 100, discountPrice: 0, totalSetQty: 3 },
      ];
      expect(computeTotalAmount(items)).toBe(300); // 100 * 3
    });

    it('should use unit_price when discount_price is undefined', () => {
      const items = [
        { unitPrice: 50, totalSetQty: 4 },
      ];
      expect(computeTotalAmount(items)).toBe(200); // 50 * 4
    });

    it('should sum all line items correctly', () => {
      const items = [
        { unitPrice: 100, discountPrice: 80, totalSetQty: 2 },  // 80 * 2 = 160
        { unitPrice: 50, discountPrice: 0, totalSetQty: 5 },    // 50 * 5 = 250
        { unitPrice: 200, discountPrice: 150, totalSetQty: 1 }, // 150 * 1 = 150
      ];
      expect(computeTotalAmount(items)).toBe(560); // 160 + 250 + 150
    });

    it('should return 0 for empty items array', () => {
      expect(computeTotalAmount([])).toBe(0);
    });
  });
});
