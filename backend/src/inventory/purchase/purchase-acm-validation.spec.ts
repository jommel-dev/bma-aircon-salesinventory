import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

describe('PurchaseService - ACM Validation', () => {
  let service: PurchaseService;

  const mockDatabaseService = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: jest.fn(),
  };

  const mockMaterialStockService = {
    recordMovement: jest.fn(),
    getBalance: jest.fn(),
  };

  const mockAuditLogService = {
    logMutation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: MaterialStockService, useValue: mockMaterialStockService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
    jest.clearAllMocks();
  });

  describe('ACM product item validation', () => {
    it('should reject ACM items with empty material name when no materialId provided', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: '',
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].materialName: Material identification is required for ACM items');
    });

    it('should reject ACM items with quantity less than 1', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 0,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].totalSetQty: Quantity must be between 1 and 999,999');
    });

    it('should reject ACM items with quantity greater than 999999', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 1000000,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].totalSetQty: Quantity must be between 1 and 999,999');
    });

    it('should reject ACM items with non-integer quantity', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 5.5,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].totalSetQty: Quantity must be a whole number');
    });

    it('should accept ACM items with valid material name and quantity', async () => {
      // Mock the transaction to simulate successful creation
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 }) // vendor columns
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 }) // vendor exists
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      // This should not throw - validation passes
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Copper Tube 1/4',
            materialCode: 'CT-001',
            materialUnit: 'METERS',
            materialBrandName: 'Generic',
            totalSetQty: 100,
          },
        ],
      };

      // The validation should pass (not throw BadRequestException)
      // The actual create will fail due to incomplete mocking, but that's fine
      // We're testing that validation doesn't reject valid input
      try {
        await service.create(dto as any);
      } catch (error) {
        // Should NOT be a BadRequestException about material name or quantity
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for valid ACM input: ${error.message}`);
        }
        // Other errors (from incomplete mocking) are expected
      }
    });

    it('should accept ACM items with materialId (no name required)', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialId: 5,
            totalSetQty: 50,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException when materialId is provided: ${error.message}`);
        }
      }
    });

    it('should accept quantity at boundary value 1', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 1,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for qty=1: ${error.message}`);
        }
      }
    });

    it('should accept quantity at boundary value 999999', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 999999,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for qty=999999: ${error.message}`);
        }
      }
    });

    it('should skip validation for non-purchase transType items', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'sales',
            materialName: '',
            totalSetQty: 0,
          },
          {
            transType: 'purchase',
            materialName: 'Valid Material',
            totalSetQty: 10,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for sales transType items: ${error.message}`);
        }
      }
    });

    it('should reject ACM items with unitPrice below 0.01', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 0.001,
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].unitPrice: Unit price must be between 0.01 and 999,999.99');
    });

    it('should reject ACM items with unitPrice above 999999.99', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 1000000,
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].unitPrice: Unit price must be between 0.01 and 999,999.99');
    });

    it('should reject ACM items with negative discountPrice', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 100,
            discountPrice: -1,
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].discountPrice: Discount price must be between 0 and 999,999.99');
    });

    it('should reject ACM items with discountPrice above 999999.99', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 100,
            discountPrice: 1000000,
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[0].discountPrice: Discount price must be between 0 and 999,999.99');
    });

    it('should reject ACM request without vendorId and without vendor.name', async () => {
      const dto = {
        poType: 'ACM' as const,
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('vendorId or vendor.name: Vendor identification is required');
    });

    it('should reject ACM request with empty vendor name and no vendorId', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendor: { name: '   ' },
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('vendorId or vendor.name: Vendor identification is required');
    });

    it('should reject ACM request with empty productItems array', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [],
      };

      const result = await service.create(dto as any);
      expect(result).toEqual({ success: false, message: 'At least one product item is required' });
    });

    it('should accept ACM items with valid unitPrice at boundary 0.01', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 0.01,
            totalSetQty: 1,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for unitPrice=0.01: ${error.message}`);
        }
      }
    });

    it('should accept ACM items with valid discountPrice at 0', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            unitPrice: 100,
            discountPrice: 0,
            totalSetQty: 5,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException for discountPrice=0: ${error.message}`);
        }
      }
    });

    it('should accept ACM request with vendor.name instead of vendorId', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }, { column_name: 'address' }, { column_name: 'contact_person' }, { column_name: 'contact_number' }, { column_name: 'created_at' }, { column_name: 'updated_at' }], rowCount: 7 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValue({ rows: [{ id: 'new-uuid' }], rowCount: 1 }),
        };
        return fn(mockClient);
      });

      const dto = {
        poType: 'ACM' as const,
        vendor: { name: 'New Vendor Inc' },
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Test Material',
            totalSetQty: 5,
          },
        ],
      };

      try {
        await service.create(dto as any);
      } catch (error) {
        if (error instanceof BadRequestException) {
          fail(`Should not throw BadRequestException when vendor.name is provided: ${error.message}`);
        }
      }
    });

    it('should include field path of first invalid item in error response', async () => {
      const dto = {
        poType: 'ACM' as const,
        vendorId: '1',
        productItems: [
          {
            transType: 'purchase',
            materialName: 'Valid Material',
            unitPrice: 50,
            totalSetQty: 5,
          },
          {
            transType: 'purchase',
            materialName: 'Invalid Material',
            unitPrice: -5,
            totalSetQty: 10,
          },
        ],
      };

      const result = service.create(dto as any);
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow('productItems[1].unitPrice');
    });
  });
});
