import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from '../../database/database.service';
import { MaterialStockService } from '../material-stock/material-stock.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

describe('PurchaseService', () => {
  let service: PurchaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: { pool: { query: jest.fn(), connect: jest.fn() } } },
        { provide: MaterialStockService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shouldUseApprovedPriceForCapacityUpdate', () => {
    const shouldUse = (current: number, incoming: number): boolean =>
      (service as unknown as {
        shouldUseApprovedPriceForCapacityUpdate: (currentPrice: number, incomingPrice: number) => boolean;
      }).shouldUseApprovedPriceForCapacityUpdate(current, incoming);

    it('rejects empty or invalid incoming unit costs', () => {
      expect(shouldUse(100, 0)).toBe(false);
      expect(shouldUse(100, Number.NaN)).toBe(false);
    });

    it('updates current unit cost when the next PO cost is higher', () => {
      expect(shouldUse(100, 150)).toBe(true);
    });

    it('updates current unit cost when the next PO cost is lower', () => {
      expect(shouldUse(100, 40)).toBe(true);
    });

    it('skips update when the next PO cost matches current', () => {
      expect(shouldUse(100, 100)).toBe(false);
    });
  });
});
