import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialStockService } from './material-stock.service';
import { MaterialStockController } from './material-stock.controller';
import { StockRealtimeModule } from 'src/realtime/stock-realtime.module';

@Module({
  imports: [DatabaseModule, StockRealtimeModule],
  providers: [MaterialStockService],
  controllers: [MaterialStockController],
  exports: [MaterialStockService],
})
export class MaterialStockModule {}