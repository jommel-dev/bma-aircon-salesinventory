import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ALLOW_OWNER_KEY } from './permissions.decorator';
import { PurchaseService } from 'src/inventory/purchase/purchase.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly purchaseService: PurchaseService) {}

  private normalizePerms(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((p) => String(p ?? '').trim().toLowerCase())
      .filter(Boolean);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required: string[] = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler()) ?? [];
    const allowOwner: boolean = this.reflector.get<boolean>(ALLOW_OWNER_KEY, context.getHandler()) ?? false;

    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest() as { user?: Record<string, unknown>; params?: Record<string, unknown> };
    const user = req.user ?? {};

    const roleName = String(user?.roleName ?? user?.role_name ?? '').trim().toLowerCase();
    if (roleName === 'admin' || roleName === 'superadmin' || roleName === 'super admin') return true;

    const perms = this.normalizePerms(String(user?.permissions ?? user?.rolePermission ?? ''));

    for (const key of required) {
      const normalized = String(key ?? '').trim().toLowerCase();
      if (!normalized) continue;
      if (perms.includes(normalized)) return true;
      if (perms.some((p) => p.includes(normalized) || normalized.includes(p))) return true;
    }

    if (allowOwner) {
      const idParam = req.params?.id ?? req.params?.purchaseId ?? req.params?.purchase_id;
      const id = Number(idParam);
      if (Number.isFinite(id) && id > 0) {
        try {
          const po = await this.purchaseService.findOne(id);
          const creator = po?.item ? (po.item as any).createdBy ?? (po.item as any).created_by ?? (po.item as any).created_by : undefined;
          const userId = Number(user?.sub);
          if (Number.isFinite(userId) && Number(creator) === Number(userId)) {
            return true;
          }
        } catch {
          // ignore and fall through
        }
      }
    }

    throw new ForbiddenException('Access denied');
  }
}
