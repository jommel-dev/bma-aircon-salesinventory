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
import { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

type AuthenticatedRequest = Request & {
  user?: Record<string, unknown>;
};

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() createProductDto: CreateProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = Number(request.user?.sub);
    const result = await this.productsService.create(createProductDto, userId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_CREATE',
      entityType: 'product',
      entityId: (result as { item?: { id?: number }; id?: number })?.item?.id
        ?? (result as { id?: number })?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created product ${createProductDto.productName ?? ''}`.trim(),
      requestBody: createProductDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.productsService.update(+id, updateProductDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_UPDATE',
      entityType: 'product',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Updated product #${id}`,
      requestBody: updateProductDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.productsService.remove(+id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_DELETE',
      entityType: 'product',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Deleted product #${id}`,
    });
    return result;
  }

  @Post('bulk-upload')
  async bulkUpload(
    @Body() payload: { rows: Array<Record<string, unknown>> },
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = Number(request.user?.sub);
    const result = await this.productsService.bulkUpload(payload.rows ?? [], userId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'PRODUCT_BULK_UPLOAD',
      entityType: 'product',
      actor: buildAuditActorFromRequest(request),
      description: 'Bulk uploaded products',
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }
}
