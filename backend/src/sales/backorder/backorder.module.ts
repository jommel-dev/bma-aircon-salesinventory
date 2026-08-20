import { Module } from '@nestjs/common';
import { BackorderService } from './backorder.service';
import { BackorderController } from './backorder.controller';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';

@Module({
  imports: [DatabaseModule, AuditLogModule],
  providers: [BackorderService],
  controllers: [BackorderController],
  exports: [BackorderService],
})
export class BackorderModule {}
