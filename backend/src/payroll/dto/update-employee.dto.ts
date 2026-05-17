import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  position?: string;

  @IsNumber()
  @IsOptional()
  projectId?: number | null;

  @IsNumber()
  @IsOptional()
  baseSalary?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  pagIbig?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  philhealth?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  sss?: number;

  @IsString()
  @IsOptional()
  contactNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @IsIn(['Driver', 'Installer', 'Helper', 'Office', 'Project Assigned'])
  department?: string;
}
