import { Test, TestingModule } from '@nestjs/testing';
import { SerialNumberService } from './serial-number.service';
import { DatabaseService } from 'src/database/database.service';

describe('SerialNumberService', () => {
  let service: SerialNumberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SerialNumberService,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
      ],
    }).compile();

    service = module.get<SerialNumberService>(SerialNumberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
