import { Module } from '@nestjs/common';
import { BackorderService } from './backorder.service';
import { BackorderController } from './backorder.controller';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { MaterialStockModule } from 'src/inventory/material-stock/material-stock.module';

@Module({
  imports: [DatabaseModule, AuditLogModule, MaterialStockModule],
  providers: [BackorderService],
  controllers: [BackorderController],
  exports: [BackorderService],
})
export class BackorderModule {}
