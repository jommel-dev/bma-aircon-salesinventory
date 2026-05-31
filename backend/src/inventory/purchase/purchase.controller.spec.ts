import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from '../../database/database.service';
import { MaterialStockService } from '../material-stock/material-stock.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { ConfigService } from '@nestjs/config';

describe('PurchaseController', () => {
  let controller: PurchaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseController],
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: { pool: { query: jest.fn(), connect: jest.fn() } } },
        { provide: MaterialStockService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<PurchaseController>(PurchaseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
