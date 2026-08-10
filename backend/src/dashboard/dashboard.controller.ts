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

  @Get('overview')
  getOverview(@Req() request: { user?: Record<string, unknown> }) {
    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.getOverview(
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
    );
  }

  @Get('sales-detail')
  async getSalesDetail(
    @Query('mode') mode: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('search') search: string,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const validModes = ['sales', 'unpaid', 'overdues', 'cheques'];
    const normalizedMode = validModes.includes(mode)
      ? (mode as 'sales' | 'unpaid' | 'overdues' | 'cheques')
      : 'sales';

    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.getSalesDetail(
      normalizedMode,
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
      {
        page: Number(page),
        pageSize: Number(pageSize),
        search,
      },
    );
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

    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.getOperationsDetail(
      normalizedMode,
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
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
    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.settleSalesOrder(
      body,
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
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
    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.settlePurchaseOrder(
      body,
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
    );
  }

  @Post('verify-receivable')
  verifyReceivable(
    @Body() body: { paymentId?: number; method?: 'cheque' | 'credit-card' },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const effectiveBranchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.dashboardService.verifySalesReceivable(
      body,
      Number.isFinite(effectiveBranchId) && effectiveBranchId > 0
        ? effectiveBranchId
        : undefined,
      this.buildAuditContext(request),
    );
  }
}
