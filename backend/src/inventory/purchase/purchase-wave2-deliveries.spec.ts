import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from 'src/sales/backorder/backorder.service';

describe('Wave 2 – PO deliveries list', () => {
  let service: PurchaseService;
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (String(sql).includes('COUNT(*)')) {
          return { rows: [{ total: '0' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      withTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: MaterialStockService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BackorderService, useValue: { allocateIncomingStockToBackorders: jest.fn() } },
      ],
    }).compile();

    service = module.get(PurchaseService);
  });

  it('exposes the real PO status instead of synthetic pending/in-progress', async () => {
    await service.getDeliveries({ page: 1, limit: 10 } as any);

    const sql = databaseService.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).not.toContain("WHEN COALESCE(sc.serial_count, 0) > 0 THEN 'in-progress'");
    expect(sql).toContain("COALESCE(po.status, 'pending') AS computed_status");
    expect(sql).toContain('original_status');
  });

  it('counts scanned serials from tblserial_numbers, not ordered qty', async () => {
    await service.getDeliveries({ page: 1, limit: 10 } as any);

    const sql = databaseService.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('FROM tblserial_numbers sn');
    expect(sql).not.toContain('SUM(item_qty)');
    expect(sql).toMatch(/serial_counts AS \([\s\S]*FROM tblserial_numbers sn/);
  });
});
