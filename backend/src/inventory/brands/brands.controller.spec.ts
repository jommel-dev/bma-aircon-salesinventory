import { Test, TestingModule } from '@nestjs/testing';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuditLogService } from 'src/audit-log/audit-log.service';

describe('BrandsController', () => {
  let controller: BrandsController;

  const mockBrandsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    getMaterialBrands: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: AuditLogService, useValue: { logMutationIfSuccess: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandsController>(BrandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
