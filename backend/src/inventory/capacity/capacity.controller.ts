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
import { CapacityService } from './capacity.service';
import { CreateCapacityDto } from './dto/create-capacity.dto';
import { UpdateCapacityDto } from './dto/update-capacity.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('capacity')
@UseGuards(JwtAuthGuard)
export class CapacityController {
  constructor(
    private readonly capacityService: CapacityService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() createCapacityDto: CreateCapacityDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.capacityService.create(createCapacityDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'CAPACITY_CREATE',
      entityType: 'capacity',
      entityId: (result as { item?: { id?: number } })?.item?.id,
      actor: buildAuditActorFromRequest(request),
      description: `Created capacity ${createCapacityDto.capacity ?? ''}`.trim(),
      requestBody: createCapacityDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get()
  findAll() {
    return this.capacityService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.capacityService.findOne(+id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCapacityDto: UpdateCapacityDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.capacityService.update(+id, updateCapacityDto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'CAPACITY_UPDATE',
      entityType: 'capacity',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Updated capacity #${id}`,
      requestBody: updateCapacityDto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.capacityService.remove(+id);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'CAPACITY_DELETE',
      entityType: 'capacity',
      entityId: +id,
      actor: buildAuditActorFromRequest(request),
      description: `Deleted capacity #${id}`,
    });
    return result;
  }
}
