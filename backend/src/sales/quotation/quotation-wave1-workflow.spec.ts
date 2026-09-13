import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from './quotation.service';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BackorderService } from '../backorder/backorder.service';

describe('Wave 1 – Quotation workflow', () => {
  let service: QuotationService;
  let databaseService: { query: jest.Mock; withTransaction: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      withTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: DatabaseService, useValue: databaseService },
        {
          provide: AuditLogService,
          useValue: { logMutation: jest.fn(), logMutationIfSuccess: jest.fn() },
        },
        {
          provide: BackorderService,
          useValue: { processBackordersForSalesOrder: jest.fn().mockResolvedValue({ backorderCount: 0 }) },
        },
      ],
    }).compile();

    service = module.get(QuotationService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      success: true,
      item: { id: 1, totalAmount: 500, status: 'finalized' },
    } as any);
  });

  describe('isMaterialQuotationLine', () => {
    const isMaterial = (item: Record<string, unknown>) =>
      (service as any).isMaterialQuotationLine(item);

    it('treats explicit materialId as a material line', () => {
      expect(isMaterial({ materialId: 12, description: 'Tube' })).toBe(true);
    });

    it('does not reclassify AC/HVAC lines that have product and capacity', () => {
      expect(
        isMaterial({
          description: 'Split Type 1.0HP',
          rate: 25000,
          productId: 8,
          capacityId: 3,
        }),
      ).toBe(false);
    });

    it('treats material-form lines (description/rate, no product) as material', () => {
      expect(isMaterial({ description: 'Copper Tube', rate: 120 })).toBe(true);
    });
  });

  describe('update without productItems', () => {
    it('does not zero total_amount on a remarks-only PATCH', async () => {
      let updateSql = '';
      let updateParams: unknown[] = [];

      databaseService.withTransaction.mockImplementation(async (fn) => {
        const client = {
          query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
            const text = String(sql);
            if (text.includes('SET status = \'expired\'')) {
              return { rows: [], rowCount: 0 };
            }
            if (text.includes('FROM tblquotation') && text.includes('WHERE id')) {
              return {
                rows: [
                  {
                    id: 1,
                    status: 'finalized',
                    quoteDate: '2026-01-01',
                    validityDays: '14',
                    isDeleted: false,
                    customerName: 'Acme',
                    customerAddress: '',
                    customerContactPerson: '',
                    customerContactNumber: '',
                    customerEmail: '',
                    customerTinNumber: '',
                    totalAmount: '500',
                  },
                ],
                rowCount: 1,
              };
            }
            if (text.includes('UPDATE tblquotation')) {
              updateSql = text;
              updateParams = params ?? [];
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          }),
        };
        return fn(client);
      });

      const result = await service.update(1, { remarks: 'follow up only' } as any);

      expect(result.success).toBe(true);
      expect(updateSql.toLowerCase()).not.toContain('total_amount');
      expect(updateParams).not.toContain(0);
    });
  });

  describe('convertToSalesOrder expiry', () => {
    it('rejects a finalized quote whose expires_at has already passed', async () => {
      databaseService.withTransaction.mockImplementation(async (fn) => {
        const client = {
          query: jest.fn().mockImplementation(async (sql: string) => {
            const text = String(sql);
            if (text.includes('SET status = \'expired\'')) {
              return { rows: [], rowCount: 0 };
            }
            if (text.includes('FROM tblquotation')) {
              return {
                rows: [
                  {
                    id: 9,
                    quoteNo: 'QT-1',
                    quoteDate: '2026-01-01',
                    customerId: 'cust-1',
                    customerName: 'Acme',
                    customerAddress: '',
                    customerContactPerson: '',
                    customerContactNumber: '',
                    customerEmail: '',
                    customerTinNumber: '',
                    totalAmount: '100',
                    status: 'finalized',
                    remarks: '',
                    convertedSalesId: null,
                    isDeleted: false,
                    expiresAt: '2020-01-01T00:00:00.000Z',
                  },
                ],
                rowCount: 1,
              };
            }
            return { rows: [], rowCount: 0 };
          }),
        };
        return fn(client);
      });

      const result = await service.convertToSalesOrder(9, 1, 1);
      expect(result.success).toBe(false);
      expect(String(result.message)).toMatch(/expired/i);
    });

    it('locks the quotation row during convert', async () => {
      let sawForUpdate = false;
      databaseService.withTransaction.mockImplementation(async (fn) => {
        const client = {
          query: jest.fn().mockImplementation(async (sql: string) => {
            const text = String(sql);
            if (text.includes('FOR UPDATE')) {
              sawForUpdate = true;
            }
            if (text.includes('FROM tblquotation')) {
              return {
                rows: [
                  {
                    id: 9,
                    status: 'finalized',
                    isDeleted: false,
                    convertedSalesId: null,
                    expiresAt: '2099-01-01T00:00:00.000Z',
                    customerId: null,
                    customerName: 'Acme',
                    totalAmount: '10',
                  },
                ],
                rowCount: 1,
              };
            }
            return { rows: [], rowCount: 0 };
          }),
        };
        return fn(client);
      });

      await service.convertToSalesOrder(9, 1, 1);
      expect(sawForUpdate).toBe(true);
    });
  });
});
