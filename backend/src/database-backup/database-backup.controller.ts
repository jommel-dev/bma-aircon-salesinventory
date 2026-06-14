import {
  Controller,
  Get,
  Post,
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

@Controller('database-backup')
export class DatabaseBackupController {
  constructor(private readonly backupService: DatabaseBackupService) {}

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
    const { sql, filename } = await this.backupService.generateBackup(
      backupMode,
      Number.isFinite(userId) ? userId : undefined,
    );

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
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
  async importBackup(@UploadedFile() file: Express.Multer.File) {
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
    return result;
  }
}
