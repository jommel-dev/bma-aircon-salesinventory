import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsNumber()
  @IsOptional()
  projectId?: number;

  @IsNumber()
  @IsNotEmpty()
  baseSalary: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  pagIbig?: number = 0;

  @IsNumber()
  @IsOptional()
  @Min(0)
  philhealth?: number = 0;

  @IsNumber()
  @IsOptional()
  @Min(0)
  sss?: number = 0;

  @IsString()
  @IsOptional()
  contactNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Driver', 'Installer', 'Helper', 'Office', 'Project Assigned'])
  department: string;
}
