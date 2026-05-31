import { BadRequestException } from '@nestjs/common';
import { UpdatePurchaseDto } from './update-purchase.dto';
import { CreatePurchaseDto } from './create-purchase.dto';

describe('UpdatePurchaseDto', () => {
  describe('validateAcm', () => {
    it('should pass validation for a valid ACM update payload', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            materialName: 'Test Material',
            unitPrice: 100,
            discountPrice: 10,
            totalSetQty: 5,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).not.toThrow();
    });

    it('should reject when productItems is empty', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /at least one product item is required/i,
      );
    });

    it('should reject when vendor identification is missing', () => {
      const dto = {
        poType: 'ACM',
        vendorId: '',
        vendor: { name: '' },
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 2,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /vendor identification is required/i,
      );
    });

    it('should reject unitPrice below 0.01', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 0,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.unitPrice/,
      );
    });

    it('should reject unitPrice above 999999.99', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 1000000,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.unitPrice/,
      );
    });

    it('should reject discountPrice below 0', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            discountPrice: -1,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.discountPrice/,
      );
    });

    it('should reject discountPrice above 999999.99', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            discountPrice: 1000000,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.discountPrice/,
      );
    });

    it('should reject non-integer totalSetQty', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 2.5,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.totalSetQty.*whole number/i,
      );
    });

    it('should reject totalSetQty below 1', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 0,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.totalSetQty/,
      );
    });

    it('should reject totalSetQty above 999999', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 1000000,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[0\]\.totalSetQty/,
      );
    });

    it('should reject when materialId and materialName are both missing', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: null,
            materialName: '',
            unitPrice: 50,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(BadRequestException);
      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /material identification is required/i,
      );
    });

    it('should include field path of first invalid item in error', () => {
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 5,
          },
          {
            transType: 'purchase',
            materialId: 2,
            unitPrice: -5,
            totalSetQty: 3,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      expect(() => UpdatePurchaseDto.validateAcm(dto)).toThrow(
        /productItems\[1\]\.unitPrice/,
      );
    });

    it('should delegate to CreatePurchaseDto.validateAcm', () => {
      const spy = jest.spyOn(CreatePurchaseDto, 'validateAcm');
      const dto = {
        poType: 'ACM',
        vendorId: 'vendor-123',
        productItems: [
          {
            transType: 'purchase',
            materialId: 1,
            unitPrice: 50,
            totalSetQty: 1,
          },
        ],
      } as unknown as UpdatePurchaseDto;

      UpdatePurchaseDto.validateAcm(dto);
      expect(spy).toHaveBeenCalledWith(dto);
      spy.mockRestore();
    });
  });

  describe('validateStatusGuard', () => {
    it('should pass when status is "in-progress"', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('in-progress')).not.toThrow();
    });

    it('should pass when status is "in_progress" (underscore variant)', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('in_progress')).not.toThrow();
    });

    it('should reject when status is "for_approval"', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('for_approval')).toThrow(
        BadRequestException,
      );
      expect(() => UpdatePurchaseDto.validateStatusGuard('for_approval')).toThrow(
        /cannot be edited/i,
      );
    });

    it('should reject when status is "approved"', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('approved')).toThrow(
        BadRequestException,
      );
    });

    it('should reject when status is "received"', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('received')).toThrow(
        BadRequestException,
      );
    });

    it('should reject when status is "completed"', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('completed')).toThrow(
        BadRequestException,
      );
    });

    it('should handle case-insensitive status', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('In-Progress')).not.toThrow();
      expect(() => UpdatePurchaseDto.validateStatusGuard('IN-PROGRESS')).not.toThrow();
    });

    it('should handle whitespace in status', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('  in-progress  ')).not.toThrow();
    });

    it('should reject empty status', () => {
      expect(() => UpdatePurchaseDto.validateStatusGuard('')).toThrow(BadRequestException);
    });
  });
});
