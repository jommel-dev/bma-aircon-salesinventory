import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { BackorderService } from './backorder.service';
import { buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('backorders')
@UseGuards(JwtAuthGuard)
export class BackorderController {
  constructor(private readonly backorderService: BackorderService) {}

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
