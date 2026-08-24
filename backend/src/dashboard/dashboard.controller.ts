import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { AuditActorContext } from 'src/audit-log/audit-log.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private buildAuditContext(
    request: { user?: Record<string, unknown>; ip?: string },
  ): AuditActorContext {
    const userId = Number(request.user?.sub);
    const branchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return {
      userId: Number.isFinite(userId) ? userId : undefined,
      username: String(request.user?.username ?? '').trim() || undefined,
      roleName: String(request.user?.roleName ?? request.user?.role_name ?? '').trim() || undefined,
      branchId: Number.isFinite(branchId) ? branchId : undefined,
      ipAddress: String(request.ip ?? '').trim() || undefined,
    };
  }

  private resolveBranchId(request: { user?: Record<string, unknown> }): number | undefined {
    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );
    return Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
      ? effectiveBranchId
      : undefined;
  }

  @Get('overview')
  getOverview(@Req() request: { user?: Record<string, unknown> }) {
    return this.dashboardService.getOverview(this.resolveBranchId(request));
  }

  @Get('sales-detail')
  async getSalesDetail(
    @Query('mode') mode: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('search') search: string,
  ) {
    const validModes = ['sales', 'unpaid', 'overdues', 'cheques'];
    const normalizedMode = validModes.includes(mode)
      ? (mode as 'sales' | 'unpaid' | 'overdues' | 'cheques')
      : 'sales';

    return this.dashboardService.getSalesDetail(normalizedMode, undefined, {
      page: Number(page),
      pageSize: Number(pageSize),
      search,
    });
  }

  @Get('operations-detail')
  async getOperationsDetail(
    @Query('mode') mode: string,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const validModes = ['purchase-orders', 'credit-terms', 'paid-purchases', 'stock-alerts'];
    const normalizedMode = validModes.includes(mode)
      ? (mode as 'purchase-orders' | 'credit-terms' | 'paid-purchases' | 'stock-alerts')
      : 'purchase-orders';

    return this.dashboardService.getOperationsDetail(
      normalizedMode,
      this.resolveBranchId(request),
    );
  }

  @Post('settle-sales-order')
  settleSalesOrder(
    @Body()
    body: {
      salesOrderId?: number;
      mode?: 'partial' | 'full' | 'cheque' | 'split';
      amount?: number;
      bankAmount?: number;
      chequeAmount?: number;
      bankName?: string | null;
      checkNo?: string | null;
      postDated?: string | null;
    },
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.dashboardService.settleSalesOrder(
      body,
      undefined,
      this.buildAuditContext(request),
    );
  }

  @Post('settle-purchase-order')
  settlePurchaseOrder(
    @Body()
    body: {
      purchaseOrderId?: number;
      paymentId?: string;
    },
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.dashboardService.settlePurchaseOrder(
      body,
      this.resolveBranchId(request),
      this.buildAuditContext(request),
    );
  }

  @Post('verify-receivable')
  verifyReceivable(
    @Body() body: { paymentId?: number; method?: 'cheque' | 'credit-card' },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.dashboardService.verifySalesReceivable(
      body,
      undefined,
      this.buildAuditContext(request),
    );
  }
}
