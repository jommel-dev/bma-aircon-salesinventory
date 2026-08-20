import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { MaterialTransactionsService } from './material-transactions.service';
import { CreateMaterialTransactionDto } from './dto/create-material-transaction.dto';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('inventory/material-transactions')
export class MaterialTransactionsController {
  constructor(
    private readonly service: MaterialTransactionsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateMaterialTransactionDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.create(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_TRANSACTION_CREATE',
      entityType: 'material-transaction',
      entityId: (result as { id?: number } | null)?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created material transaction for material #${dto.material_id}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get('purchase/:purchaseId')
  findByPurchaseId(@Param('purchaseId', ParseIntPipe) purchaseId: number) {
    return this.service.findByPurchaseId(purchaseId);
  }

  @Get('sales/:salesId')
  findBySalesId(@Param('salesId', ParseIntPipe) salesId: number) {
    return this.service.findBySalesId(salesId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.remove(id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_TRANSACTION_DELETE',
      entityType: 'material-transaction',
      entityId: id,
      actor: buildAuditActorFromRequest(request),
      description: `Deleted material transaction #${id}`,
    });
    return result;
  }
}
