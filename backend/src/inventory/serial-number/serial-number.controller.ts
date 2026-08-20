import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerialNumberService } from './serial-number.service';
import { CreateSerialNumberDto } from './dto/create-serial-number.dto';
import { UpdateSerialNumberDto } from './dto/update-serial-number.dto';
import { ScanSalesOrderDto } from './dto/scan-sales-order.dto';
import { ScanSalesOrderBatchDto } from './dto/scan-sales-order-batch.dto';
import { ScanPurchaseOrderDto } from './dto/scan-purchase-order.dto';
import { ScanPurchaseOrderBatchDto } from './dto/scan-purchase-order-batch.dto';
import { RemovePurchaseOrderSerialDto } from './dto/remove-purchase-order-serial.dto';
import { RemoveSalesOrderSerialDto } from './dto/remove-sales-order-serial.dto';
import { AdjustPurchaseUnitTypesDto } from './dto/adjust-purchase-unit-types.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('serial-number')
@UseGuards(JwtAuthGuard)
export class SerialNumberController {
  constructor(
    private readonly serialNumberService: SerialNumberService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private resolveBranchId(
    request: { user?: Record<string, unknown> },
    branchIdQuery?: string,
  ): number | undefined {
    const branchIdFromToken = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );
    const normalizedTokenBranchId =
      Number.isFinite(branchIdFromToken) && branchIdFromToken > 0
        ? branchIdFromToken
        : undefined;

    return normalizedTokenBranchId;
  }

