import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SearchController],
  providers: [SearchService, JwtAuthGuard],
})
export class SearchModule {}
