import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BackorderService } from './backorder.service';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';

describe('Wave 2 – Backorder stock workflow', () => {
  let service: BackorderService;
  let materialStockService: { recordMovement: jest.Mock };
  let clientQuery: jest.Mock;
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    clientQuery = jest.fn();
    materialStockService = { recordMovement: jest.fn().mockResolvedValue({}) };
    databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(async (fn: (client: { query: jest.Mock }) => Promise<unknown>) =>
        fn({ query: clientQuery }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackorderService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
        { provide: MaterialStockService, useValue: materialStockService },
      ],
    }).compile();

    service = module.get(BackorderService);
  });

  describe('processBackordersForSalesOrder', () => {
    it('creates a backorder for the shortage and does not write an OUT movement', async () => {
      clientQuery
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              item_id: 11,
              sales_order_id: 50,
              material_id: 5,
              description: 'Copper Tube',
              ordered_qty: 100,
              is_non_inventory: false,
              on_hand_qty: 30,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ id: 99, created_at: '2026-01-01' }],
          rowCount: 1,
        });

      const result = await service.processBackordersForSalesOrder(50, 1);

      expect(result.backorderCount).toBe(1);
      expect(result.createdBackorders[0]).toEqual(
        expect.objectContaining({ backorderId: 99, materialId: 5, backorderQty: 70 }),
      );
      expect(
        clientQuery.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO tblmaterial_stock_movement'),
        ),
      ).toBe(false);
      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });

    it('is idempotent when a pending backorder already exists for the line', async () => {
      clientQuery
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              item_id: 11,
              sales_order_id: 50,
              material_id: 5,
              description: 'Copper Tube',
              ordered_qty: 100,
              is_non_inventory: false,
              on_hand_qty: 30,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 });

      const result = await service.processBackordersForSalesOrder(50, 1);

      expect(result.backorderCount).toBe(0);
      expect(
        clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO tblmaterial_backorder')),
      ).toBe(false);
    });

    it('skips non-inventory lines', async () => {
      clientQuery
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              item_id: 11,
              sales_order_id: 50,
              material_id: 5,
              description: 'Others',
              ordered_qty: 100,
              is_non_inventory: true,
              on_hand_qty: 0,
            },
          ],
          rowCount: 1,
        });

      const result = await service.processBackordersForSalesOrder(50, 1);
      expect(result.backorderCount).toBe(0);
    });
  });

  describe('fulfillBackorder', () => {
    it('increases on_hand_stock and records an IN movement through MaterialStockService', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 9,
              material_id: 5,
              sales_order_id: 50,
              backorder_qty: 70,
              fulfilled_qty: 0,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ id: 9, status: 'partial_fulfilled', fulfilled_qty: 20 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.fulfillBackorder(9, 20, 1);

      expect(materialStockService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 5,
          movementType: 'IN',
          qty: 20,
          sourceType: 'SO',
          sourceId: 50,
        }),
        { client: { query: clientQuery } },
      );

      const stockUpdate = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE tblmaterials'),
      );
      expect(stockUpdate?.[1]).toEqual([20, 5]);
    });

    it('rejects an over-fulfill qty', async () => {
      clientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            material_id: 5,
            sales_order_id: 50,
            backorder_qty: 10,
            fulfilled_qty: 8,
          },
        ],
        rowCount: 1,
      });

      await expect(service.fulfillBackorder(9, 5, 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('cancelBackorder', () => {
    it('cancels the record without writing a compensating IN movement', async () => {
      clientQuery.mockResolvedValueOnce({
        rows: [{ id: 9, material_id: 5, backorder_qty: 70, fulfilled_qty: 0 }],
        rowCount: 1,
      });

      await service.cancelBackorder(9, 'no longer needed', 1);

      expect(
        clientQuery.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO tblmaterial_stock_movement'),
        ),
      ).toBe(false);
      expect(materialStockService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('allocateIncomingStockToBackorders', () => {
    it('applies inbound PO qty to open backorders FIFO and deducts the fulfilled shortage', async () => {
      clientQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, sales_order_id: 50, backorder_qty: 30, fulfilled_qty: 0 },
            { id: 2, sales_order_id: 51, backorder_qty: 40, fulfilled_qty: 0 },
          ],
          rowCount: 2,
        })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.allocateIncomingStockToBackorders(5, 50, {
        userId: 1,
        purchaseId: 88,
      });

      expect(result.allocatedQty).toBe(50);
      expect(result.allocations).toEqual([
        { backorderId: 1, qty: 30, status: 'fulfilled' },
        { backorderId: 2, qty: 20, status: 'partial_fulfilled' },
      ]);
      expect(materialStockService.recordMovement).toHaveBeenCalledTimes(2);
      expect(materialStockService.recordMovement).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          materialId: 5,
          movementType: 'OUT',
          qty: 30,
          sourceType: 'SO',
          sourceId: 50,
        }),
        { client: expect.anything() },
      );
      expect(
        clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE tblmaterials')),
      ).toBe(true);

      const firstUpdate = clientQuery.mock.calls.find(([, params]) => params?.[4] === 1);
      expect(firstUpdate?.[1]).toEqual([30, 'fulfilled', 1, 'PO #88', 1]);
    });

    it('does nothing when there are no open backorders', async () => {
      clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.allocateIncomingStockToBackorders(5, 10, { purchaseId: 88 });

      expect(result.allocatedQty).toBe(0);
      expect(result.allocations).toEqual([]);
    });
  });

  describe('cancelOpenBackordersForSalesOrder', () => {
    it('cancels pending and partial backorders for a voided SO', async () => {
      databaseService.query.mockResolvedValueOnce({ rows: [], rowCount: 2 });

      const cancelled = await service.cancelOpenBackordersForSalesOrder(50, 1);

      expect(cancelled).toBe(2);
      expect(String(databaseService.query.mock.calls[0][0])).toContain("status = 'cancelled'");
      expect(databaseService.query.mock.calls[0][1]).toEqual([1, 50]);
    });
  });
});
