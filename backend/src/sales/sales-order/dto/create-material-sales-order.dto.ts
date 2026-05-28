import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MaterialSalesOrderCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact_person?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact_number?: string;
}

export class MaterialSalesOrderProductItemDto {
  @IsOptional()
  @IsInt()
  materialId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  rate: number;

  @IsInt()
  @Min(1)
  @Max(99999)
  qty: number;

  @IsBoolean()
  isNonInventory: boolean;
}

export class MaterialSalesOrderPaymentDetailDto {
  @IsString()
  @IsIn(['Cash', 'Bank Transfer', 'Terms', 'Terms with DP', 'Cheque', 'Credit Card', 'Installment'])
  method: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  termsDueDate?: string | null;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  paymentDate?: string | null;

  @IsOptional()
  @IsString()
  issuedBy?: string;

  @IsOptional()
  @IsString()
  ccCharge?: string;

  @IsOptional()
  @IsString()
  checkNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  postDated?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  downPayment?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateMaterialSalesOrderDto {
  @IsOptional()
  @IsString()
  customer_id?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaterialSalesOrderCustomerDto)
  customer?: MaterialSalesOrderCustomerDto;

  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  salesType?: string;

  @IsEnum(['draft', 'pending', 'complete', 'voided'], {
    message: 'status must be draft, pending, complete, or voided',
  })
  status: 'draft' | 'pending' | 'complete' | 'voided';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialSalesOrderProductItemDto)
  productItems?: MaterialSalesOrderProductItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialSalesOrderPaymentDetailDto)
  paymentDetails?: MaterialSalesOrderPaymentDetailDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
