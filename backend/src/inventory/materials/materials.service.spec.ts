import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { DatabaseService } from '../../database/database.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';

/**
 * Unit tests for MaterialsService.create()
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
describe('MaterialsService - create()', () => {
  let service: MaterialsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  describe('Brand validation', () => {
    it('should reject with 404 if brand_id does not exist', async () => {
      // Brand lookup returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const dto: CreateMaterialDto = {
        material_name: 'Test Material',
        brand_id: 999,
      };

      await expect(service.create(dto, 1)).rejects.toThrow(
        new NotFoundException('Brand with ID 999 not found'),
      );
    });

    it('should reject with 400 if brand type is ACU', async () => {
      // Brand lookup returns ACU type
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 1, type: 'ACU' }],
      });

      const dto: CreateMaterialDto = {
        material_name: 'Test Material',
        brand_id: 1,
      };

      await expect(service.create(dto, 1)).rejects.toThrow(
        new BadRequestException(
          'Selected brand is not a material brand. Please select a brand with type MAT.',
        ),
      );
    });

    it('should allow null brand_id (no brand association)', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, material_name: 'Test Material', brand_id: null }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              material_name: 'Test Material',
              brand_id: null,
              brand_name: null,
              unit: 'PCS',
              unit_price: 0,
              sell_price: 0,
              on_hand_stock: 0,
              reorder_level: 0,
            },
          ],
        });

      const dto: CreateMaterialDto = {
        material_name: 'Test Material',
        // brand_id not provided (undefined/null)
      };

      const result = await service.create(dto, 1);
      expect(result.brand_id).toBeNull();
    });

    it('should accept brand with type MAT', async () => {
      mockDb.query
        // Brand check - MAT type
        .mockResolvedValueOnce({ rows: [{ id: 5, type: 'MAT' }] })
        // Duplicate check - no duplicates
        .mockResolvedValueOnce({ rows: [] })
        // Insert returns new material
        .mockResolvedValueOnce({
          rows: [{ id: 1, material_name: 'Test Material', brand_id: 5 }],
        })
        // findOne after insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              material_name: 'Test Material',
              brand_id: 5,
              brand_name: 'Test Brand',
              unit: 'PCS',
              unit_price: 100,
              sell_price: 150,
              on_hand_stock: 10,
              reorder_level: 5,
            },
          ],
        });

      const dto: CreateMaterialDto = {
        material_name: 'Test Material',
        brand_id: 5,
      };

      const result = await service.create(dto, 1);
      expect(result.brand_id).toBe(5);
      expect(result.material_name).toBe('Test Material');
    });
  });

  describe('Duplicate material name rejection', () => {
    it('should reject with 400 if material_name already exists among non-deleted records', async () => {
      // Brand check passes
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, type: 'MAT' }] });
      // Duplicate check finds existing material
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });

      const dto: CreateMaterialDto = {
        material_name: 'Existing Material',
        brand_id: 1,
      };

      await expect(service.create(dto, 1)).rejects.toThrow(
        new BadRequestException(
          "Material 'Existing Material' already exists for this brand",
        ),
      );
    });

    it('should allow creating material with same name if existing one is soft-deleted', async () => {
      // Brand check passes
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, type: 'MAT' }] })
        // Duplicate check - no non-deleted duplicates (query filters by deleted_at IS NULL)
        .mockResolvedValueOnce({ rows: [] })
        // Insert
        .mockResolvedValueOnce({
          rows: [{ id: 2, material_name: 'Recycled Name', brand_id: 1 }],
        })
        // findOne
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2,
              material_name: 'Recycled Name',
              brand_id: 1,
              brand_name: 'Test Brand',
              unit: 'PCS',
              unit_price: 0,
              sell_price: 0,
              on_hand_stock: 0,
              reorder_level: 0,
            },
          ],
        });

      const dto: CreateMaterialDto = {
        material_name: 'Recycled Name',
        brand_id: 1,
      };

      const result = await service.create(dto, 1);
      expect(result.material_name).toBe('Recycled Name');
    });
  });

  describe('Persistence to tblmaterials', () => {
    it('should insert into tblmaterials with correct fields', async () => {
      mockDb.query
        // Brand check
        .mockResolvedValueOnce({ rows: [{ id: 2, type: 'MAT' }] })
        // Duplicate check
        .mockResolvedValueOnce({ rows: [] })
        // Insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              brand_id: 2,
              material_name: 'Copper Tube 1/4',
              material_code: 'CT-001',
              description: 'High quality copper',
              unit: 'METERS',
              unit_price: 150,
              sell_price: 200,
              on_hand_stock: 50,
              reorder_level: 10,
            },
          ],
        })
        // findOne
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              brand_id: 2,
              material_name: 'Copper Tube 1/4',
              material_code: 'CT-001',
              description: 'High quality copper',
              unit: 'METERS',
              unit_price: 150,
              sell_price: 200,
              on_hand_stock: 50,
              reorder_level: 10,
              brand_name: 'Copper Brand',
            },
          ],
        });

      const dto: CreateMaterialDto = {
        material_name: 'Copper Tube 1/4',
        material_code: 'CT-001',
        description: 'High quality copper',
        unit: 'METERS',
        unit_price: 150,
        sell_price: 200,
        on_hand_stock: 50,
        reorder_level: 10,
        brand_id: 2,
      };

      await service.create(dto, 1);

      // Verify the INSERT query targets tblmaterials
      const insertCall = mockDb.query.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO tblmaterials');
      expect(insertCall[0]).not.toContain('tblproducts');

      // Verify the values passed
      expect(insertCall[1]).toEqual([
        2,                    // brand_id
        'Copper Tube 1/4',   // material_name
        'CT-001',            // material_code
        'High quality copper', // description
        'METERS',            // unit
        150,                 // unit_price
        200,                 // sell_price
        50,                  // on_hand_stock
        10,                  // reorder_level
        1,                   // created_by (userId)
      ]);
    });

    it('should NOT insert into tblproducts', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, type: 'MAT' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, material_name: 'Test', brand_id: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              material_name: 'Test',
              brand_id: 1,
              brand_name: 'Brand',
              unit: 'PCS',
              unit_price: 0,
              sell_price: 0,
              on_hand_stock: 0,
              reorder_level: 0,
            },
          ],
        });

      const dto: CreateMaterialDto = {
        material_name: 'Test',
        brand_id: 1,
      };

      await service.create(dto, 1);

      // Verify no query references tblproducts
      for (const call of mockDb.query.mock.calls) {
        expect(call[0]).not.toContain('tblproducts');
      }
    });
  });
});


/**
 * Unit tests for MaterialsService.adjustStock()
 * Validates: Requirements 4.6, 4.7
 */
