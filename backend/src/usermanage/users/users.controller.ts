import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Query,
  Header,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('roles')
  findRoles() {
    return this.usersService.findRoles();
  }

  @Get('permission-keys')
  findPermissionKeys() {
    return this.usersService.findPermissionKeys();
  }

  @Post('permission-keys')
  createPermissionKey(
    @Body()
    body: { key?: string; label?: string; module?: string; scope?: 'feature' | 'menu' | 'tab' | 'action' },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.createPermissionKey(body, buildAuditActorFromRequest(request));
  }

  @Get('roles/:roleId/permissions')
  findRolePermissions(@Param('roleId') roleId: string) {
    return this.usersService.findRolePermissions(+roleId);
  }

  @Put('roles/:roleId/permissions')
  setRolePermissions(
    @Param('roleId') roleId: string,
    @Body() body: { permissionKeys?: string[] },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.setRolePermissions(
      +roleId,
      body.permissionKeys ?? [],
      buildAuditActorFromRequest(request),
    );
  }

  @Post()
  create(
    @Body() createUserDto: CreateUserDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.create(createUserDto, buildAuditActorFromRequest(request));
  }

  @Get()
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    const includeDeletedFlag = ['1', 'true', 'yes', 'on'].includes(
      String(includeDeleted ?? '').trim().toLowerCase(),
    );

    return this.usersService.findAll(includeDeletedFlag);
  }

  @Get(':id/permission-overrides')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  findUserPermissionOverrides(@Param('id') id: string) {
    return this.usersService.findUserPermissionOverrides(+id);
  }

  @Put(':id/permission-overrides')
  setUserPermissionOverrides(
    @Param('id') id: string,
    @Body() body: { overrides?: Array<{ permissionKey: string; effect: 'allow' | 'deny'; reason?: string | null }> },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.setUserPermissionOverrides(
      +id,
      body.overrides ?? [],
      buildAuditActorFromRequest(request),
    );
  }

  @Get(':id/effective-permissions')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  findUserEffectivePermissions(@Param('id') id: string) {
    return this.usersService.findUserEffectivePermissions(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const actorUserId = Number(request.user?.sub ?? request.user?.id);
    return this.usersService.update(
      +id,
      updateUserDto,
      buildAuditActorFromRequest(request),
      actorUserId,
    );
  }

  @Patch(':id/change-password')
  changePassword(
    @Param('id') id: string,
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.changePassword(
      +id,
      String(body.currentPassword ?? ''),
      String(body.newPassword ?? ''),
      buildAuditActorFromRequest(request),
    );
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.remove(+id, buildAuditActorFromRequest(request));
  }

  @Patch(':id/restore')
  restore(
    @Param('id') id: string,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.usersService.restore(+id, buildAuditActorFromRequest(request));
  }
}
