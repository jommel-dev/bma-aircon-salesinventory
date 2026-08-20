import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderController } from './sales-order.controller';
import { SalesOrderService } from './sales-order.service';
import { MaterialTransactionsService } from 'src/inventory/material-transactions/material-transactions.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

describe('SalesOrderController', () => {
  let controller: SalesOrderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesOrderController],
      providers: [
        { provide: SalesOrderService, useValue: {} },
        { provide: MaterialTransactionsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SalesOrderController>(SalesOrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