  @Post('insert-bulk')
  @UseGuards(JwtAuthGuard)
  async insertBulk(
    @Body() body: { serials: Array<{ serialNumber: string; unitType?: string; status?: string; productId?: number; capacityId?: number }> },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const role = String(request.user?.roleName ?? '').trim().toLowerCase();
    if (role !== 'superadmin' && role !== 'super admin' && role !== 'admin') {
      return { success: false, message: 'Access denied. Admin or Super Admin role required.' };
    }
    const result = await this.serialNumberService.insertBulk(body.serials);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_INSERT_BULK',
      entityType: 'serial-number',
      actor: buildAuditActorFromRequest(request),
      description: `Bulk inserted serial numbers (${body.serials?.length ?? 0} requested)`,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('csv-preview')
  csvPreview(
    @Body() body: { rows: Array<{ serialNumber: string; unitType?: string; status: string }> },
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const role = String(request.user?.roleName ?? '').trim().toLowerCase();
    if (role !== 'superadmin' && role !== 'super admin' && role !== 'admin') {
      return { success: false, message: 'Access denied. Admin or Super Admin role required.' };
    }
    return this.serialNumberService.csvPreview(body.rows);
  }

  @Post('bulk-update-status')
  async bulkUpdateStatus(
    @Body() body: { serialNumbers: string[]; status: string },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const role = String(request.user?.roleName ?? '').trim().toLowerCase();
    if (role !== 'superadmin' && role !== 'super admin' && role !== 'admin') {
      return { success: false, message: 'Access denied. Admin or Super Admin role required.' };
    }
    const userId = Number(request.user?.sub);
    const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
    const result = await this.serialNumberService.bulkUpdateStatus(body.serialNumbers, body.status, normalizedUserId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_BULK_UPDATE_STATUS',
      entityType: 'serial-number',
      actor: buildAuditActorFromRequest(request),
      description: `Bulk updated ${body.serialNumbers?.length ?? 0} serial number(s) to ${body.status}`,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('scan-sales-order')
  async scanSalesOrder(
    @Body() dto: ScanSalesOrderDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
    const result = await this.serialNumberService.scanSalesOrder(dto, normalizedUserId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_SCAN_SALES_ORDER',
      entityType: 'serial-number',
      entityId: dto.salesId,
      actor: buildAuditActorFromRequest(request),
      description: `Scanned serial ${dto.serialNumber} onto sales order #${dto.salesId}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('scan-sales-order/batch')
  async scanSalesOrderBatch(
    @Body() dto: ScanSalesOrderBatchDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
    const result = await this.serialNumberService.scanSalesOrderBatch(dto, normalizedUserId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_SCAN_SALES_ORDER_BATCH',
      entityType: 'serial-number',
      actor: buildAuditActorFromRequest(request),
      description: `Batch scanned ${dto.items?.length ?? 0} serial number(s) onto sales orders`,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('scan-purchase-order')
  async scanPurchaseOrder(
    @Body() dto: ScanPurchaseOrderDto,
    @Query('branchId') branchIdQuery: string | undefined,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
    const branchId = this.resolveBranchId(request, branchIdQuery);
    const result = await this.serialNumberService.scanPurchaseOrder(dto, normalizedUserId, branchId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_SCAN_PURCHASE_ORDER',
      entityType: 'serial-number',
      entityId: dto.purchaseId,
      actor: buildAuditActorFromRequest(request),
      description: `Scanned serial ${dto.serialNumber} onto purchase order #${dto.purchaseId}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('scan-purchase-order/batch')
  async scanPurchaseOrderBatch(
    @Body() dto: ScanPurchaseOrderBatchDto,
    @Query('branchId') branchIdQuery: string | undefined,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
    const branchId = this.resolveBranchId(request, branchIdQuery);
    const result = await this.serialNumberService.scanPurchaseOrderBatch(dto, normalizedUserId, branchId);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_SCAN_PURCHASE_ORDER_BATCH',
      entityType: 'serial-number',
      actor: buildAuditActorFromRequest(request),
      description: `Batch scanned ${dto.items?.length ?? 0} serial number(s) onto purchase orders`,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('remove-purchase-order')
  async removePurchaseOrderSerial(
    @Body() dto: RemovePurchaseOrderSerialDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.serialNumberService.removePurchaseOrderSerial(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_REMOVE_PURCHASE_ORDER',
      entityType: 'serial-number',
      entityId: dto.purchaseId,
      actor: buildAuditActorFromRequest(request),
      description: `Removed serial ${dto.serialNumber} from purchase order #${dto.purchaseId}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('remove-sales-order')
  async removeSalesOrderSerial(
    @Body() dto: RemoveSalesOrderSerialDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.serialNumberService.removeSalesOrderSerial(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_REMOVE_SALES_ORDER',
      entityType: 'serial-number',
      entityId: dto.salesId,
      actor: buildAuditActorFromRequest(request),
      description: `Removed serial ${dto.serialNumber} from sales order #${dto.salesId}`,
      requestBody: dto as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('normalize-unit-types')
  async normalizeStoredUnitTypes(
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.serialNumberService.normalizeStoredUnitTypes();
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_NORMALIZE_UNIT_TYPES',
      entityType: 'serial-number',
      actor: buildAuditActorFromRequest(request),
      description: 'Normalized stored serial unit types',
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post('adjust-purchase-unit-types')
  async adjustPurchaseUnitTypes(
    @Body() dto: AdjustPurchaseUnitTypesDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.serialNumberService.adjustPurchaseUnitTypes(dto);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SERIAL_ADJUST_PURCHASE_UNIT_TYPES',
      entityType: 'serial-number',
      entityId: dto.purchaseId,
      actor: buildAuditActorFromRequest(request),
      description: 'Adjusted purchase serial unit types',
      requestBody: dto as unknown as Record<string, unknown>,
      after: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Post()
  create(@Body() createSerialNumberDto: CreateSerialNumberDto) {
    return this.serialNumberService.create(createSerialNumberDto);
  }

  @Get()
  findAll() {
    return this.serialNumberService.findAll();
  }

  @Get('capacity-stock-summary')
  getCapacityStockSummary(
    @Query('productId') productId: string,
    @Query('capacityId') capacityId: string,
    @Query('branchId') branchIdQuery: string | undefined,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const branchId = this.resolveBranchId(request, branchIdQuery);

    return this.serialNumberService.getCapacityStockSummary(
      productId,
      capacityId,
      branchId,
    );
  }

  @Get('list-by-scope')
  getSerialNumbersByScope(
    @Query('productId') productId: string,
    @Query('capacityId') capacityId: string,
    @Query('branchId') branchIdQuery: string | undefined,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const branchId = this.resolveBranchId(request, branchIdQuery);
    return this.serialNumberService.getSerialNumbersByScope(
      productId,
      capacityId,
      branchId,
    );
  }

  @Get('reports/land-costing')
  getLandCostingReport(
    @Query('months') monthsInput: string | undefined,
    @Query('dateFrom') dateFromInput: string | undefined,
    @Query('dateTo') dateToInput: string | undefined,
    @Query('productId') productId: string | undefined,
    @Query('capacityId') capacityId: string | undefined,
    @Query('branchId') branchIdQuery: string | undefined,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const branchId = this.resolveBranchId(request, branchIdQuery);
    return this.serialNumberService.getLandCostingReport({
      monthsInput,
      dateFromInput,
      dateToInput,
      productIdInput: productId,
      capacityIdInput: capacityId,
      branchId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serialNumberService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSerialNumberDto: UpdateSerialNumberDto) {
    return this.serialNumberService.update(+id, updateSerialNumberDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serialNumberService.remove(+id);
  }
}
