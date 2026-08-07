import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderService } from './sales-order.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { MaterialTransactionsService } from 'src/inventory/material-transactions/material-transactions.service';
import { MaterialsService } from 'src/inventory/materials/materials.service';
import { PurchaseService } from 'src/inventory/purchase/purchase.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

type QueryFn = jest.Mock<Promise<{ rows: any[]; rowCount?: number }>, [string, any?]>;

describe('SalesOrderService – material SO stock deduction', () => {
  let service: SalesOrderService;
  let materialStockService: { recordMovement: jest.Mock };
  let clientQuery: QueryFn;

  const callDeduct = (
    salesOrderId: number,
    items: Array<{
      materialId?: number | null;
      qty?: number;
      isNonInventory?: boolean;
    }>,
  ) =>
    (service as any).deductMaterialsOnSalesOrderComplete(
      { query: clientQuery },
      salesOrderId,
      items,
    );

  const callAdjust = (
    salesOrderId: number,
    previousItems: Array<{
      materialId?: number | null;
      qty?: number;
      isNonInventory?: boolean;
    }>,
    newItems: Array<{
      materialId?: number | null;
      qty?: number;
      isNonInventory?: boolean;
    }>,
  ) =>
    (service as any).adjustMaterialsStockForCompletedOrderEdit(
      { query: clientQuery },
      salesOrderId,
      previousItems,
      newItems,
    );

  /** Queue ordered client.query responses for deduct/adjust helpers. */
  const queue = (...responses: Array<{ rows: any[]; rowCount?: number }>) => {
    for (const response of responses) {
      clientQuery.mockResolvedValueOnce({
        rowCount: response.rowCount ?? response.rows.length,
        ...response,
      });
    }
  };

  beforeEach(async () => {
    clientQuery = jest.fn();
    materialStockService = {
      recordMovement: jest.fn().mockResolvedValue({ movement: { id: 1 }, balance: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: DatabaseService, useValue: { query: jest.fn(), withTransaction: jest.fn() } },
        { provide: MaterialStockService, useValue: materialStockService },
        { provide: MaterialTransactionsService, useValue: {} },
        { provide: MaterialsService, useValue: {} },
        { provide: PurchaseService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: BackorderService, useValue: {} },
      ],
    }).compile();

    service = module.get(SalesOrderService);
  });

  describe('deductMaterialsOnSalesOrderComplete (first-time / void→re-complete)', () => {
    it('deducts available stock and records an OUT movement', async () => {
      queue(
        { rows: [{ available_stock: 10 }] }, // FOR UPDATE stock
        { rows: [{ net_qty: 0 }] }, // net OUT-RETURN
        { rows: [], rowCount: 0 }, // base key free
        { rows: [], rowCount: 1 }, // UPDATE on_hand
      );

      await callDeduct(100, [
        {
          materialId: 5,
          qty: 4,
          isNonInventory: false,
        },
      ]);

      expect(materialStockService.recordMovement).toHaveBeenCalledTimes(1);
      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'OUT',
          qty: 4,
          sourceType: 'SO',
          sourceId: 100,
          sourceLineKey: 'SO-100-MAT-5',
        }),
        { client: { query: clientQuery } },
      );

      const updateCall = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE tblmaterials'),
      );
      expect(updateCall?.[1]).toEqual([4, 5]);
    });

    it('skips deduction when on_hand_stock is zero', async () => {
      queue(
        { rows: [{ available_stock: 0 }] },
        { rows: [{ net_qty: 0 }] },
      );

      await callDeduct(100, [{ materialId: 5, qty: 4, isNonInventory: false }]);

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
      expect(
        clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE tblmaterials')),
      ).toBe(false);
    });

    it('caps deduction at available stock (partial deduct)', async () => {
      queue(
        { rows: [{ available_stock: 3 }] },
        { rows: [{ net_qty: 0 }] },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
      );

      await callDeduct(100, [{ materialId: 5, qty: 10, isNonInventory: false }]);

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ qty: 3 }),
        expect.anything(),
      );
    });

    it('aggregates duplicate material lines into one deduction', async () => {
      queue(
        { rows: [{ available_stock: 20 }] },
        { rows: [{ net_qty: 0 }] },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
      );

      await callDeduct(100, [
        { materialId: 5, qty: 3, isNonInventory: false },
        { materialId: 5, qty: 2, isNonInventory: false },
      ]);

      expect(materialStockService.recordMovement).toHaveBeenCalledTimes(1);
      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ materialId: 5, qty: 5 }),
        expect.anything(),
      );
    });

    it('skips non-inventory and invalid material lines', async () => {
      await callDeduct(100, [
        { materialId: null, qty: 5, isNonInventory: false },
        { materialId: 5, qty: 5, isNonInventory: true },
        { materialId: 0, qty: 5, isNonInventory: false },
        { materialId: 5, qty: 0, isNonInventory: false },
      ]);

      expect(clientQuery).not.toHaveBeenCalled();
      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });

    it('re-deducts after void when net OUT−RETURN is zero', async () => {
      // Prior OUT existed, but RETURN brought net to 0
      queue(
        { rows: [{ available_stock: 10 }] },
        { rows: [{ net_qty: 0 }] },
        { rows: [{ '?column?': 1 }], rowCount: 1 }, // base key already used
        { rows: [], rowCount: 1 },
      );

      await callDeduct(100, [{ materialId: 5, qty: 10, isNonInventory: false }]);

      expect(materialStockService.recordMovement).toHaveBeenCalledTimes(1);
      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          qty: 10,
          sourceLineKey: expect.stringMatching(/^SO-100-MAT-5-\d+$/),
        }),
        expect.anything(),
      );
    });

    it('does not re-deduct when net already equals ordered qty', async () => {
      queue(
        { rows: [{ available_stock: 50 }] },
        { rows: [{ net_qty: 10 }] }, // already fully deducted
      );

      await callDeduct(100, [{ materialId: 5, qty: 10, isNonInventory: false }]);

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });

    it('deducts only the remaining qty when previously partially deducted', async () => {
      queue(
        { rows: [{ available_stock: 20 }] },
        { rows: [{ net_qty: 3 }] }, // 3 of 10 already out
        { rows: [{ '?column?': 1 }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );

      await callDeduct(100, [{ materialId: 5, qty: 10, isNonInventory: false }]);

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ qty: 7 }),
        expect.anything(),
      );
    });
  });

  describe('adjustMaterialsStockForCompletedOrderEdit (admin edit while complete)', () => {
    it('does not touch stock when line qtys are unchanged', async () => {
      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [{ materialId: 5, qty: 10, isNonInventory: false }],
      );

      expect(clientQuery).not.toHaveBeenCalled();
      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });

    it('does not re-deduct unchanged materials when another line changes', async () => {
      // material 5 unchanged; material 8 qty +2
      queue(
        { rows: [{ id: 8 }] }, // FOR UPDATE material 8
        { rows: [{ available_stock: 10 }] },
        { rows: [], rowCount: 1 }, // UPDATE on_hand
      );

      await callAdjust(
        100,
        [
          { materialId: 5, qty: 10, isNonInventory: false },
          { materialId: 8, qty: 1, isNonInventory: false },
        ],
        [
          { materialId: 5, qty: 10, isNonInventory: false },
          { materialId: 8, qty: 3, isNonInventory: false },
        ],
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledTimes(1);
      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 8,
          movementType: 'OUT',
          qty: 2,
          sourceLineKey: expect.stringContaining('SO-100-MAT-8-EDIT-'),
        }),
        expect.anything(),
      );
    });

    it('deducts only the increased qty delta', async () => {
      queue(
        { rows: [{ id: 5 }] },
        { rows: [{ available_stock: 50 }] },
        { rows: [], rowCount: 1 },
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [{ materialId: 5, qty: 15, isNonInventory: false }],
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'OUT',
          qty: 5,
        }),
        expect.anything(),
      );
    });

    it('returns stock when qty decreases', async () => {
      queue(
        { rows: [{ id: 5 }] }, // FOR UPDATE
        { rows: [{ net_qty: 10 }] }, // net already deducted
        { rows: [], rowCount: 1 }, // UPDATE on_hand +
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [{ materialId: 5, qty: 6, isNonInventory: false }],
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'RETURN',
          qty: 4,
          sourceLineKey: expect.stringContaining('SO-100-MAT-5-EDIT-RETURN-'),
        }),
        expect.anything(),
      );

      const updateCall = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE tblmaterials'),
      );
      expect(updateCall?.[1]).toEqual([4, 5]);
    });

    it('returns stock when a material line is removed', async () => {
      queue(
        { rows: [{ id: 5 }] },
        { rows: [{ net_qty: 10 }] },
        { rows: [], rowCount: 1 },
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [], // removed
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'RETURN',
          qty: 10,
        }),
        expect.anything(),
      );
    });

    it('deducts stock when a new material line is added', async () => {
      queue(
        { rows: [{ id: 9 }] },
        { rows: [{ available_stock: 7 }] },
        { rows: [], rowCount: 1 },
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [
          { materialId: 5, qty: 10, isNonInventory: false },
          { materialId: 9, qty: 3, isNonInventory: false },
        ],
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 9,
          movementType: 'OUT',
          qty: 3,
        }),
        expect.anything(),
      );
    });

    it('caps return on decrease by net already deducted', async () => {
      // Line says decrease by 10, but only 2 was ever deducted
      queue(
        { rows: [{ id: 5 }] },
        { rows: [{ net_qty: 2 }] },
        { rows: [], rowCount: 1 },
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 10, isNonInventory: false }],
        [{ materialId: 5, qty: 0, isNonInventory: false }],
      );

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'RETURN',
          qty: 2,
        }),
        expect.anything(),
      );
    });

    it('skips increase deduct when available stock is zero', async () => {
      queue(
        { rows: [{ id: 5 }] },
        { rows: [{ available_stock: 0 }] },
      );

      await callAdjust(
        100,
        [{ materialId: 5, qty: 1, isNonInventory: false }],
        [{ materialId: 5, qty: 5, isNonInventory: false }],
      );

      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });
  });
});
