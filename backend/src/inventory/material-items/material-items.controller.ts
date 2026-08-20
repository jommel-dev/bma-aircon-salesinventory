import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { MaterialItemsService } from './material-items.service';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('material-items')
export class MaterialItemsController {
  constructor(
    private readonly service: MaterialItemsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async addMaterial(
    @Body() dto: { code: string; name: string; unit?: string },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.addMaterial(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_ITEM_CREATE',
      entityType: 'material-item',
      entityId: (result as { id?: number } | null)?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created material item ${dto.code ?? ''}`.trim(),
      requestBody: dto,
    });
    return result;
  }

  @Get()
  async listMaterials() {
    return this.service.listMaterials();
  }

  @Get(':id')
  async getMaterial(@Param('id') id: string) {
    return this.service.getMaterial(Number(id));
  }

  @Put(':id')
  async updateMaterial(
    @Param('id') id: string,
    @Body() dto: { code?: string; name?: string; unit?: string },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.updateMaterial(Number(id), dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_ITEM_UPDATE',
      entityType: 'material-item',
      entityId: Number(id),
      actor: buildAuditActorFromRequest(request),
      description: `Updated material item #${id}`,
      requestBody: dto,
    });
    return result;
  }

  @Delete(':id')
  async deleteMaterial(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.service.deleteMaterial(Number(id));
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'MATERIAL_ITEM_DELETE',
      entityType: 'material-item',
      entityId: Number(id),
      actor: buildAuditActorFromRequest(request),
      description: `Deleted material item #${id}`,
    });
    return result;
  }
}
