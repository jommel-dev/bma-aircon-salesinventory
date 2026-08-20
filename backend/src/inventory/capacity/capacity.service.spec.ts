import { Test, TestingModule } from '@nestjs/testing';
import { CapacityService } from './capacity.service';
import { DatabaseService } from 'src/database/database.service';

describe('CapacityService', () => {
  let service: CapacityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapacityService,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
      ],
    }).compile();

    service = module.get<CapacityService>(CapacityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
