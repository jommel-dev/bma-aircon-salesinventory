import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { StockRealtimeGateway } from './stock-realtime.gateway';
import { StockRealtimeService } from './stock-realtime.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [StockRealtimeGateway, StockRealtimeService],
  exports: [StockRealtimeGateway, StockRealtimeService],
})
export class StockRealtimeModule {}
