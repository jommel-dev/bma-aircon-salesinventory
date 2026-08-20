import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductTypesService } from './product-types.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('product-types')
@UseGuards(JwtAuthGuard)
export class ProductTypesController {
  constructor(
    private readonly productTypesService: ProductTypesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() createProductTypeDto: CreateProductTypeDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.productTypesService.create(createProductTypeDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_TYPE_CREATE',
      entityType: 'product-type',
      entityId: (result as { item?: { id?: number } })?.item?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created product type ${createProductTypeDto.name ?? ''}`.trim(),
      requestBody: createProductTypeDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get()
  findAll() {
    return this.productTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productTypesService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductTypeDto: UpdateProductTypeDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.productTypesService.update(+id, updateProductTypeDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_TYPE_UPDATE',
      entityType: 'product-type',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Updated product type #${id}`,
      requestBody: updateProductTypeDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post(':id/resequence')
  async resequence(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.productTypesService.resequenceByProductTypeId(+id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_TYPE_RESEQUENCE',
      entityType: 'product-type',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Resequenced material codes for product type #${id}`,
    });
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.productTypesService.remove(+id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_TYPE_DELETE',
      entityType: 'product-type',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Deleted product type #${id}`,
    });
    return result;
  }
}
