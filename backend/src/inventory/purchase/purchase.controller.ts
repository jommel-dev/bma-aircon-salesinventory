import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Req,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { Permissions } from 'src/auth/permissions.decorator';
import { ListPurchaseQueryDto } from './dto/list-purchase-query.dto';
import { DeletePurchaseWithAuthDto } from './dto/delete-purchase-with-auth.dto';
import { AuditActorContext } from 'src/audit-log/audit-log.service';

@Controller('purchase')
@UseGuards(JwtAuthGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  private userHasAnyPermission(request: { user?: Record<string, unknown> }, keys: string[]): boolean {
    const roleName = String(request.user?.roleName ?? request.user?.role_name ?? '').trim().toLowerCase();
    if (roleName === 'admin' || roleName === 'superadmin' || roleName === 'super admin') return true;

    const permsRaw = String(request.user?.permissions ?? request.user?.rolePermission ?? '').trim();
    if (!permsRaw) return false;

    const perms = permsRaw.split(',').map(p => String(p ?? '').trim().toLowerCase()).filter(Boolean);
    for (const key of keys) {
      const normalized = String(key ?? '').trim().toLowerCase();
      if (!normalized) continue;
      if (perms.includes(normalized)) return true;
      // allow substring match for flexible keys
      if (perms.some(p => p.includes(normalized) || normalized.includes(p))) return true;
    }

    return false;
  }

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

  private withEffectiveBranchScope(
    query: ListPurchaseQueryDto,
    request: { user?: Record<string, unknown> },
  ): ListPurchaseQueryDto {
    const branchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return {
      ...query,
      branchId: Number.isFinite(branchId) && branchId > 0 ? branchId : undefined,
    };
  }

  @Post()
  async create(
    @Body() createPurchaseDto: CreatePurchaseDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    try {
      const userId = Number(request.user?.sub);
      const normalizedUserId = Number.isFinite(userId) ? userId : undefined;
      const branchId = Number(
        request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
      );
      const normalizedBranchId =
        Number.isFinite(branchId) && branchId > 0 ? branchId : undefined;

      return await this.purchaseService.create(
        createPurchaseDto,
        normalizedUserId,
        normalizedBranchId,
        this.buildAuditContext(request),
      );
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to create purchase request',
      };
    }
  }

  @Get()
  findAll(
    @Query() query: ListPurchaseQueryDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.purchaseService.findAll(this.withEffectiveBranchScope(query, request));
  }

  @Get('my')
  getMyRequests(
    @Query() query: ListPurchaseQueryDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const userId = Number(request.user?.sub);
    if (Number.isFinite(userId)) {
      query.createdBy = userId;
    }

    return this.purchaseService.getMyRequests(this.withEffectiveBranchScope(query, request));
  }

  @Get('deliveries')
  getDeliveries(
    @Query() query: ListPurchaseQueryDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.purchaseService.getDeliveries(this.withEffectiveBranchScope(query, request));
  }

  @Get('approvals')
  @UseGuards(PermissionGuard)
  @Permissions(['purchase-order.tab.approvals', 'purchase-order.approvals', 'purchase-order.approve'])
  getApprovals(
    @Query() query: ListPurchaseQueryDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.purchaseService.getApprovals(this.withEffectiveBranchScope(query, request));
  }

  @Get('master-data')
  getMasterData(
    @Query() query: ListPurchaseQueryDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    return this.purchaseService.getMasterData(this.withEffectiveBranchScope(query, request));
  }

  @Get('materials/search')
  searchMaterials(
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 200;
    return this.purchaseService.searchMaterials(
      query,
      Number.isFinite(parsedLimit) ? parsedLimit : 200,
    );
  }

  @Get('vendors/list')
  getVendors(@Query('search') search?: string) {
    return this.purchaseService.getVendors(search);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('includeInstalled') includeInstalled?: string,
    @Query('preferPoLinkedSerials') preferPoLinkedSerials?: string,
  ) {
    const shouldIncludeInstalled =
      String(includeInstalled ?? '').trim().toLowerCase() === 'true';
    const shouldPreferPoLinkedSerials =
      String(preferPoLinkedSerials ?? '').trim().toLowerCase() === 'true';
    return this.purchaseService.findOne(+id, {
      includeInstalled: shouldIncludeInstalled,
      preferPoLinkedSerials: shouldPreferPoLinkedSerials,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePurchaseDto: UpdatePurchaseDto,
    @Req() request: {
      user?: Record<string, unknown>;
      body?: unknown;
      headers?: Record<string, unknown>;
    },
  ) {
    let payload: UpdatePurchaseDto | undefined = updatePurchaseDto;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      const fallbackBody = request.body;

      if (typeof fallbackBody === 'string') {
        try {
          payload = JSON.parse(fallbackBody) as UpdatePurchaseDto;
        } catch {
          payload = undefined;
        }
      } else if (fallbackBody && typeof fallbackBody === 'object') {
        payload = fallbackBody as UpdatePurchaseDto;
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      const contentType = String(request.headers?.['content-type'] ?? 'unknown');
      return {
        success: false,
        message: `Invalid request body. Send a JSON object with Content-Type application/json (received: ${contentType}).`,
      };
    }

    const userId = Number(request.user?.sub);
    const branchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.purchaseService.update(
      +id,
      payload,
      Number.isFinite(userId) ? userId : undefined,
      Number.isFinite(branchId) ? branchId : undefined,
      this.buildAuditContext(request),
    );
  }

  @Patch(':id/revert-in-progress')
  @UseGuards(PermissionGuard)
  @Permissions(['purchase-order.button.revert-in-progress', 'purchase-order.revert', 'purchase_order.canUpdate'])
  async revertInProgress(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const result = await this.purchaseService.revertInProgress(
      +id,
      Number.isFinite(userId) ? userId : undefined,
      this.buildAuditContext(request),
    );
    if (!result.success) {
      if (result.message?.toLowerCase().includes('not found')) {
        throw new NotFoundException(result.message);
      }
      throw new BadRequestException(result.message);
    }
    return result;
  }

  @Patch(':id/revert-deliveries')
  @UseGuards(PermissionGuard)
  @Permissions(['purchase-order.button.revert-deliveries', 'purchase-order.revert', 'purchase_order.canUpdate'])
  revertDeliveries(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    return this.purchaseService.revertToDeliveries(
      +id,
      Number.isFinite(userId) ? userId : undefined,
      this.buildAuditContext(request),
    );
  }

  @Patch(':id/verify-receive')
  @UseGuards(PermissionGuard)
  @Permissions(['purchase-order.button.verify-receive', 'purchase-order.verify', 'purchase_order.canUpdate'])
  async verifyAndReceive(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const result = await this.purchaseService.verifyAndReceive(
      +id,
      Number.isFinite(userId) ? userId : undefined,
      this.buildAuditContext(request),
    );
    if (!result.success) {
      if (result.message?.toLowerCase().includes('not found')) {
        throw new NotFoundException(result.message);
      }
      throw new BadRequestException(result.message);
    }
    return result;
  }

  @UseGuards(PermissionGuard)
  @Patch(':id/receive-request')
  @Permissions(['purchase-order.button.receive-request', 'purchase-order.button.complete', 'purchase-order.complete'], { allowOwner: true })
  async receiveRequest(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const result = await this.purchaseService.completeRequest(
      +id,
      Number.isFinite(userId) ? userId : undefined,
      this.buildAuditContext(request),
    );
    if (!result.success) {
      if (result.message?.toLowerCase().includes('not found')) {
        throw new NotFoundException(result.message);
      }
      throw new BadRequestException(result.message);
    }
    return result;
  }

  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const userId = Number(request.user?.sub);
    const allowed = this.userHasAnyPermission(request, [
      'purchase-order.button.approve',
      'purchase-order.approve',
      'purchase_order.canUpdate',
      'purchase-order.tab.approvals',
    ]);
    if (!allowed) throw new ForbiddenException('You do not have permission to approve purchase orders');

    const result = await this.purchaseService.approve(
      +id,
      Number.isFinite(userId) ? userId : undefined,
      this.buildAuditContext(request),
    );
    if (!result.success) {
      if (result.message?.toLowerCase().includes('not found')) {
        throw new NotFoundException(result.message);
      }
      throw new BadRequestException(result.message);
    }
    return result;
  }

  @Patch(':id/cancel')
  cancelPurchase(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const userId = Number(request.user?.sub);
    const username = String(request.user?.username ?? '').trim();
    const roleName = String(
      request.user?.roleName ?? request.user?.role_name ?? '',
    ).trim();
    const branchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    // only allow cancel if user has cancel permission or is creator
    // use PermissionGuard to enforce if configured globally; fallback simple check
    return this.purchaseService.cancelPurchase(+id, {
      userId: Number.isFinite(userId) ? userId : undefined,
      username: username || undefined,
      roleName: roleName || undefined,
      branchId: Number.isFinite(branchId) ? branchId : undefined,
    });
  }

  @Post(':id/delete-authorized')
  removeWithAuth(
    @Param('id') id: string,
    @Body() body: DeletePurchaseWithAuthDto,
    @Req() request: { user?: Record<string, unknown> },
  ) {
    const userId = Number(request.user?.sub);
    const roleName = String(
      request.user?.roleName ?? request.user?.role_name ?? '',
    ).trim();
    const username = String(request.user?.username ?? '').trim();
    const branchId = Number(
      request.user?.branchId ?? request.user?.branch_id ?? request.user?.branch,
    );

    return this.purchaseService.deletePurchaseWithAuth(
      +id,
      Number.isFinite(userId) ? userId : 0,
      roleName,
      username,
      String(body?.password ?? ''),
      String(body?.authUsername ?? '').trim() || undefined,
      Number.isFinite(branchId) ? branchId : undefined,
    );
  }
}
