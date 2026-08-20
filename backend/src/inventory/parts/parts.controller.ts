import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PartsService } from './parts.service';
import { CreatePartsDto, UpdatePartsDto } from './dto/create-parts.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('parts')
@UseGuards(JwtAuthGuard)
export class PartsController {
  constructor(
    private readonly partsService: PartsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() createPartsDto: CreatePartsDto,
    @Req() req: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(req.user?.sub ?? req.user?.id) || 1;
    const result = await this.partsService.create(createPartsDto, userId);
    await this.auditLogService.logMutation({
      action: 'PART_CREATE',
      entityType: 'part',
      entityId: result?.id,
      actor: buildAuditActorFromRequest(req),
      description: `Created part ${result?.partsName ?? result?.id}`,
      requestBody: createPartsDto as unknown as Record<string, unknown>,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('brandType') brandType?: string,
  ) {
    return this.partsService.findAll(search, brandType);
  }

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('brandType') brandType?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.partsService.searchParts(query, brandType, brandId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.partsService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePartsDto: UpdatePartsDto,
    @Req() req: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.partsService.update(+id, updatePartsDto);
    await this.auditLogService.logMutation({
      action: 'PART_UPDATE',
      entityType: 'part',
      entityId: +id,
      actor: buildAuditActorFromRequest(req),
      description: `Updated part #${id}`,
      requestBody: updatePartsDto as unknown as Record<string, unknown>,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() req: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(req.user?.sub ?? req.user?.id) || 1;
    await this.partsService.remove(+id, userId);
    await this.auditLogService.logMutation({
      action: 'PART_DELETE',
      entityType: 'part',
      entityId: +id,
      actor: buildAuditActorFromRequest(req),
      description: `Deleted part #${id}`,
    });
    return { success: true };
  }
}
