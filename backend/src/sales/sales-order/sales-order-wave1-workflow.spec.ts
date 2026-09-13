import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderService } from './sales-order.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { MaterialTransactionsService } from 'src/inventory/material-transactions/material-transactions.service';
import { MaterialsService } from 'src/inventory/materials/materials.service';
import { PurchaseService } from 'src/inventory/purchase/purchase.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

describe('Wave 1 – Material SO stock and workflow', () => {
  let service: SalesOrderService;
  let materialStockService: { recordMovement: jest.Mock };
  let databaseService: {
    query: jest.Mock;
    withTransaction: jest.Mock;
  };
  let clientQuery: jest.Mock;

  beforeEach(async () => {
    clientQuery = jest.fn();
    materialStockService = {
      recordMovement: jest.fn().mockResolvedValue({ movement: { id: 1 }, balance: {} }),
    };
    databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(async (fn: (client: { query: jest.Mock }) => Promise<unknown>) =>
        fn({ query: clientQuery }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: MaterialStockService, useValue: materialStockService },
        { provide: MaterialTransactionsService, useValue: {} },
        { provide: MaterialsService, useValue: {} },
        { provide: PurchaseService, useValue: {} },
        { provide: AuditLogService, useValue: { logMutation: jest.fn(), logMutationIfSuccess: jest.fn() } },
        {
          provide: BackorderService,
          useValue: {
            cancelOpenBackordersForSalesOrder: jest.fn().mockResolvedValue(0),
            processBackordersForSalesOrder: jest.fn().mockResolvedValue({ backorderCount: 1 }),
          },
        },
      ],
    }).compile();

    service = module.get(SalesOrderService);
  });

  describe('returnNetCompletionStock (void after partial complete)', () => {
    it('returns only the net deducted qty, not the full line qty', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ material_id: 5, qty: 100, is_non_inventory: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ net_qty: 30 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await (service as any).returnNetCompletionStock({ query: clientQuery }, 42);

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'RETURN',
          qty: 30,
          sourceType: 'SO',
          sourceId: 42,
        }),
        { client: { query: clientQuery } },
      );

      const stockUpdate = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE tblmaterials'),
      );
      expect(stockUpdate?.[1]).toEqual([30, 5]);
    });

    it('does not restore stock when nothing was deducted', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ material_id: 5, qty: 100, is_non_inventory: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ net_qty: 0 }], rowCount: 1 });

      await (service as any).returnNetCompletionStock({ query: clientQuery }, 42);

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
      expect(
        clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE tblmaterials')),
      ).toBe(false);
    });

    it('skips non-inventory and invalid lines', async () => {
      clientQuery.mockResolvedValueOnce({
        rows: [
          { material_id: 5, qty: 10, is_non_inventory: true },
          { material_id: null, qty: 10, is_non_inventory: false },
        ],
        rowCount: 2,
      });

      await (service as any).returnNetCompletionStock({ query: clientQuery }, 42);

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('deductReturnedStockOnUnvoid', () => {
    it('re-deducts the voided return qty, not the full line qty', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ material_id: 5, qty: 100, is_non_inventory: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ returned_qty: 30, unvoided_qty: 0 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await (service as any).deductReturnedStockOnUnvoid({ query: clientQuery }, 42);

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'OUT',
          qty: 30,
          sourceLineKey: expect.stringMatching(/^SO-42-MAT-5-UNVOID-/),
        }),
        { client: { query: clientQuery } },
      );

      const stockUpdate = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE tblmaterials'),
      );
      expect(stockUpdate?.[1]).toEqual([30, 5]);
    });

    it('is idempotent when the void return was already unvoided', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [{ material_id: 5, qty: 100, is_non_inventory: false }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ returned_qty: 30, unvoided_qty: 30 }],
          rowCount: 1,
        });

      await (service as any).deductReturnedStockOnUnvoid({ query: clientQuery }, 42);

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('allocateMaterialSoNumber', () => {
    it('increments the sequence and returns prefix-value', async () => {
      clientQuery.mockResolvedValueOnce({
        rows: [{ current_value: 8245, prefix: '2026' }],
        rowCount: 1,
      });

      const soNumber = await (service as any).allocateMaterialSoNumber({ query: clientQuery });

      expect(soNumber).toBe('2026-8245');
      expect(String(clientQuery.mock.calls[0][0])).toContain('UPDATE tblsequences');
    });

    it('seeds the sequence when none exists', async () => {
      clientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const soNumber = await (service as any).allocateMaterialSoNumber({ query: clientQuery });

      expect(soNumber).toMatch(/^\d{4}-1$/);
      expect(String(clientQuery.mock.calls[1][0])).toContain('INSERT INTO tblsequences');
    });
  });

  describe('getMaterialSalesOrders listing', () => {
    it('filters to material-line orders and treats complete/completed as one tab', async () => {
      databaseService.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getMaterialSalesOrders({ status: 'complete', page: 1, limit: 10 });

      const sql = databaseService.query.mock.calls
        .map(([text]) => String(text))
        .join('\n');

      expect(sql).toContain('EXISTS (SELECT 1 FROM tblsales_order_items');
      expect(sql).toContain("IN ('complete', 'completed')");
    });
  });

  describe('updateMaterialSalesOrder complete from list modal', () => {
    it('completes a pending order even when stock is short (backorder path)', async () => {
      clientQuery.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('FROM tblsales_order WHERE id')) {
          return {
            rows: [{ id: 3316, sales_type: 'sales', status: 'pending', customer_id: '16399' }],
            rowCount: 1,
          };
        }
        if (text.includes('UPDATE tblsales_order')) {
          return { rows: [{ id: 3316 }], rowCount: 1 };
        }
        if (text.includes('FROM tblsales_order_items')) {
          return {
            rows: [{ material_id: 5, qty: 10, is_non_inventory: false }],
            rowCount: 1,
          };
        }
        if (text.includes('on_hand_stock')) {
          return { rows: [{ available_stock: 0 }], rowCount: 1 };
        }
        if (text.includes('tblmaterial_stock_movement')) {
          return { rows: [{ net_qty: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await service.updateMaterialSalesOrder(3316, { status: 'complete' });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('complete');
      expect(String(clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE tblsales_order'))?.[0])).toContain(
        'status =',
      );
    });
  });

  describe('createMaterialSalesOrder response contract', () => {
    it('returns both id and salesOrderId for the print-after-complete UI', async () => {
      clientQuery.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('INSERT INTO tblsales_order')) {
          return { rows: [{ id: 77 }], rowCount: 1 };
        }
        if (text.includes('UPDATE tblsequences')) {
          return { rows: [{ current_value: 10, prefix: '2026' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await service.createMaterialSalesOrder({
        status: 'draft',
        productItems: [
          {
            materialId: 5,
            description: 'Copper Tube',
            itemCode: 'CT-1',
            brand: 'Generic',
            cost: 10,
            rate: 12,
            qty: 2,
            isNonInventory: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe(77);
      expect(result.salesOrderId).toBe(77);
      expect(result.data.salesOrderId).toBe(77);
    });
  });
});
