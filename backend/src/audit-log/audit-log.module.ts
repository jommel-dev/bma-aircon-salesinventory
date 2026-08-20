import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { DatabaseModule } from 'src/database/database.module';
import { AuditLogController } from './audit-log.controller';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, JwtAuthGuard],
  exports: [AuditLogService],
})
export class AuditLogModule {}
