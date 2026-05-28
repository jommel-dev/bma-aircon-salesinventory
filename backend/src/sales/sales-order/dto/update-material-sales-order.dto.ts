import { PartialType } from '@nestjs/mapped-types';
import { CreateMaterialSalesOrderDto } from './create-material-sales-order.dto';

export class UpdateMaterialSalesOrderDto extends PartialType(
  CreateMaterialSalesOrderDto,
) {}
