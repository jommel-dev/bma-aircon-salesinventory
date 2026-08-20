import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { PurchaseModule } from 'src/inventory/purchase/purchase.module';

@Global()
@Module({
  imports: [PurchaseModule],
  providers: [JwtAuthGuard, PermissionGuard],
  exports: [JwtAuthGuard, PermissionGuard],
})
export class AuthGuardsModule {}