describe('MaterialsService - adjustStock()', () => {
  let service: MaterialsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  const mockPasswordOk = () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });
  };

  describe('Validation', () => {
    it('should reject quantity less than 1', async () => {
      await expect(
        service.adjustStock(1, { direction: 'increase', quantity: 0 }, 1),
      ).rejects.toThrow(
        new BadRequestException('Quantity must be between 1 and 999999'),
      );
    });

    it('should reject quantity greater than 999999', async () => {
      await expect(
        service.adjustStock(1, { direction: 'increase', quantity: 1000000 }, 1),
      ).rejects.toThrow(
        new BadRequestException('Quantity must be between 1 and 999999'),
      );
    });

    it('should reject non-finite quantity (NaN)', async () => {
      await expect(
        service.adjustStock(1, { direction: 'increase', quantity: NaN }, 1),
      ).rejects.toThrow(
        new BadRequestException('Quantity must be between 1 and 999999'),
      );
    });

    it('should reject remarks longer than 500 characters', async () => {
      const longRemarks = 'a'.repeat(501);

      await expect(
        service.adjustStock(
          1,
          { direction: 'increase', quantity: 10, remarks: longRemarks },
          1,
        ),
      ).rejects.toThrow(
        new BadRequestException('Remarks must not exceed 500 characters'),
      );
    });

    it('should reject missing authorization password', async () => {
      await expect(
        service.adjustStock(1, { direction: 'increase', quantity: 10 }, 1),
      ).rejects.toThrow(
        new BadRequestException('Password is required to authorize this change'),
      );
    });

    it('should allow remarks exactly 500 characters', async () => {
      const remarks = 'a'.repeat(500);

      mockPasswordOk();
      // findOne returns material
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Test',
            on_hand_stock: 100,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 10,
            sell_price: 15,
            reorder_level: 5,
          },
        ],
      });
      // Update stock
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Insert movement
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // findOne after update
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Test',
            on_hand_stock: 110,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 10,
            sell_price: 15,
            reorder_level: 5,
          },
        ],
      });

      const result = await service.adjustStock(
        1,
        { direction: 'increase', quantity: 10, remarks, authorizationPassword: 'secret' },
        1,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Material not found', () => {
    it('should throw 404 if material does not exist', async () => {
      mockPasswordOk();
      // findOne returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.adjustStock(999, { direction: 'increase', quantity: 5, authorizationPassword: 'secret' }, 1),
      ).rejects.toThrow(
        new NotFoundException('Material with ID 999 not found'),
      );
    });
  });

  describe('Stock increase', () => {
    it('should increase on_hand_stock and record movement', async () => {
      mockPasswordOk();
      // findOne returns material with stock 50
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 50,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 10,
          },
        ],
      });
      // Update stock query
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Insert movement query
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // findOne after update
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 70,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 10,
          },
        ],
      });

      const result = await service.adjustStock(
        1,
        { direction: 'increase', quantity: 20, remarks: 'Restocked', authorizationPassword: 'secret' },
        1,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Stock increased by 20');
      expect(result.material.on_hand_stock).toBe(70);

      // Verify update query sets new stock to 70
      const updateCall = mockDb.query.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE tblmaterials');
      expect(updateCall[1][0]).toBe(70); // new stock

      // Verify movement insert
      const movementCall = mockDb.query.mock.calls[3];
      expect(movementCall[0]).toContain('tblmaterial_stock_movement');
      expect(movementCall[0]).toContain('ADJUST');
      expect(movementCall[1][1]).toBe(20); // positive qty for increase
      expect(movementCall[1][4]).toBe('Restocked'); // remarks
    });
  });

  describe('Stock decrease', () => {
    it('should decrease on_hand_stock when sufficient stock exists', async () => {
      mockPasswordOk();
      // findOne returns material with stock 50
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 50,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 10,
          },
        ],
      });
      // Update stock
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Insert movement
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // findOne after update
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 30,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 10,
          },
        ],
      });

      const result = await service.adjustStock(
        1,
        { direction: 'decrease', quantity: 20, authorizationPassword: 'secret' },
        1,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Stock decreased by 20');
      expect(result.material.on_hand_stock).toBe(30);

      // Verify movement qty is negative for decrease
      const movementCall = mockDb.query.mock.calls[3];
      expect(movementCall[1][1]).toBe(-20);
    });

    it('should reject decrease that would reduce stock below zero', async () => {
      mockPasswordOk();
      // findOne returns material with stock 10
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 10,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 5,
          },
        ],
      });

      await expect(
        service.adjustStock(1, { direction: 'decrease', quantity: 15, authorizationPassword: 'secret' }, 1),
      ).rejects.toThrow(
        new BadRequestException(
          'Insufficient stock. Available: 10, Requested: 15',
        ),
      );
    });

    it('should allow decrease that brings stock to exactly zero', async () => {
      mockPasswordOk();
      // findOne returns material with stock 10
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 10,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 5,
          },
        ],
      });
      // Update stock
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Insert movement
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // findOne after update
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            on_hand_stock: 0,
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            reorder_level: 5,
          },
        ],
      });

      const result = await service.adjustStock(
        1,
        { direction: 'decrease', quantity: 10, authorizationPassword: 'secret' },
        1,
      );

      expect(result.success).toBe(true);
      expect(result.material.on_hand_stock).toBe(0);
    });
  });
});

