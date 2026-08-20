import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { MaterialStockService } from './material-stock.service';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('material-stock')
export class MaterialStockController {
  constructor(
    private readonly service: MaterialStockService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('balance/:materialId')
  async getBalance(@Param('materialId') materialId: string) {
    return this.service.getBalance(Number(materialId));
  }

  @Get('movements')
  async listMovements(
    @Query('materialId') materialId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listMovements({
      materialId: materialId ? Number(materialId) : undefined,
      limit: limit ? Number(limit) : 100,
    });
  }

  @Post('movement')
  async createMovement(
    @Body()
    dto: {
      materialId: number;
      movementType: 'IN' | 'OUT' | 'RESERVE' | 'RELEASE' | 'RETURN' | 'ADJUST';
      qty: number;
      sourceType: 'PO' | 'SO' | 'MANUAL';
      sourceId: number;
      sourceLineKey: string;
      statusSnapshot?: string;
      remarks?: string;
      createdBy?: number;
    },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.recordMovement(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_STOCK_MOVEMENT',
      entityType: 'material-stock',
      entityId: dto.materialId,
      actor: buildAuditActorFromRequest(request),
      description: `Recorded ${dto.movementType} movement of ${dto.qty} for material #${dto.materialId}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }
}
