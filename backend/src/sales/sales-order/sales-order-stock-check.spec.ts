import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderService } from './sales-order.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { MaterialTransactionsService } from 'src/inventory/material-transactions/material-transactions.service';
import { MaterialsService } from 'src/inventory/materials/materials.service';
import { PurchaseService } from 'src/inventory/purchase/purchase.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

describe('Wave 2 – live material stock check', () => {
  let service: SalesOrderService;
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
      withTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: MaterialStockService, useValue: {} },
        { provide: MaterialTransactionsService, useValue: {} },
        { provide: MaterialsService, useValue: {} },
        { provide: PurchaseService, useValue: {} },
        { provide: AuditLogService, useValue: { logMutation: jest.fn(), logMutationIfSuccess: jest.fn() } },
        { provide: BackorderService, useValue: {} },
      ],
    }).compile();

    service = module.get(SalesOrderService);
  });

  it('computes available stock as on-hand minus reserved pending SO qty', async () => {
    databaseService.query.mockResolvedValueOnce({
      rows: [{ id: 5, on_hand: 10, reserved_qty: 8 }],
      rowCount: 1,
    });

    const result = await service.checkMaterialStockAvailability([
      { materialId: 5, qty: 5, isNonInventory: false },
    ]);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        materialId: 5,
        requestedQty: 5,
        onHandStock: 10,
        reservedQty: 8,
        availableQty: 2,
        shortageQty: 3,
      }),
    );
  });

  it('has no shortage when available covers the ordered qty', async () => {
    databaseService.query.mockResolvedValueOnce({
      rows: [{ id: 5, on_hand: 10, reserved_qty: 0 }],
      rowCount: 1,
    });

    const result = await service.checkMaterialStockAvailability([
      { materialId: 5, qty: 4, isNonInventory: false },
    ]);

    expect(result.items[0].shortageQty).toBe(0);
    expect(result.items[0].availableQty).toBe(10);
  });

  it('skips non-inventory lines', async () => {
    const result = await service.checkMaterialStockAvailability([
      { materialId: 5, qty: 4, isNonInventory: true },
    ]);

    expect(result.items).toEqual([]);
    expect(databaseService.query).not.toHaveBeenCalled();
  });
});