describe('MaterialsService - update()', () => {
  let service: MaterialsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  const materialRow = {
    id: 1,
    material_name: 'Copper Tube',
    material_code: 'CU-001',
    description: null,
    brand_id: 1,
    brand_name: 'Brand',
    unit: 'PCS',
    unit_price: 100,
    sell_price: 150,
    on_hand_stock: 50,
    reorder_level: 10,
  };

  it('should require a password when on-hand stock changes', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [materialRow] });

    await expect(
      service.update(1, { on_hand_stock: 80 }, 1),
    ).rejects.toThrow(
      new BadRequestException('Password is required to authorize this change'),
    );
  });

  it('should record stock movement and price history when authorized', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [materialRow] }) // findOne current
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] }) // password
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // price history
      .mockResolvedValueOnce({ rows: [] }) // stock movement
      .mockResolvedValueOnce({ rows: [{ ...materialRow, unit_price: 110, sell_price: 160, on_hand_stock: 80 }] });

    const result = await service.update(
      1,
      {
        unit_price: 110,
        sell_price: 160,
        on_hand_stock: 80,
        authorizationPassword: 'secret',
      },
      1,
    );

    expect(result.on_hand_stock).toBe(80);
    const priceHistoryCall = mockDb.query.mock.calls.find((call) =>
      String(call[0]).includes('tblmaterial_price_history'),
    );
    const movementCall = mockDb.query.mock.calls.find((call) =>
      String(call[0]).includes('tblmaterial_stock_movement'),
    );
    expect(priceHistoryCall?.[1]).toEqual([1, 110, 160, 1]);
    expect(movementCall?.[1][1]).toBe(30);
  });

  it('should skip password when only name changes', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [materialRow] }) // findOne
      .mockResolvedValueOnce({ rows: [] }) // duplicate name check
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ ...materialRow, material_name: 'New Name' }] });

    const result = await service.update(1, { material_name: 'New Name' }, 1);
    expect(result.material_name).toBe('New Name');
    expect(
      mockDb.query.mock.calls.some((call) => String(call[0]).includes('tblusers')),
    ).toBe(false);
  });
});

