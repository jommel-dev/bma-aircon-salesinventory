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
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() createBrandDto: CreateBrandDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.brandsService.create(createBrandDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'BRAND_CREATE',
      entityType: 'brand',
      entityId: (result as { item?: { id?: number } })?.item?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created brand ${createBrandDto.name ?? ''}`.trim(),
      requestBody: createBrandDto as unknown as Record<string, unknown>,
      after: (result as { item?: Record<string, unknown> })?.item ?? null,
    });
    return result;
  }

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Get('materials')
  getMaterialBrands() {
    return this.brandsService.getMaterialBrands();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brandsService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBrandDto: UpdateBrandDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.brandsService.update(+id, updateBrandDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'BRAND_UPDATE',
      entityType: 'brand',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Updated brand #${id}`,
      requestBody: updateBrandDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.brandsService.remove(+id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'BRAND_DELETE',
      entityType: 'brand',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Deleted brand #${id}`,
    });
    return result;
  }
}
