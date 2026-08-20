import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { DatabaseBackupService, BackupMode } from './database-backup.service';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('database-backup')
export class DatabaseBackupController {
  constructor(
    private readonly backupService: DatabaseBackupService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * GET /database-backup/history
   * Returns backup history (requires auth).
   */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(): Promise<{ success: boolean; items: any[] }> {
    const history = await this.backupService.getBackupHistory();
    return { success: true, items: history };
  }

  /**
   * GET /database-backup/export?mode=full|schema_only|data_only
   * Generates and downloads a SQL backup file (requires auth).
   */
  @Get('export')
  @UseGuards(JwtAuthGuard)
  async exportBackup(
    @Query('mode') mode: string,
    @Req() request: { user?: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const validModes: BackupMode[] = ['full', 'schema_only', 'data_only'];
    const backupMode = (mode || 'full') as BackupMode;

    if (!validModes.includes(backupMode)) {
      throw new BadRequestException(`Invalid mode. Must be one of: ${validModes.join(', ')}`);
    }

    const userId = Number(request.user?.sub);

    try {
      const { sql, filename } = await this.backupService.generateBackup(
        backupMode,
        Number.isFinite(userId) ? userId : undefined,
      );

      await this.auditLogService.logMutation({
        action: 'DATABASE_BACKUP_EXPORT',
        entityType: 'database-backup',
        actor: buildAuditActorFromRequest(request),
        description: `Exported database backup (${backupMode})`,
        after: { mode: backupMode, filename, sizeBytes: Buffer.byteLength(sql, 'utf8') },
      });

      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(sql);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err?.message ?? 'Failed to generate backup',
      });
    }
  }

  /**
   * GET /database-backup/check-blank
   * Public route — checks if the database is blank (no tables).
   */
  @Get('check-blank')
  async checkBlank() {
    const isBlank = await this.backupService.isDatabaseBlank();
    return { success: true, isBlank };
  }

  /**
   * POST /database-backup/import
   * Public route — imports a .sql file into a blank database.
   * Only works if the database has no user tables.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importBackup(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please provide a .sql file.');
    }

    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (ext !== 'sql') {
      throw new BadRequestException('Only .sql files are accepted.');
    }

    const sql = file.buffer.toString('utf8');
    if (!sql.trim()) {
      throw new BadRequestException('File is empty.');
    }

    const result = await this.backupService.importSql(sql);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'DATABASE_BACKUP_IMPORT',
      entityType: 'database-backup',
      actor: buildAuditActorFromRequest(request),
      description: `Imported database backup from ${file.originalname}`,
      requestBody: {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    });
    return result;
  }

  /**
   * POST /database-backup/setup-schema
   * Public route — initializes the database schema from the built-in SQL file.
   * Only works if the database is blank. Returns immediately and runs in background.
   */
  @Post('setup-schema')
  async setupSchema(@Req() request: { user?: Record<string, unknown>; ip?: string }) {
    const isBlank = await this.backupService.isDatabaseBlank();
    if (!isBlank) {
      throw new BadRequestException('Database is not empty. Schema setup is only allowed on a blank database.');
    }

    // Start migration in background
    this.backupService.startSchemaSetup();

    await this.auditLogService.logMutation({
      action: 'DATABASE_SCHEMA_SETUP_START',
      entityType: 'database-backup',
      actor: buildAuditActorFromRequest(request),
      description: 'Started database schema initialization',
    });

    return { success: true, message: 'Schema initialization started.' };
  }

  /**
   * GET /database-backup/setup-schema/status
   * Public route — returns the current progress of schema initialization.
   */
  @Get('setup-schema/status')
  getSetupStatus() {
    return this.backupService.getSetupProgress();
  }

  /**
   * POST /database-backup/setup-admin
   * Public route — creates the first admin user.
   * Only works if no users exist in the database.
   */
  @Post('setup-admin')
  async setupAdmin(
    @Body() body: { fullName: string; username: string; password: string; email?: string },
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    if (!body.fullName?.trim() || !body.username?.trim() || !body.password?.trim()) {
      throw new BadRequestException('Full name, username, and password are required.');
    }

    if (body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }

    const result = await this.backupService.createFirstAdmin(body);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'DATABASE_FIRST_ADMIN_CREATE',
      entityType: 'user',
      actor: buildAuditActorFromRequest(request),
      description: `Created first admin user ${body.username}`,
      requestBody: {
        fullName: body.fullName,
        username: body.username,
        password: '[redacted]',
        email: body.email,
      },
    });
    return result;
  }
}