/**
 * Unit tests for MaterialsService.recordStockDeficit()
 * Validates: Requirements 6.1, 6.2, 6.3
 */
describe('MaterialsService - recordStockDeficit()', () => {
  let service: MaterialsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  it('should record a stock movement with movement_type OUT when ordered_qty > on_hand_stock', async () => {
    // findOne call (to return updated material at the end)
    mockDb.query
      // INSERT into tblmaterial_stock_movement
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE tblmaterials SET on_hand_stock = 0
      .mockResolvedValueOnce({ rows: [] })
      // findOne after update
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            material_name: 'Copper Tube',
            brand_id: 2,
            brand_name: 'Test Brand',
            unit: 'PCS',
            unit_price: 100,
            sell_price: 150,
            on_hand_stock: 0,
            reorder_level: 5,
          },
        ],
      });

    const result = await service.recordStockDeficit({
      materialId: 1,
      orderedQty: 10,
      onHandStock: 3,
      salesOrderId: 42,
      lineItemKey: 'SO-42-LINE-1',
      userId: 7,
    });

    expect(result.success).toBe(true);
    expect(result.deficitQty).toBe(7); // 10 - 3 = 7

    // Verify the INSERT query for stock movement
    const insertCall = mockDb.query.mock.calls[0];
    expect(insertCall[0]).toContain('INSERT INTO tblmaterial_stock_movement');
    expect(insertCall[0]).toContain("'OUT'");
    expect(insertCall[0]).toContain("'SO'");
    // Values: materialId, deficitQty, salesOrderId, lineItemKey, remarks, userId
    expect(insertCall[1][0]).toBe(1);   // materialId
    expect(insertCall[1][1]).toBe(7);   // deficitQty (10 - 3)
    expect(insertCall[1][2]).toBe(42);  // salesOrderId (source_id)
    expect(insertCall[1][3]).toBe('SO-42-LINE-1'); // source_line_key
    expect(insertCall[1][4]).toContain('Stock deficit of 7 units');
    expect(insertCall[1][4]).toContain('sourced from another supplier');
    expect(insertCall[1][5]).toBe(7);   // userId (created_by)
  });

  it('should set on_hand_stock to 0 (not below zero) when deficit occurs', async () => {
    mockDb.query
      // INSERT movement
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE on_hand_stock = 0
      .mockResolvedValueOnce({ rows: [] })
      // findOne
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            material_name: 'Wire',
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'METERS',
            unit_price: 50,
            sell_price: 80,
            on_hand_stock: 0,
            reorder_level: 10,
          },
        ],
      });

    const result = await service.recordStockDeficit({
      materialId: 5,
      orderedQty: 20,
      onHandStock: 8,
      salesOrderId: 100,
      lineItemKey: 'SO-100-LINE-3',
      userId: 2,
    });

    expect(result.material.on_hand_stock).toBe(0);

    // Verify the UPDATE query sets on_hand_stock to 0
    const updateCall = mockDb.query.mock.calls[1];
    expect(updateCall[0]).toContain('on_hand_stock = 0');
  });

  it('should return success=false when ordered_qty <= on_hand_stock (no deficit)', async () => {
    // findOne for the no-deficit case
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 3,
          material_name: 'Pipe',
          brand_id: 1,
          brand_name: 'Brand',
          unit: 'PCS',
          unit_price: 200,
          sell_price: 300,
          on_hand_stock: 50,
          reorder_level: 10,
        },
      ],
    });

    const result = await service.recordStockDeficit({
      materialId: 3,
      orderedQty: 5,
      onHandStock: 50,
      salesOrderId: 10,
      lineItemKey: 'SO-10-LINE-1',
      userId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.deficitQty).toBe(0);
    // No INSERT or UPDATE should have been called for movement/stock
    expect(mockDb.query).toHaveBeenCalledTimes(1); // Only the findOne
  });

  it('should store correct source references (source_type=SO, source_id, source_line_key)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT movement
      .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
      .mockResolvedValueOnce({             // findOne
        rows: [
          {
            id: 7,
            material_name: 'Breaker',
            brand_id: 3,
            brand_name: 'Schneider',
            unit: 'PCS',
            unit_price: 500,
            sell_price: 700,
            on_hand_stock: 0,
            reorder_level: 2,
          },
        ],
      });

    await service.recordStockDeficit({
      materialId: 7,
      orderedQty: 15,
      onHandStock: 5,
      salesOrderId: 999,
      lineItemKey: 'SO-999-LINE-7',
      userId: 3,
    });

    const insertCall = mockDb.query.mock.calls[0];
    // source_type is hardcoded as 'SO' in the query string
    expect(insertCall[0]).toContain("'SO'");
    // source_id = salesOrderId
    expect(insertCall[1][2]).toBe(999);
    // source_line_key = lineItemKey
    expect(insertCall[1][3]).toBe('SO-999-LINE-7');
  });

  it('should include remarks indicating deficit quantity and sourcing from another supplier', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT movement
      .mockResolvedValueOnce({ rows: [] }) // UPDATE stock
      .mockResolvedValueOnce({             // findOne
        rows: [
          {
            id: 2,
            material_name: 'Capacitor',
            brand_id: 1,
            brand_name: 'Brand',
            unit: 'PCS',
            unit_price: 80,
            sell_price: 120,
            on_hand_stock: 0,
            reorder_level: 5,
          },
        ],
      });

    await service.recordStockDeficit({
      materialId: 2,
      orderedQty: 25,
      onHandStock: 10,
      salesOrderId: 50,
      lineItemKey: 'SO-50-LINE-2',
      userId: 4,
    });

    const insertCall = mockDb.query.mock.calls[0];
    const remarks = insertCall[1][4];
    expect(remarks).toBe('Stock deficit of 15 units. Material sourced from another supplier.');
  });
});
