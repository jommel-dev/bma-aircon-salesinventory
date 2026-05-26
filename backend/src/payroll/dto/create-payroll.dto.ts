import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompensationEntryDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount: number;
}

export class DeductionEntryDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount: number;
}

export class DailyRecordDto {
  @IsDateString()
  date: string;

  @IsBoolean()
  isPresent: boolean;

  @IsOptional()
  @IsString()
  leaveType?: string;

  @IsOptional()
  @IsBoolean()
  leavePaid?: boolean;

  @IsOptional()
  @IsNumber()
  assignedProjectId?: number | null;

  @IsNumber()
  @Min(0)
  commission: number;

  @IsNumber()
  @Min(0)
  adjustedRate: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overtime?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreatePayrollDto {
  @IsDateString()
  cutoffStart: string;

  @IsDateString()
  cutoffEnd: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyRecordDto)
  dailyRecords: DailyRecordDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompensationEntryDto)
  additionalCompensation: CompensationEntryDto[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeductionEntryDto)
  additionalDeductions: DeductionEntryDto[] = [];
}
