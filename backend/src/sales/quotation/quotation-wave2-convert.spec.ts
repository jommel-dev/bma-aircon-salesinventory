import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from './quotation.service';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

describe('Wave 2 – Quotation convert to Sales Order', () => {
  let service: QuotationService;
  let backorderService: { processBackordersForSalesOrder: jest.Mock };
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    backorderService = {
      processBackordersForSalesOrder: jest.fn().mockResolvedValue({ backorderCount: 1 }),
    };
    databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: AuditLogService, useValue: { logMutation: jest.fn() } },
        { provide: BackorderService, useValue: backorderService },
      ],
    }).compile();

    service = module.get(QuotationService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      success: true,
      item: { id: 1, status: 'converted' },
    } as any);
  });

  it('processes backorders after converting a material quotation', async () => {
    databaseService.withTransaction.mockResolvedValue({
      quotationId: 1,
      salesOrderId: 88,
      alreadyConverted: false,
      hasMaterialItems: true,
      soNumber: '2026-88',
    });

    const result = await service.convertToSalesOrder(1, 4, 2);

    expect(result.success).toBe(true);
    expect(result.data.hasMaterialItems).toBe(true);
    expect(backorderService.processBackordersForSalesOrder).toHaveBeenCalledWith(88, 4);
  });

  it('does not process backorders for an AC-only converted quotation', async () => {
    databaseService.withTransaction.mockResolvedValue({
      quotationId: 1,
      salesOrderId: 89,
      alreadyConverted: false,
      hasMaterialItems: false,
      soNumber: '2026-89',
    });

    const result = await service.convertToSalesOrder(1, 4, 2);

    expect(result.success).toBe(true);
    expect(backorderService.processBackordersForSalesOrder).not.toHaveBeenCalled();
  });

  it('does not fail convert when backorder processing throws', async () => {
    databaseService.withTransaction.mockResolvedValue({
      quotationId: 1,
      salesOrderId: 90,
      alreadyConverted: false,
      hasMaterialItems: true,
      soNumber: '2026-90',
    });
    backorderService.processBackordersForSalesOrder.mockRejectedValue(new Error('lock timeout'));

    const result = await service.convertToSalesOrder(1, 4, 2);

    expect(result.success).toBe(true);
    expect(result.data.salesOrderId).toBe(90);
  });
});
