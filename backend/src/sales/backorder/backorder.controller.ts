import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { BackorderService } from './backorder.service';
import { buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('backorders')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class BackorderController {
  constructor(private readonly backorderService: BackorderService) {}

  @Get('recording')
  async getRecording() {
    return { enabled: await this.backorderService.isRecordingEnabled() };
  }

  @Post('manual-fulfill')
  async manualFulfill(
    @Body() body: { ids?: number[]; remarks?: string; password?: string },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.sub);
    const result = await this.backorderService.manualFulfillBackorders({
      ids: Array.isArray(body?.ids) ? body.ids : [],
      remarks: String(body?.remarks ?? ''),
      password: String(body?.password ?? ''),
      userId: Number.isFinite(userId) ? userId : undefined,
      auditActor: buildAuditActorFromRequest(req),
    });
    return {
      success: true,
      message: `${result.fulfilledCount} back order(s) marked fulfilled`,
      ...result,
    };
  }

  @Patch('recording')
  async setRecording(
    @Body() body: { enabled?: boolean },
    @Req() req: any,
  ) {
    const enabled = body?.enabled === true;
    const result = await this.backorderService.setRecordingEnabled(enabled);
    return {
      success: true,
      enabled: result.enabled,
      message: result.enabled
        ? 'Back order recording is on'
        : 'Back order recording is off. Sales orders still save.',
      updatedBy: Number.isFinite(Number(req.user?.sub)) ? Number(req.user?.sub) : null,
    };
  }

  /**
   * Paginated backorder list. Defaults to open shortages.
   */
  @Get()
  async listBackorders(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.backorderService.listBackorders({
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get all backorders for a specific sales order
   */
  @Get('sales-order/:salesOrderId')
  async getBackordersForSalesOrder(@Param('salesOrderId') salesOrderId: string) {
    return await this.backorderService.getBackordersForSalesOrder(parseInt(salesOrderId, 10));
  }

  /**
   * Get all pending backorders with pagination
   */
  @Get('pending')
  async getPendingBackorders(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const pageLimit = Math.min(parseInt(limit ?? '50', 10), 100);
    const pageOffset = Math.max(parseInt(offset ?? '0', 10), 0);
    return await this.backorderService.getPendingBackorders(pageLimit, pageOffset);
  }

  /**
   * Fulfill a backorder (partially or fully)
   */
  @Patch(':backorderId/fulfill')
  async fulfillBackorder(
    @Param('backorderId') backorderId: string,
    @Body() body: { fulfillQty: number },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.sub);
    const result = await this.backorderService.fulfillBackorder(
      parseInt(backorderId, 10),
      body.fulfillQty,
      Number.isFinite(userId) ? userId : undefined,
      buildAuditActorFromRequest(req),
    );

    return {
      success: true,
      message: 'Backorder fulfilled successfully',
      backorder: result,
    };
  }

  /**
   * Cancel a backorder
   */
  @Patch(':backorderId/cancel')
  async cancelBackorder(
    @Param('backorderId') backorderId: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.sub);
    const result = await this.backorderService.cancelBackorder(
      parseInt(backorderId, 10),
      body.reason,
      Number.isFinite(userId) ? userId : undefined,
      buildAuditActorFromRequest(req),
    );

    return {
      success: true,
      message: 'Backorder cancelled successfully',
      backorder: result,
    };
  }
}
