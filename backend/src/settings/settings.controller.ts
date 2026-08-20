import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { SettingsService } from './settings.service';
import { AuditLogService, buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('public/business-profile')
  getPublicBusinessProfile() {
    return this.settingsService.getBusinessProfile();
  }

  @Get('business-profile')
  @UseGuards(JwtAuthGuard)
  getBusinessProfile() {
    return this.settingsService.getBusinessProfile();
  }

  @Put('business-profile')
  @UseGuards(JwtAuthGuard)
  async updateBusinessProfile(
    @Body() dto: UpdateBusinessProfileDto,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.settingsService.updateBusinessProfile(dto);
    const requestBody = { ...(dto as unknown as Record<string, unknown>) };
    for (const key of Object.keys(requestBody)) {
      if (
        /logo|signature|template|pdf/i.test(key) &&
        typeof requestBody[key] === 'string' &&
        String(requestBody[key]).startsWith('data:')
      ) {
        requestBody[key] = '[omitted-binary]';
      }
    }
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SETTINGS_BUSINESS_PROFILE_UPDATE',
      entityType: 'settings',
      actor: buildAuditActorFromRequest(request),
      description: 'Updated business profile settings',
      requestBody,
    });
    return result;
  }

  private async uploadAsset(
    key:
      | 'businessLogoLight'
      | 'businessLogoDark'
      | 'drTemplatePdf'
      | 'printSignaturePreparedBy'
      | 'printSignatureCheckedBy'
      | 'printSignatureApprovedBy',
    file: { originalname?: string; mimetype?: string; size?: number } | undefined,
    request: { user?: Record<string, unknown>; ip?: string },
  ) {
    const result = await this.settingsService.uploadBusinessAsset(key, file);
    await this.auditLogService.logMutationIfSuccess(result, {
      action: 'SETTINGS_BUSINESS_ASSET_UPLOAD',
      entityType: 'settings',
      actor: buildAuditActorFromRequest(request),
      description: `Uploaded business asset ${key}`,
      requestBody: {
        key,
        filename: file?.originalname ?? null,
        mimetype: file?.mimetype ?? null,
        size: file?.size ?? null,
      },
    });
    return result;
  }

  @Post('business-profile/logo/light')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadLightLogo(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('businessLogoLight', file, request);
  }

  @Post('business-profile/logo/dark')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadDarkLogo(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('businessLogoDark', file, request);
  }

  @Post('business-profile/template/dr')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadDrTemplate(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('drTemplatePdf', file, request);
  }

  @Post('business-profile/signature/prepared-by')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadPreparedBySignature(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('printSignaturePreparedBy', file, request);
  }

  @Post('business-profile/signature/checked-by')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadCheckedBySignature(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('printSignatureCheckedBy', file, request);
  }

  @Post('business-profile/signature/approved-by')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadApprovedBySignature(
    @UploadedFile() file: any,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ) {
    return this.uploadAsset('printSignatureApprovedBy', file, request);
  }
}
