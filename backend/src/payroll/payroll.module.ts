import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { PurchaseModule } from 'src/inventory/purchase/purchase.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [DatabaseModule, PurchaseModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
