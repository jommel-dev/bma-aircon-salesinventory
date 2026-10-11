import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: Record<string, unknown> }>();
    const role = String(request.user?.roleName ?? request.user?.role_name ?? '')
      .trim()
      .toLowerCase();
    if (role === 'superadmin' || role === 'super admin') {
      return true;
    }
    throw new ForbiddenException('Only a super admin can use back orders');
  }
}
