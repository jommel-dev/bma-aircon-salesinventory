import { Test, TestingModule } from '@nestjs/testing';
import { BrandsService } from './brands.service';
import { DatabaseService } from '../../database/database.service';

describe('BrandsService', () => {
  let service: BrandsService;

  const mockDatabaseService = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<BrandsService>(BrandsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
