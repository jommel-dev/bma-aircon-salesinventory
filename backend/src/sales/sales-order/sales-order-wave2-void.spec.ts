import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderService } from './sales-order.service';
import { DatabaseService } from 'src/database/database.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';
import { MaterialTransactionsService } from 'src/inventory/material-transactions/material-transactions.service';
import { MaterialsService } from 'src/inventory/materials/materials.service';
import { PurchaseService } from 'src/inventory/purchase/purchase.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

describe('Wave 2 – Material SO void cancels open backorders', () => {
  let service: SalesOrderService;
  let backorderService: { cancelOpenBackordersForSalesOrder: jest.Mock };
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    backorderService = {
      cancelOpenBackordersForSalesOrder: jest.fn().mockResolvedValue(1),
    };
    databaseService = {
      query: jest.fn(),
      withTransaction: jest.fn(async (fn: (client: { query: jest.Mock }) => Promise<unknown>) =>
        fn({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: MaterialStockService, useValue: { recordMovement: jest.fn() } },
        { provide: MaterialTransactionsService, useValue: {} },
        { provide: MaterialsService, useValue: {} },
        { provide: PurchaseService, useValue: {} },
        { provide: AuditLogService, useValue: { logMutation: jest.fn(), logMutationIfSuccess: jest.fn() } },
        { provide: BackorderService, useValue: backorderService },
      ],
    }).compile();

    service = module.get(SalesOrderService);
    jest.spyOn(service as any, 'returnNetCompletionStock').mockResolvedValue(undefined);
  });

  it('cancels open backorders when bulk-voiding a completed material SO', async () => {
    databaseService.query.mockResolvedValueOnce({
      rows: [{ status: 'complete' }],
      rowCount: 1,
    });

    const result = await service.bulkVoidMaterialSalesOrders([42], 'customer cancelled', 7);

    expect(result.voided).toBe(1);
    expect(backorderService.cancelOpenBackordersForSalesOrder).toHaveBeenCalledWith(42, 7);
  });

  it('does not cancel backorders for a pending SO that cannot be voided', async () => {
    databaseService.query.mockResolvedValueOnce({
      rows: [{ status: 'pending' }],
      rowCount: 1,
    });

    const result = await service.bulkVoidMaterialSalesOrders([42], 'too early', 7);

    expect(result.voided).toBe(0);
    expect(result.skipped).toBe(1);
    expect(backorderService.cancelOpenBackordersForSalesOrder).not.toHaveBeenCalled();
  });
});
