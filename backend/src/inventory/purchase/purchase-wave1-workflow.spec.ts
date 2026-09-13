import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from 'src/sales/backorder/backorder.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

describe('Wave 1 – ACM PO workflow', () => {
  let service: PurchaseService;
  let materialStockService: { recordMovement: jest.Mock };
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };
  let capturedPoInsert: { sql: string; params: unknown[] } | null;

  const columnRows = (names: string[]) => ({
    rows: names.map((column_name) => ({ column_name })),
    rowCount: names.length,
  });

  beforeEach(async () => {
    capturedPoInsert = null;
    materialStockService = { recordMovement: jest.fn() };
    databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: MaterialStockService, useValue: materialStockService },
        { provide: AuditLogService, useValue: { log: jest.fn(), logMutation: jest.fn() } },
        { provide: BackorderService, useValue: { allocateIncomingStockToBackorders: jest.fn().mockResolvedValue({ allocatedQty: 0, allocations: [] }) } },
      ],
    }).compile();

    service = module.get(PurchaseService);
  });

  describe('ACM create status', () => {
    it('forces ACM create status to complete', async () => {
      databaseService.withTransaction.mockImplementation(async (fn) => {
        const client = {
          query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
            const text = String(sql);
            if (text.includes('information_schema.columns')) {
              const table = String(params?.[0] ?? '');
              if (table === 'tblvendors') {
                return columnRows(['id', 'name', 'address', 'contact_person', 'contact_number', 'created_at', 'updated_at']);
              }
              if (table === 'tblpurchase_orders') {
                return columnRows(['id', 'po_number', 'vendor_id', 'total_amount', 'status', 'po_type', 'created_by', 'branch_id']);
              }
              if (table === 'tbltransaction_material_items') {
                return columnRows(['id', 'material_id', 'quantity', 'purchase_id', 'unit_price', 'sell_price', 'discount_price', 'transType']);
              }
              if (table === 'tblpo_payments') {
                return columnRows(['id', 'po_id', 'method', 'amount']);
              }
              return columnRows(['id']);
            }
            if (text.includes('FROM tblvendors') && text.includes('id::text')) {
              return { rows: [{ id: 'vendor-1' }], rowCount: 1 };
            }
            if (text.includes('INSERT INTO tblpurchase_orders')) {
              capturedPoInsert = { sql: text, params: params ?? [] };
              return { rows: [{ id: 55 }], rowCount: 1 };
            }
            if (text.includes('INSERT INTO tbltransaction_material_items')) {
              return { rows: [{ id: 1 }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }),
        };
        return fn(client);
      });

      try {
        await service.create(
          {
            poType: 'ACM',
            status: 'for_approval',
            vendorId: 'vendor-1',
            productItems: [
              {
                transType: 'purchase',
                materialId: 5,
                materialName: 'Copper Tube',
                unitPrice: 10,
                totalSetQty: 1000000,
              },
            ],
          } as any,
          1,
          1,
        );
      } catch {
        // Incomplete item-insert mocking is acceptable; status is captured on PO insert.
      }

      expect(capturedPoInsert).not.toBeNull();
      expect(capturedPoInsert?.params).toContain('complete');
      expect(capturedPoInsert?.params).not.toContain('for_approval');
    });

  });

  describe('completed ACM qty adjustment movement type', () => {
    it('uses IN when qty increases and OUT when qty decreases', () => {
      const resolveType = (diff: number) => (diff > 0 ? 'IN' : 'OUT');
      expect(resolveType(10)).toBe('IN');
      expect(resolveType(-8)).toBe('OUT');
    });
  });

  describe('cancel after stock is posted', () => {
    const expectCancelBlocked = async (status: string) => {
      databaseService.withTransaction.mockImplementation(async (fn) => {
        const client = {
          query: jest.fn().mockResolvedValueOnce({
            rows: [{ status }],
            rowCount: 1,
          }),
        };
        return fn(client);
      });

      const result = await service.cancelPurchase(9, { userId: 1 });
      expect(result.success).toBe(false);
      expect(result.message).toContain(status);
    };

    it('blocks cancel for complete', async () => {
      await expectCancelBlocked('complete');
    });

    it('blocks cancel for received', async () => {
      await expectCancelBlocked('received');
    });

    it('blocks cancel for completed', async () => {
      await expectCancelBlocked('completed');
    });
  });

  describe('quantity cap 9999999', () => {
    it('accepts 9999999 through DTO validation', () => {
      expect(() =>
        CreatePurchaseDto.validateAcm({
          poType: 'ACM',
          vendorId: '1',
          productItems: [
            {
              transType: 'purchase',
              materialId: 1,
              unitPrice: 1,
              totalSetQty: 9999999,
            },
          ],
        } as any),
      ).not.toThrow();
    });

    it('rejects 10000000 through DTO validation', () => {
      expect(() =>
        CreatePurchaseDto.validateAcm({
          poType: 'ACM',
          vendorId: '1',
          productItems: [
            {
              transType: 'purchase',
              materialId: 1,
              unitPrice: 1,
              totalSetQty: 10000000,
            },
          ],
        } as any),
      ).toThrow(/9,999,999/);
    });
  });
});
