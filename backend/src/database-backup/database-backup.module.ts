import { Module } from '@nestjs/common';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupController } from './database-backup.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DatabaseBackupController],
  providers: [DatabaseBackupService],
})
export class DatabaseBackupModule {}
