import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreatePayrollDto,
  DailyRecordDto,
  CompensationEntryDto,
  DeductionEntryDto,
} from './create-payroll.dto';

describe('CreatePayrollDto', () => {
  function createValidDto(): Partial<CreatePayrollDto> {
    return {
      cutoffStart: '2025-01-01',
      cutoffEnd: '2025-01-03',
      dailyRecords: [
        { date: '2025-01-01', isPresent: true, commission: 500, remarks: 'On site' },
        { date: '2025-01-02', isPresent: false, commission: 0 },
        { date: '2025-01-03', isPresent: true, commission: 300 },
      ] as DailyRecordDto[],
      additionalCompensation: [
        { description: 'Bonus', amount: 1000 },
      ] as CompensationEntryDto[],
      additionalDeductions: [
        { description: 'Loan', amount: 500 },
      ] as DeductionEntryDto[],
    };
  }

  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CreatePayrollDto, createValidDto());
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with empty additionalCompensation and additionalDeductions', async () => {
    const data = createValidDto();
    data.additionalCompensation = [];
    data.additionalDeductions = [];
    const dto = plainToInstance(CreatePayrollDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation when additionalCompensation and additionalDeductions are omitted', async () => {
    const data = createValidDto();
    delete (data as any).additionalCompensation;
    delete (data as any).additionalDeductions;
    const dto = plainToInstance(CreatePayrollDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when cutoffStart is not a valid date string', async () => {
    const data = createValidDto();
    data.cutoffStart = 'not-a-date';
    const dto = plainToInstance(CreatePayrollDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cutoffStart');
  });

  it('should fail when cutoffEnd is not a valid date string', async () => {
    const data = createValidDto();
    data.cutoffEnd = 'invalid';
    const dto = plainToInstance(CreatePayrollDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cutoffEnd');
  });

  it('should fail when dailyRecords is not an array', async () => {
    const data = createValidDto();
    (data as any).dailyRecords = 'not-an-array';
    const dto = plainToInstance(CreatePayrollDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('DailyRecordDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(DailyRecordDto, {
      date: '2025-01-01',
      isPresent: true,
      commission: 500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with optional assignedProjectId', async () => {
    const dto = plainToInstance(DailyRecordDto, {
      date: '2025-01-01',
      isPresent: true,
      assignedProjectId: 5,
      commission: 500,
      remarks: 'Test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when commission is negative', async () => {
    const dto = plainToInstance(DailyRecordDto, {
      date: '2025-01-01',
      isPresent: true,
      commission: -100,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const commissionError = errors.find((e) => e.property === 'commission');
    expect(commissionError).toBeDefined();
  });

  it('should fail when date is invalid', async () => {
    const dto = plainToInstance(DailyRecordDto, {
      date: 'bad-date',
      isPresent: true,
      commission: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('date');
  });

  it('should fail when isPresent is not a boolean', async () => {
    const dto = plainToInstance(DailyRecordDto, {
      date: '2025-01-01',
      isPresent: 'yes',
      commission: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const isPresentError = errors.find((e) => e.property === 'isPresent');
    expect(isPresentError).toBeDefined();
  });
});

describe('CompensationEntryDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CompensationEntryDto, {
      description: 'Overtime pay',
      amount: 1500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when amount is zero', async () => {
    const dto = plainToInstance(CompensationEntryDto, {
      description: 'Bonus',
      amount: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const amountError = errors.find((e) => e.property === 'amount');
    expect(amountError).toBeDefined();
  });

  it('should fail when amount is negative', async () => {
    const dto = plainToInstance(CompensationEntryDto, {
      description: 'Bonus',
      amount: -100,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const amountError = errors.find((e) => e.property === 'amount');
    expect(amountError).toBeDefined();
  });

  it('should fail when description is empty', async () => {
    const dto = plainToInstance(CompensationEntryDto, {
      description: '',
      amount: 500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });

  it('should fail when description is missing', async () => {
    const dto = plainToInstance(CompensationEntryDto, {
      amount: 500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });
});

describe('DeductionEntryDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(DeductionEntryDto, {
      description: 'Loan payment',
      amount: 2000,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when amount is zero', async () => {
    const dto = plainToInstance(DeductionEntryDto, {
      description: 'Loan',
      amount: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const amountError = errors.find((e) => e.property === 'amount');
    expect(amountError).toBeDefined();
  });

  it('should fail when amount is negative', async () => {
    const dto = plainToInstance(DeductionEntryDto, {
      description: 'Loan',
      amount: -50,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const amountError = errors.find((e) => e.property === 'amount');
    expect(amountError).toBeDefined();
  });

  it('should fail when description is empty', async () => {
    const dto = plainToInstance(DeductionEntryDto, {
      description: '',
      amount: 500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });

  it('should fail when description is missing', async () => {
    const dto = plainToInstance(DeductionEntryDto, {
      amount: 500,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });
});
