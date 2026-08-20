import { Test, TestingModule } from '@nestjs/testing';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuditLogService } from 'src/audit-log/audit-log.service';

describe('CapacityController', () => {
  let controller: CapacityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CapacityController],
      providers: [
        { provide: CapacityService, useValue: {} },
        { provide: AuditLogService, useValue: { logMutationIfSuccess: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CapacityController>(CapacityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
