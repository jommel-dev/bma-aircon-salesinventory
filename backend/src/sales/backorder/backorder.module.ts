import { Module } from '@nestjs/common';
import { BackorderService } from './backorder.service';
import { BackorderController } from './backorder.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [BackorderService],
  controllers: [BackorderController],
  exports: [BackorderService],
})
export class BackorderModule {}
