import { IsOptional, IsEnum, IsNumberString, IsString } from 'class-validator';

export type SalesOrderStatus = 'draft' | 'pending' | 'complete' | 'voided';

export class ListMaterialSalesOrderQueryDto {
  @IsOptional()
  @IsEnum(['draft', 'pending', 'complete', 'voided'], {
    message: 'status must be one of: draft, pending, complete, voided',
  })
  status?: SalesOrderStatus;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
