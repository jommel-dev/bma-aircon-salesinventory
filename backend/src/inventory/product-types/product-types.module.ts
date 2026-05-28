import { Module } from '@nestjs/common';
import { ProductTypesService } from './product-types.service';
import { ProductTypesController } from './product-types.controller';
import { DatabaseModule } from 'src/database/database.module';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductTypesController],
  providers: [ProductTypesService, JwtAuthGuard],
})
export class ProductTypesModule {}
