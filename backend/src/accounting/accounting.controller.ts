import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import type {
  AccountingReportPrintSettingsPayload,
  CreateChequeVoucherPayload,
  CreateGeneralJournalPayload,
  UpdateGeneralJournalPayload,
  UpdateChequeVoucherPayload,
  UpsertAccountTitlePayload,
} from './accounting.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { buildAuditActorFromRequest } from 'src/audit-log/audit-log.service';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  private toPositiveNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }

  @Get('account-titles')
  async getAccountTitles(): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.getAccountTitles();
    return {
      success: true,
      data,
    };
  }

  @Post('account-titles')
  async upsertAccountTitle(
    @Body() payload: UpsertAccountTitlePayload,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.upsertAccountTitle(
      payload,
      buildAuditActorFromRequest(request),
    );
    return {
      success: true,
      data,
    };
  }

  @Get('cheque-vouchers/next-number')
  async getNextChequeVoucherNumber() {
    const cvNo = await this.accountingService.getNextChequeVoucherNumber();
    return {
      success: true,
      data: { cvNo },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('report-print-settings/:reportKey')
  async getReportPrintSettings(
    @Param('reportKey') reportKey: string,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data: unknown }> {
    const branchId = this.toPositiveNumber(request.user?.branchId ?? request.user?.branch_id);
    const data = await this.accountingService.getReportPrintSettings(reportKey, branchId);
    return {
      success: true,
      data,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put('report-print-settings/:reportKey')
  async upsertReportPrintSettings(
    @Param('reportKey') reportKey: string,
    @Body() payload: AccountingReportPrintSettingsPayload,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data: unknown }> {
    const branchId = this.toPositiveNumber(request.user?.branchId ?? request.user?.branch_id);
    const userId = this.toPositiveNumber(request.user?.sub);
    const data = await this.accountingService.upsertReportPrintSettings(reportKey, payload, {
      branchId,
      userId,
      actor: buildAuditActorFromRequest(request),
    });
    return {
      success: true,
      data,
    };
  }

  @Get('cheque-vouchers')
  async listChequeVouchers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('invoice') invoice?: string,
    @Query('particulars') particulars?: string,
    @Query('chequeNo') chequeNo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    // Validate page if provided: must be a numeric integer >= 1
    if (page !== undefined && page !== '') {
      const pageNum = Number(page);
      if (!Number.isFinite(pageNum) || !Number.isInteger(pageNum) || pageNum < 1) {
        throw new BadRequestException('page must be an integer greater than or equal to 1');
      }
    }

    // Validate pageSize if provided: must be a numeric integer between 1 and 100
    if (pageSize !== undefined && pageSize !== '') {
      const pageSizeNum = Number(pageSize);
      if (!Number.isFinite(pageSizeNum) || !Number.isInteger(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
        throw new BadRequestException('pageSize must be an integer between 1 and 100');
      }
    }

    const data = await this.accountingService.listChequeVouchers(
      { dateFrom, dateTo, invoice, particulars, chequeNo },
      page,
      pageSize,
    );
    return {
      success: true,
      data,
    };
  }

  @Get('sales-register')
  async getSalesRegister(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.getSalesRegister({ page, pageSize, dateFrom, dateTo });
    return {
      success: true,
      data,
    };
  }

  @Get('general-journals')
  async listGeneralJournals(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.listGeneralJournals({ dateFrom, dateTo, page, pageSize });
    return {
      success: true,
      data,
    };
  }

  @Get('general-journals/next-number')
  async getNextGeneralJournalNumber() {
    const journalNo = await this.accountingService.getNextGeneralJournalNumber();
    return {
      success: true,
      data: { journalNo },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('general-journals/post')
  async postGeneralJournal(
    @Body() payload: CreateGeneralJournalPayload,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.postGeneralJournal(
      payload,
      buildAuditActorFromRequest(request),
    );
    return {
      success: true,
      data,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('general-journals/:journalNumber')
  async updateGeneralJournal(
    @Param('journalNumber') journalNumber: string,
    @Body() payload: UpdateGeneralJournalPayload,
    @Req() request: { user?: Record<string, unknown>; ip?: string },
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.updateGeneralJournal(
      journalNumber,
      payload,
      buildAuditActorFromRequest(request),
    );
    return {
      success: true,
      data,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('cheque-vouchers/release')
  async releaseChequeVoucher(
    @Body() payload: CreateChequeVoucherPayload,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data: unknown }> {
    const preparedBy = String(request.user?.fullname ?? request.user?.username ?? '').trim() || undefined;
    const data = await this.accountingService.releaseChequeVoucher(
      { ...payload, preparedBy },
      buildAuditActorFromRequest(request),
    );
    return {
      success: true,
      data,
    };
  }

  @Get('tax-2307-report')
  async getTax2307Report(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const result = await this.accountingService.getTax2307Report({ page, pageSize, dateFrom, dateTo });
    return {
      success: true,
      data: result,
    };
  }

  @Get('disbursement-register')
  async getDisbursementRegister(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const result = await this.accountingService.getDisbursementRegister({ page, pageSize, dateFrom, dateTo });
    return {
      success: true,
      data: result,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cheque-vouchers/:cvNo')
  async updateChequeVoucher(
    @Param('cvNo') cvNo: string,
    @Body() payload: UpdateChequeVoucherPayload,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data: unknown }> {
    const preparedBy = String(request.user?.fullname ?? request.user?.username ?? '').trim() || undefined;
    const data = await this.accountingService.updateChequeVoucher(
      cvNo,
      { ...payload, preparedBy },
      buildAuditActorFromRequest(request),
    );
    return {
      success: true,
      data,
    };
  }

  @Get('weekly-sales')
  async getWeeklySales(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.getWeeklySales({ page, pageSize, dateFrom, dateTo });
    return {
      success: true,
      data,
    };
  }

  @Get('daily-unit-released')
  async getDailyUnitReleased(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.getDailyUnitReleased({ page, pageSize, dateFrom, dateTo });
    return {
      success: true,
      data,
    };
  }

  @Get('low-stocks')
  async getLowStocks(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const data = await this.accountingService.getLowStocks(page, pageSize);
    return {
      success: true,
      data,
    };
  }
}
