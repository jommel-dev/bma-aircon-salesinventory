import { Test, TestingModule } from '@nestjs/testing';
import { SerialNumberController } from './serial-number.controller';
import { SerialNumberService } from './serial-number.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuditLogService } from 'src/audit-log/audit-log.service';

describe('SerialNumberController', () => {
  let controller: SerialNumberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SerialNumberController],
      providers: [
        { provide: SerialNumberService, useValue: {} },
        { provide: AuditLogService, useValue: { logMutationIfSuccess: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SerialNumberController>(SerialNumberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
