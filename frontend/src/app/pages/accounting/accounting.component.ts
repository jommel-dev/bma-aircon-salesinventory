import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { DatePickerComponent } from '../../shared/components/form/date-picker/date-picker.component';
import {
  SalesOrderListItem,
  SalesOrderService,
} from '../../shared/services/sales-order.service';
import { RbacService } from '../../shared/services/rbac.service';
import {
  BusinessProfileSettings,
  BusinessSettingsService,
} from '../../shared/services/business-settings.service';
import { apiClient } from '../../shared/services/api-client';
import axios from 'axios';

type AccountingReportKey =
  | 'cheque-voucher'
  | 'general-journal-register'
  | 'disbursement-register'
  | 'sales-register'
  | 'tax-2307-report'
  | 'weekly-sales'
  | 'daily-unit-released'
  | 'low-stocks-report';

interface AccountingReportDefinition {
  key: AccountingReportKey;
  name: string;
  description: string;
  permissionKeys: string[];
  readiness: 'live' | 'draft';
}

interface AccountingReportFolder {
  key: string;
  name: string;
  description: string;
  reports: AccountingReportDefinition[];
}

interface SalesRegisterRow {
  id: number;
  soNumber: string;
  customerName: string;
  salesType: string;
  status: string;
  releaseDate: string;
  serialCount: number;
  totalAmount: number;
}

interface WeeklySalesRow {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  orderCount: number;
  unitCount: number;
  totalAmount: number;
}

interface DailyUnitReleasedRow {
  releaseDate: string;
  orderCount: number;
  unitCount: number;
  totalAmount: number;
}

interface LowStockRow {
  id: number;
  materialCode: string;
  materialName: string;
  brandName: string;
  unit: string;
  onHandStock: number;
  reorderLevel: number;
  sellPrice: number;
}

interface ChequeDepositDraft {
  bankName: string;
  chequeNo: string;
  chequeDate: string;
  amount: number;
}

interface InvoiceDraft {
  invoiceNo: string;
  invoiceDate: string;
  description: string;
  amount: number;
}

interface AccountTitleDraft {
  accountNumber: string;
  description: string;
  debit: number;
  credit: number;
  locked?: boolean;
}

interface ChequeVoucherReleasedRecord {
  cvNo: string;
  voucherType: string;
  payee: string;
  voucherDate: string;
  tinNumber: string;
  address: string;
  zipCode: string;
  particulars: string;
  deposits: ChequeDepositDraft[];
  invoices: InvoiceDraft[];
  accountTitles: AccountTitleDraft[];
  releasedAt: string;
  preparedBy: string | null;
}

interface GeneralJournalReleasedLine {
  accountNumber: string;
  description: string;
  debit: number;
  credit: number;
}

interface GeneralJournalReleasedRecord {
  journalNumber: string;
  journalDate: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: 'draft' | 'posted' | 'reversed';
  postedAt: string | null;
  referenceNumber: string | null;
  lines: GeneralJournalReleasedLine[];
}

type ChequeVoucherSignatoryValueSource = 'prepared_by' | 'custom';
type ChequeVoucherSignatorySignatureSource = 'none' | 'preparedBy' | 'checkedBy' | 'approvedBy';

interface ChequeVoucherSignatoryConfig {
  id: string;
  label: string;
  valueSource: ChequeVoucherSignatoryValueSource;
  customValue: string;
  signatureSource: ChequeVoucherSignatorySignatureSource;
}

interface ChequeVoucherPrintSettings {
  showHeader: boolean;
  showLogo: boolean;
  showAddress: boolean;
  showPreparedBy: boolean;
  showSignatureLine: boolean;
  paperSize: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  orientation: 'portrait' | 'landscape';
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  defaultAddress: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  signatories: ChequeVoucherSignatoryConfig[];
}

interface Tax2307PrintSettings {
  showHeader: boolean;
  showLogo: boolean;
  showAddress: boolean;
  paperSize: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  orientation: 'portrait' | 'landscape';
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryTin: string;
  signatoryImage: string;
}

interface GeneralJournalPrintSettings {
  showHeader: boolean;
  showLogo: boolean;
  showAddress: boolean;
  paperSize: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  orientation: 'portrait' | 'landscape';
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  signatories: ChequeVoucherSignatoryConfig[];
}

interface DisbursementDefaultColumn {
  id: string;
  accountNumber: string;
  label: string;
  side: 'DR' | 'CR';
}

type DisbursementBaseColumnKey =
  | 'date'
  | 'referenceNo'
  | 'checkNo'
  | 'payee'
  | 'description'
  | 'tinNumber'
  | 'address'
  | 'zipCode'
  | 'invoice'
  | 'invoiceDate'
  | 'voucherType'
  | 'preparedBy'
  | 'releasedAt'
  | 'bankName'
  | 'chequeDate';

interface DisbursementBaseColumn {
  id: string;
  key: DisbursementBaseColumnKey;
  label: string;
}

interface DisbursementRegisterPrintSettings {
  showHeader: boolean;
  showLogo: boolean;
  showAddress: boolean;
  baseColumns: DisbursementBaseColumn[];
  paperSize: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  orientation: 'portrait' | 'landscape';
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  defaultColumns: DisbursementDefaultColumn[];
}

interface JournalSundryDraft {
  accountNumber: string;
  description: string;
  debit: number;
  credit: number;
}

interface ExcelExportDefinition {
  fileName: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

interface Tax2307ReportRow {
  referenceNo: string;
  tin: string;
  supplierName: string;
  supplierAddress: string;
  vatableAmount: number;
  taxWithheld: number;
  voucherDate: string;
}

interface Tax2307SupplierSummary {
  tin: string;
  supplierName: string;
  supplierAddress: string;
  references: string[];
  vatableAmount: number;
  taxWithheld: number;
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-accounting',
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent, DatePickerComponent],
  templateUrl: './accounting.component.html',
})
export class AccountingComponent implements OnInit {
  private readonly reportPermissionPrefix = 'accounting.report.';
  private readonly reportActionPermissionPrefix = 'accounting.report.action.';
  private readonly generateReportPermissionKeys = ['accounting.report.action.generate'];
  private readonly exportReportPermissionKeys = ['accounting.report.action.export'];
  private readonly printReportPermissionKeys = ['accounting.report.action.print'];
  private readonly editDraftReportPermissionKeys = ['accounting.report.action.edit-draft'];
  private readonly chequeVoucherPrintSettingsStorageKey = 'accounting:print-settings:cheque-voucher';
  private readonly chequeVoucherPrintSettingsReportKey = 'cheque-voucher';
  private readonly tax2307PrintSettingsStorageKey = 'accounting:print-settings:tax-2307-report';
  private readonly tax2307PrintSettingsReportKey = 'tax-2307-report';
  private readonly generalJournalPrintSettingsStorageKey = 'accounting:print-settings:general-journal-register';
  private readonly generalJournalPrintSettingsReportKey = 'general-journal-register';
  private readonly disbursementRegisterPrintSettingsStorageKey = 'accounting:print-settings:disbursement-register';
  private readonly disbursementRegisterPrintSettingsReportKey = 'disbursement-register';
  private signatoryIdSeed = 0;

  private businessProfile: BusinessProfileSettings | null = null;

  tax2307PreviewObjectUrl: string | null = null;
  tax2307PreviewUrl: SafeResourceUrl | null = null;
  tax2307PreviewFilename = '';

  treeSearch = '';
  selectedReportKey: AccountingReportKey | null = null;
  expandedFolders = new Set<string>();

  isLoadingReport = false;
  reportError = '';

  reportDateFrom = '';
  reportDateTo = '';
  chequeVoucherListDateFrom = '';
  chequeVoucherListDateTo = '';
  generalJournalListDateFrom = '';
  generalJournalListDateTo = '';
  tax2307DateFrom = '';
  tax2307DateTo = '';
  tax2307SearchQuery = '';
  tax2307SupplierFilter = '';
  isChequeVoucherDrawerOpen = false;
  isGeneralJournalDrawerOpen = false;
  isLoadingChequeVoucherDraftData = false;
  isLoadingGeneralJournalData = false;
  isLoadingGeneralJournalNextNumber = false;
  isSavingChequeVoucher = false;
  isSavingGeneralJournal = false;
  viewingVoucher: ChequeVoucherReleasedRecord | null = null;
  viewingGeneralJournal: GeneralJournalReleasedRecord | null = null;
  voucherSearchQuery = '';
  isEditingViewingVoucher = false;
  isSavingVoucherEdit = false;
  isEditingGeneralJournalView = false;
  isSavingGeneralJournalEdit = false;
  isChequeVoucherPrintSettingsDrawerOpen = false;
  isTax2307PrintSettingsDrawerOpen = false;
  isGeneralJournalPrintSettingsDrawerOpen = false;
  isTax2307PrintPreviewOpen = false;
  isGeneralJournalPrintPreviewOpen = false;
  isPrintPreviewOpen = false;
  isSavingChequeVoucherPrintSettings = false;
  isLoadingChequeVoucherPrintSettings = false;
  isSavingTax2307PrintSettings = false;
  isLoadingTax2307PrintSettings = false;
  isSavingGeneralJournalPrintSettings = false;
  isLoadingGeneralJournalPrintSettings = false;
  chequeVoucherPrintSettingsNotice = '';
  tax2307PrintSettingsNotice = '';
  generalJournalPrintSettingsNotice = '';
  chequeVoucherPrintSettings: ChequeVoucherPrintSettings = this.createDefaultChequeVoucherPrintSettings();
  tax2307PrintSettings: Tax2307PrintSettings = this.createDefaultTax2307PrintSettings();
  signatoryImagePreview: string | null = null;
  signatoryUploadError = '';
  generalJournalPrintSettings: GeneralJournalPrintSettings = this.createDefaultGeneralJournalPrintSettings();
    disbursementRegisterPrintSettings: DisbursementRegisterPrintSettings = this.createDefaultDisbursementRegisterPrintSettings();
    isDisbursementRegisterPrintSettingsDrawerOpen = false;
    isSavingDisbursementRegisterPrintSettings = false;
    isLoadingDisbursementRegisterPrintSettings = false;
    disbursementRegisterPrintSettingsNotice = '';
    disbursementRegisterMonth = new Date().toISOString().slice(0, 7);
    disbursementRegisterData: ChequeVoucherReleasedRecord[] = [];
    isLoadingDisbursementRegister = false;
    disbursementRegisterError = '';
    isDisbursementRegisterPrintPreviewOpen = false;

  // Pagination state per report
  chequeVoucherPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  generalJournalPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  salesRegisterPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  tax2307Pagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  disbursementPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  weeklySalesPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  dailyUnitReleasedPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };
  lowStocksPagination: PaginationState = { page: 1, pageSize: 25, total: 0, totalPages: 0 };

  pageSizeOptions = [10, 25, 50, 100];

  private readonly dummyChequeVoucherPreview: ChequeVoucherReleasedRecord = {
    cvNo: 'CV-2026-0042',
    voucherType: 'Bank Voucher',
    payee: 'Juan Dela Cruz Trading',
    voucherDate: '2026-03-27',
    tinNumber: '123-456-789-000',
    address: '#25 Mabini Street, Quezon City',
    zipCode: '1100',
    particulars: 'Payment for supplier invoices and operating expenses.',
    deposits: [
      {
        bankName: 'BDO',
        chequeNo: '000412',
        chequeDate: '2026-03-26',
        amount: 12500,
      },
      {
        bankName: 'Metrobank',
        chequeNo: '900031',
        chequeDate: '2026-03-27',
        amount: 8750,
      },
    ],
    invoices: [
      {
        invoiceNo: 'INV-2603-1021',
        invoiceDate: '2026-03-25',
        description: 'Supply and installation materials',
        amount: 14250,
      },
      {
        invoiceNo: 'INV-2603-1044',
        invoiceDate: '2026-03-26',
        description: 'Service tools and fittings',
        amount: 7000,
      },
    ],
    accountTitles: [
      {
        accountNumber: '5101',
        description: 'Supplies Expense',
        debit: 9000,
        credit: 0,
      },
      {
        accountNumber: '5105',
        description: 'Repairs and Maintenance Expense',
        debit: 12250,
        credit: 0,
      },
      {
        accountNumber: '1010',
        description: 'Cash in Bank',
        debit: 0,
        credit: 21250,
      },
    ],
    releasedAt: '2026-03-27',
    preparedBy: 'Accounting Staff',
  };
  editingVoucherForm = {
    cvNo: '',
    voucherType: 'Bank Voucher',
    payee: '',
    voucherDate: '',
    tinNumber: '',
    address: '',
    zipCode: '',
    particulars: '',
    deposits: [] as ChequeDepositDraft[],
    invoices: [] as InvoiceDraft[],
    accountTitles: [] as AccountTitleDraft[],
  };

  editingGeneralJournalForm = {
    journalNumber: '',
    journalDate: '',
    description: '',
    sundries: [] as JournalSundryDraft[],
  };

  readonly chequeVoucherTypeOptions = [
    'Debit Voucher',
    'Credit Voucher',
    'Cash Voucher',
    'Bank Voucher',
    'Journal Voucher',
    'Purchase Voucher',
    'Sales Voucher',
    'Contra Voucher',
    'Debit/Credit Note Voucher',
  ];

  salesRegisterRows: SalesRegisterRow[] = [];
  weeklySalesRows: WeeklySalesRow[] = [];
  dailyUnitReleasedRows: DailyUnitReleasedRow[] = [];
  lowStockRows: LowStockRow[] = [];
  tax2307ReportRows: Tax2307ReportRow[] = [];
  releasedChequeVouchers: ChequeVoucherReleasedRecord[] = [];
  releasedGeneralJournals: GeneralJournalReleasedRecord[] = [];
  accountTitleCatalog: AccountTitleDraft[] = [];
  sundryAccountDropdownIndex = -1;
  sundryAccountSearchResults: AccountTitleDraft[] = [];
  cvAccountDropdownIndex = -1;
  cvAccountSearchResults: AccountTitleDraft[] = [];
  editCvAccountDropdownIndex = -1;
  editCvAccountSearchResults: AccountTitleDraft[] = [];

  payeeSearchResults: any[] = [];
  isSearchingPayee: boolean = false;
  isPayeeDropdownOpen: boolean = false;

  chequeVoucherForm = {
    cvNo: '',
    voucherType: 'Bank Voucher',
    payee: '',
    voucherDate: '',
    tinNumber: '',
    address: '',
    zipCode: '',
    particulars: '',
    deposits: [this.createChequeDepositDraft()],
    invoices: [this.createInvoiceDraft()],
    accountTitles: [this.createAccountTitleDraft()],
  };

  private readonly defaultAccountTitles: AccountTitleDraft[] = [
    { accountNumber: '11001', description: 'Cash In Bank', debit: 0, credit: 0 },
    { accountNumber: '14001', description: 'Purchases', debit: 0, credit: 0 },
    { accountNumber: '14010', description: 'Input Tax', debit: 0, credit: 0 },
    { accountNumber: '12001', description: 'Expanded Withholding Tax', debit: 0, credit: 0 },
    { accountNumber: '15001', description: 'DC-Outside Services', debit: 0, credit: 0 },
    { accountNumber: '15002', description: 'DC-Materials', debit: 0, credit: 0 },
    { accountNumber: '15003', description: 'DC-Others', debit: 0, credit: 0 },
  ];

  generalJournalForm = {
    journalNo: '',
    journalDate: '',
    description: '',
    sundries: [this.createJournalSundryDraft()],
  };

  readonly reportFolders: AccountingReportFolder[] = [
    {
      key: 'voucher-workflows',
      name: 'Voucher Workflows',
      description: 'Cheque Voucher is live; other voucher reports remain in progressive rollout.',
      reports: [
        {
          key: 'cheque-voucher',
          name: 'Cheque Voucher',
          description: 'Live workflow with auto-numbering, persisted vouchers, and account title records.',
          permissionKeys: ['accounting.report.cheque-voucher.view'],
          readiness: 'live',
        },
        {
          key: 'general-journal-register',
          name: 'General Journal Register',
          description: 'Journal details with debit and credit sundries lines.',
          permissionKeys: ['accounting.report.general-journal-register.view'],
          readiness: 'live',
        },
        {
          key: 'disbursement-register',
          name: 'Disbursement Register',
          description: 'Register generated from released cheque vouchers.',
          permissionKeys: ['accounting.report.disbursement-register.view'],
          readiness: 'live',
        },
      ],
    },
    {
      key: 'sales-and-operations',
      name: 'Sales And Operations',
      description: 'Current live reports backed by existing sales and inventory APIs.',
      reports: [
        {
          key: 'sales-register',
          name: 'Sales Register',
          description: 'Remitted and completed sales orders within the selected date range.',
          permissionKeys: ['accounting.report.sales-register.view'],
          readiness: 'live',
        },
        {
          key: 'weekly-sales',
          name: 'Weekly Sales',
          description: 'Weekly sales totals aggregated from remitted and completed sales orders.',
          permissionKeys: ['accounting.report.weekly-sales.view'],
          readiness: 'live',
        },
        {
          key: 'daily-unit-released',
          name: 'Daily Unit Released',
          description: 'Daily released unit counts grouped from remitted and completed sales orders.',
          permissionKeys: ['accounting.report.daily-unit-released.view'],
          readiness: 'live',
        },
        {
          key: 'low-stocks-report',
          name: 'Low Stocks Report',
          description: 'Materials where on-hand stock is at or below reorder level.',
          permissionKeys: ['accounting.report.low-stocks-report.view'],
          readiness: 'live',
        },
      ],
    },
    {
      key: 'tax-and-compliance',
      name: 'Tax And Compliance',
      description: 'Compliance previews awaiting dedicated accounting persistence.',
      reports: [
        {
          key: 'tax-2307-report',
          name: '2307 Tax Report',
          description: 'Withholding tax report derived from released cheque voucher account titles.',
          permissionKeys: ['accounting.report.tax-2307-report.view'],
          readiness: 'live',
        },
      ],
    },
  ];

  constructor(
    private readonly salesOrderService: SalesOrderService,
    private readonly rbacService: RbacService,
    private readonly businessSettingsService: BusinessSettingsService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.initializeDateRange();
    void this.initializeDraftForms();
    void this.loadBusinessProfile();

    for (const folder of this.visibleReportFolders) {
      this.expandedFolders.add(folder.key);
    }

    const firstVisibleReport = this.visibleReportFolders[0]?.reports[0] ?? null;
    if (firstVisibleReport) {
      this.selectReport(firstVisibleReport.key);
    }
  }

  get filteredReleasedChequeVouchers(): ChequeVoucherReleasedRecord[] {
    return this.releasedChequeVouchers.filter((record) => this.isVoucherWithinDateRange(record.voucherDate));
  }

  get releasedChequeVoucherAmountTotal(): number {
    return this.filteredReleasedChequeVouchers.reduce((sum, voucher) => {
      return sum + this.getReleasedVoucherAmountTotal(voucher);
    }, 0);
  }

  get visibleReportFolders(): AccountingReportFolder[] {
    const normalizedQuery = this.normalizeSearchText(this.treeSearch);
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);

    return this.reportFolders
      .map((folder) => {
        const folderMatches = this.matchesSearch(
          `${folder.name} ${folder.description}`,
          queryTokens,
        );

        const reports = folder.reports.filter((report) => {
          if (!this.canAccessReport(report)) {
            return false;
          }

          if (queryTokens.length === 0 || folderMatches) {
            return true;
          }

          return this.matchesSearch(
            `${report.name} ${report.description}`,
            queryTokens,
          );
        });

        if (!folderMatches && reports.length === 0) {
          return null;
        }

        return {
          ...folder,
          reports,
        };
      })
      .filter((folder): folder is AccountingReportFolder => folder !== null && folder.reports.length > 0);
  }

  get selectedReport(): AccountingReportDefinition | null {
    if (!this.selectedReportKey) {
      return null;
    }

    for (const folder of this.reportFolders) {
      const report = folder.reports.find((item) => item.key === this.selectedReportKey);
      if (report && this.canAccessReport(report)) {
        return report;
      }
    }

    return null;
  }

  get salesRegisterTotalAmount(): number {
    return this.salesRegisterRows.reduce((sum, row) => sum + row.totalAmount, 0);
  }

  get salesRegisterUnitCount(): number {
    return this.salesRegisterRows.reduce((sum, row) => sum + row.serialCount, 0);
  }

  get weeklySalesTotalAmount(): number {
    return this.weeklySalesRows.reduce((sum, row) => sum + row.totalAmount, 0);
  }

  get weeklySalesUnitCount(): number {
    return this.weeklySalesRows.reduce((sum, row) => sum + row.unitCount, 0);
  }

  get dailyReleasedTotalAmount(): number {
    return this.dailyUnitReleasedRows.reduce((sum, row) => sum + row.totalAmount, 0);
  }

  get dailyReleasedUnitCount(): number {
    return this.dailyUnitReleasedRows.reduce((sum, row) => sum + row.unitCount, 0);
  }

  get lowStockCriticalCount(): number {
    return this.lowStockRows.filter((row) => row.onHandStock <= row.reorderLevel).length;
  }

  get chequeVoucherDepositTotal(): number {
    return this.chequeVoucherForm.deposits.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  get chequeVoucherInvoiceTotal(): number {
    return this.chequeVoucherForm.invoices.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  get chequeVoucherDebitTotal(): number {
    return this.chequeVoucherForm.accountTitles.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
  }

  get chequeVoucherCreditTotal(): number {
    return this.chequeVoucherForm.accountTitles.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
  }

  get generalJournalDebitTotal(): number {
    return this.generalJournalForm.sundries.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
  }

  get generalJournalCreditTotal(): number {
    return this.generalJournalForm.sundries.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
  }

  get editingGeneralJournalDebitTotal(): number {
    return this.editingGeneralJournalForm.sundries.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
  }

  get editingGeneralJournalCreditTotal(): number {
    return this.editingGeneralJournalForm.sundries.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
  }


  get withholdingTaxRows(): Tax2307ReportRow[] {
    const rows = this.getTax2307BaseRows().filter((row) => {
      if (!this.tax2307SupplierFilter) {
        return true;
      }
      return row.supplierName === this.tax2307SupplierFilter;
    });

    const query = this.tax2307SearchQuery.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        row.referenceNo.toLowerCase().includes(query) ||
        row.tin.toLowerCase().includes(query) ||
        row.supplierName.toLowerCase().includes(query)
      );
    });
  }

  get tax2307SupplierOptions(): string[] {
    return [...new Set(
      this.getTax2307BaseRows()
        .map((row) => row.supplierName)
        .filter((value) => Boolean(value)),
    )].sort((a, b) => a.localeCompare(b));
  }

  get withholdingTaxTotal(): number {
    return this.withholdingTaxRows.reduce((sum, row) => sum + row.taxWithheld, 0);
  }

  get withholdingVatableTotal(): number {
    return this.withholdingTaxRows.reduce((sum, row) => sum + row.vatableAmount, 0);
  }

  get tax2307MonthLabel(): string {
    const sourceDate = this.tax2307DateFrom || this.tax2307DateTo || new Date().toISOString();
    const parsedDate = new Date(sourceDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return 'Current Month';
    }

    return parsedDate.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  isFolderExpanded(folderKey: string): boolean {
    if (this.treeSearch.trim()) {
      return true;
    }

    return this.expandedFolders.has(folderKey);
  }

  toggleFolder(folderKey: string): void {
    if (this.expandedFolders.has(folderKey)) {
      this.expandedFolders.delete(folderKey);
      return;
    }

    this.expandedFolders.add(folderKey);
  }

  isSelectedReport(reportKey: AccountingReportKey): boolean {
    return this.selectedReportKey === reportKey;
  }

  selectReport(reportKey: AccountingReportKey): void {
    this.selectedReportKey = reportKey;
    this.reportError = '';

    if (this.isLiveReport(reportKey)) {
      void this.reloadSelectedReport();
      return;
    }

    if (reportKey === 'general-journal-register') {
      void this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo);
    }

    if (reportKey === 'disbursement-register') {
      void this.loadDisbursementRegister();
    }

    if (reportKey === 'tax-2307-report') {
      this.applyDefaultTax2307DateRange();
      void this.loadTax2307ReportPaginated();
    }
  }

  isLiveReport(reportKey: AccountingReportKey | null): boolean {
    return (
      reportKey === 'general-journal-register' ||
      reportKey === 'sales-register' ||
      reportKey === 'weekly-sales' ||
      reportKey === 'daily-unit-released' ||
      reportKey === 'low-stocks-report'
    );
  }

  reportUsesDateRange(reportKey: AccountingReportKey | null): boolean {
    return (
      reportKey === 'sales-register' ||
      reportKey === 'weekly-sales' ||
      reportKey === 'daily-unit-released'
    );
  }

  canExportSelectedReport(): boolean {
    switch (this.selectedReportKey) {
      case 'sales-register':
        return this.salesRegisterRows.length > 0;
      case 'weekly-sales':
        return this.weeklySalesRows.length > 0;
      case 'daily-unit-released':
        return this.dailyUnitReleasedRows.length > 0;
      case 'low-stocks-report':
        return this.lowStockRows.length > 0;
      case 'cheque-voucher':
      case 'general-journal-register':
      case 'disbursement-register':
      case 'tax-2307-report':
        return true;
      default:
        return false;
    }
  }

  canGenerateSelectedReportAction(): boolean {
    if (!this.selectedReportKey || !this.isLiveReport(this.selectedReportKey)) {
      return false;
    }

    return this.canAccessReportAction(this.generateReportPermissionKeys);
  }

  canExportSelectedReportAction(): boolean {
    return this.canAccessReportAction(this.exportReportPermissionKeys) && this.canExportSelectedReport();
  }

  canPrintSelectedReportAction(): boolean {
    return this.canAccessReportAction(this.printReportPermissionKeys);
  }

  canEditSelectedReportDraft(): boolean {
    if (!this.selectedReportKey) {
      return false;
    }

    return !this.isLiveReport(this.selectedReportKey) && this.canAccessReportAction(this.editDraftReportPermissionKeys);
  }

  canManageGeneralJournal(): boolean {
    return this.canAccessReportAction(this.editDraftReportPermissionKeys)
      || this.canAccessReportAction(this.generateReportPermissionKeys);
  }

  async reloadSelectedReport(): Promise<void> {
    if (!this.selectedReportKey || !this.isLiveReport(this.selectedReportKey)) {
      return;
    }

    if (!this.canGenerateSelectedReportAction()) {
      this.reportError = 'You do not have permission to generate this report.';
      return;
    }

    // Reset pagination to page 1 when filters change
    const pagination = this.getPaginationState(this.selectedReportKey);
    if (pagination) {
      pagination.page = 1;
    }

    this.isLoadingReport = true;
    this.reportError = '';

    try {
      if (this.selectedReportKey === 'general-journal-register') {
        await this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo);
        return;
      }

      if (this.selectedReportKey === 'low-stocks-report') {
        await this.loadLowStockReport();
        return;
      }

      if (this.selectedReportKey === 'sales-register') {
        await this.loadSalesRegisterPaginated();
        return;
      }

      if (this.selectedReportKey === 'weekly-sales') {
        await this.loadWeeklySalesPaginated();
        return;
      }

      if (this.selectedReportKey === 'daily-unit-released') {
        await this.loadDailyUnitReleasedPaginated();
        return;
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.reportError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to load accounting report';
      } else if (error instanceof Error) {
        this.reportError = error.message;
      } else {
        this.reportError = 'Unable to load accounting report';
      }
    } finally {
      this.isLoadingReport = false;
    }
  }

  async exportSelectedReportAsExcel(): Promise<void> {
    if (!this.canAccessReportAction(this.exportReportPermissionKeys)) {
      this.reportError = 'You do not have permission to export reports.';
      return;
    }

    const definition = this.buildExcelExportDefinition();
    if (!definition) {
      this.reportError = 'No rows available to export.';
      return;
    }

    const workbook = await this.createWorkbook();
    const worksheet = workbook.addWorksheet(definition.sheetName);

    worksheet.addRow([definition.title]);
    if (definition.subtitle) {
      worksheet.addRow([definition.subtitle]);
    }
    worksheet.addRow([]);
    worksheet.addRow(definition.headers);

    const headerRow = worksheet.lastRow;
    if (headerRow) {
      headerRow.font = { bold: true };
    }

    for (const row of definition.rows) {
      worksheet.addRow(row);
    }

    worksheet.columns = definition.headers.map(() => ({ width: 22 }));

    const buffer = await workbook.xlsx.writeBuffer();
    this.downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      definition.fileName,
    );
  }

  printSelectedReport(): void {
    if (!this.canAccessReportAction(this.printReportPermissionKeys)) {
      this.reportError = 'You do not have permission to print reports.';
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (this.selectedReportKey === 'tax-2307-report') {
      this.printTax2307Report();
      return;
    }

    if (this.selectedReportKey === 'general-journal-register') {
      this.printGeneralJournalReport();
      return;
    }

    if (this.selectedReportKey === 'disbursement-register') {
      this.printDisbursementRegister();
      return;
    }

    window.print();
  }

  addChequeDeposit(): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    this.chequeVoucherForm.deposits = [...this.chequeVoucherForm.deposits, this.createChequeDepositDraft()];
  }

  removeChequeDeposit(index: number): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    if (this.chequeVoucherForm.deposits.length <= 1) {
      return;
    }

    this.chequeVoucherForm.deposits = this.chequeVoucherForm.deposits.filter((_, itemIndex) => itemIndex !== index);
  }

  addChequeInvoice(): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    this.chequeVoucherForm.invoices = [...this.chequeVoucherForm.invoices, this.createInvoiceDraft()];
  }

  removeChequeInvoice(index: number): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    if (this.chequeVoucherForm.invoices.length <= 1) {
      return;
    }

    this.chequeVoucherForm.invoices = this.chequeVoucherForm.invoices.filter((_, itemIndex) => itemIndex !== index);
  }

  addAccountTitle(): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    this.chequeVoucherForm.accountTitles = [...this.chequeVoucherForm.accountTitles, this.createAccountTitleDraft()];
  }

  async openChequeVoucherDrawer(): Promise<void> {
    this.isChequeVoucherDrawerOpen = true;
    await this.loadNextChequeVoucherNumber();
  }

  closeChequeVoucherDrawer(): void {
    this.isChequeVoucherDrawerOpen = false;
  }

  async openGeneralJournalDrawer(): Promise<void> {
    this.isGeneralJournalDrawerOpen = true;
    await this.loadNextGeneralJournalNumber();
  }

  closeGeneralJournalDrawer(): void {
    this.isGeneralJournalDrawerOpen = false;
  }

  openVoucherView(voucher: ChequeVoucherReleasedRecord): void {
    this.viewingVoucher = voucher;
    this.isEditingViewingVoucher = false;
    void this.loadChequeVoucherPrintSettings();
  }

  openGeneralJournalView(entry: GeneralJournalReleasedRecord): void {
    this.viewingGeneralJournal = entry;
    this.isEditingGeneralJournalView = false;
  }

  openGeneralJournalEdit(entry: GeneralJournalReleasedRecord): void {
    this.openGeneralJournalView(entry);
    this.startEditGeneralJournal();
  }

  closeVoucherView(): void {
    this.viewingVoucher = null;
    this.isEditingViewingVoucher = false;
  }

  closeGeneralJournalView(): void {
    this.viewingGeneralJournal = null;
    this.isEditingGeneralJournalView = false;
    this.isSavingGeneralJournalEdit = false;
  }

  startEditVoucher(): void {
    if (!this.viewingVoucher) {
      return;
    }
    const v = this.viewingVoucher;
    this.editingVoucherForm = {
      cvNo: v.cvNo,
      voucherType: v.voucherType,
      payee: v.payee,
      voucherDate: v.voucherDate,
      tinNumber: v.tinNumber ?? '',
      address: v.address ?? '',
      zipCode: v.zipCode ?? '',
      particulars: v.particulars ?? '',
      deposits: v.deposits.map((d) => ({ ...d })),
      invoices: v.invoices.map((i) => ({ ...i })),
      accountTitles: v.accountTitles.map((t) => ({ ...t })),
    };
    this.isEditingViewingVoucher = true;
  }

  startEditGeneralJournal(): void {
    if (!this.viewingGeneralJournal || !this.canManageGeneralJournal()) {
      return;
    }

    const journal = this.viewingGeneralJournal;
    this.editingGeneralJournalForm = {
      journalNumber: journal.journalNumber,
      journalDate: journal.journalDate,
      description: journal.description ?? '',
      sundries: journal.lines.length > 0
        ? journal.lines.map((line) => ({
            accountNumber: line.accountNumber,
            description: line.description,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
          }))
        : [this.createJournalSundryDraft()],
    };
    this.isEditingGeneralJournalView = true;
  }

  openChequeVoucherPrintSettingsDrawer(): void {
    void this.loadChequeVoucherPrintSettings();
    this.chequeVoucherPrintSettingsNotice = '';
    this.isChequeVoucherPrintSettingsDrawerOpen = true;
  }

  openTax2307PrintSettingsDrawer(): void {
    void this.loadTax2307PrintSettings();
    this.tax2307PrintSettingsNotice = '';
    this.signatoryUploadError = '';
    this.isTax2307PrintSettingsDrawerOpen = true;
  }

  openGeneralJournalPrintSettingsDrawer(): void {
    void this.loadGeneralJournalPrintSettings();
    this.generalJournalPrintSettingsNotice = '';
    this.isGeneralJournalPrintSettingsDrawerOpen = true;
  }

  closeChequeVoucherPrintSettingsDrawer(): void {
    this.isChequeVoucherPrintSettingsDrawerOpen = false;
    this.chequeVoucherPrintSettingsNotice = '';
  }

  closeTax2307PrintSettingsDrawer(): void {
    this.isTax2307PrintSettingsDrawerOpen = false;
    this.tax2307PrintSettingsNotice = '';
    this.signatoryUploadError = '';
  }

  onSignatoryImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    this.signatoryUploadError = '';

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg'];
    if (!validTypes.includes(file.type)) {
      this.signatoryUploadError = 'Accepted formats are PNG and JPEG only.';
      input.value = '';
      return;
    }

    // Validate file size (max 2 MB)
    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.signatoryUploadError = 'Maximum allowed file size is 2 MB.';
      input.value = '';
      return;
    }

    // Validate image dimensions
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width < 100 || img.height < 50 || img.width > 600 || img.height > 300) {
          this.signatoryUploadError = 'Allowed dimensions: 100×50 to 600×300 pixels.';
          input.value = '';
          return;
        }

        // All validations passed
        this.tax2307PrintSettings.signatoryImage = dataUrl;
        this.signatoryImagePreview = dataUrl;
        this.signatoryUploadError = '';
        input.value = '';
      };
      img.onerror = () => {
        this.signatoryUploadError = 'Unable to read image file.';
        input.value = '';
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      this.signatoryUploadError = 'Unable to read file.';
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removeSignatoryImage(): void {
    this.tax2307PrintSettings.signatoryImage = '';
    this.signatoryImagePreview = null;
    this.signatoryUploadError = '';
  }

  closeGeneralJournalPrintSettingsDrawer(): void {
    this.isGeneralJournalPrintSettingsDrawerOpen = false;
    this.generalJournalPrintSettingsNotice = '';
  }

  openDisbursementRegisterPrintSettingsDrawer(): void {
    void this.loadDisbursementRegisterPrintSettings();
    this.disbursementRegisterPrintSettingsNotice = '';
    this.isDisbursementRegisterPrintSettingsDrawerOpen = true;
  }

  closeDisbursementRegisterPrintSettingsDrawer(): void {
    this.isDisbursementRegisterPrintSettingsDrawerOpen = false;
    this.disbursementRegisterPrintSettingsNotice = '';
  }

  openDisbursementRegisterPrintPreview(): void {
    this.isDisbursementRegisterPrintPreviewOpen = true;
  }

  closeDisbursementRegisterPrintPreview(): void {
    this.isDisbursementRegisterPrintPreviewOpen = false;
  }

  executeDisbursementRegisterPrintFromPreview(): void {
    this.printDisbursementRegister();
    this.closeDisbursementRegisterPrintPreview();
  }

  openTax2307PrintPreview(): void {
    this.isTax2307PrintPreviewOpen = true;
  }

  closeTax2307PrintPreview(): void {
    this.isTax2307PrintPreviewOpen = false;
    this.revokeTax2307PreviewUrl();
  }

  printTax2307Preview(): void {
    const frame = document.getElementById('tax2307-preview-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  }

  executeTax2307PrintFromPreview(): void {
    if (this.tax2307PreviewUrl) {
      this.printTax2307Preview();
      return;
    }

    this.printTax2307Report();
    this.closeTax2307PrintPreview();
  }

  private revokeTax2307PreviewUrl(): void {
    if (this.tax2307PreviewObjectUrl) {
      URL.revokeObjectURL(this.tax2307PreviewObjectUrl);
      this.tax2307PreviewObjectUrl = null;
    }
    this.tax2307PreviewUrl = null;
    this.tax2307PreviewFilename = '';
  }

  openGeneralJournalPrintPreview(): void {
    this.isGeneralJournalPrintPreviewOpen = true;
  }

  closeGeneralJournalPrintPreview(): void {
    this.isGeneralJournalPrintPreviewOpen = false;
  }

  executeGeneralJournalPrintFromPreview(): void {
    this.printGeneralJournalReport();
    this.closeGeneralJournalPrintPreview();
  }

  async saveChequeVoucherPrintSettings(): Promise<void> {
    if (this.isSavingChequeVoucherPrintSettings) {
      return;
    }

    this.isSavingChequeVoucherPrintSettings = true;
    this.chequeVoucherPrintSettingsNotice = '';

    const persistedToDatabase = await this.persistChequeVoucherPrintSettings();
    this.chequeVoucherPrintSettingsNotice = persistedToDatabase
      ? 'Saved to database.'
      : 'Unable to reach database. Saved in this browser as fallback.';

    this.isSavingChequeVoucherPrintSettings = false;
  }

  async resetChequeVoucherPrintSettings(): Promise<void> {
    this.chequeVoucherPrintSettings = this.createDefaultChequeVoucherPrintSettings();
    if (this.isSavingChequeVoucherPrintSettings) {
      return;
    }

    this.isSavingChequeVoucherPrintSettings = true;
    const persistedToDatabase = await this.persistChequeVoucherPrintSettings();
    this.chequeVoucherPrintSettingsNotice = persistedToDatabase
      ? 'Reset to defaults and saved to database.'
      : 'Reset to defaults and saved in this browser as fallback.';
    this.isSavingChequeVoucherPrintSettings = false;
  }

  async saveTax2307PrintSettings(): Promise<void> {
    if (this.isSavingTax2307PrintSettings) {
      return;
    }

    this.isSavingTax2307PrintSettings = true;
    this.tax2307PrintSettingsNotice = '';

    const persistedToDatabase = await this.persistTax2307PrintSettings();
    this.tax2307PrintSettingsNotice = persistedToDatabase
      ? 'Saved to database.'
      : 'Unable to reach database. Saved in this browser as fallback.';

    this.isSavingTax2307PrintSettings = false;
  }

  async resetTax2307PrintSettings(): Promise<void> {
    this.tax2307PrintSettings = this.createDefaultTax2307PrintSettings();
    this.signatoryImagePreview = null;
    this.signatoryUploadError = '';
    if (this.isSavingTax2307PrintSettings) {
      return;
    }

    this.isSavingTax2307PrintSettings = true;
    const persistedToDatabase = await this.persistTax2307PrintSettings();
    this.tax2307PrintSettingsNotice = persistedToDatabase
      ? 'Reset to defaults and saved to database.'
      : 'Reset to defaults and saved in this browser as fallback.';
    this.isSavingTax2307PrintSettings = false;
  }

  async saveGeneralJournalPrintSettings(): Promise<void> {
    if (this.isSavingGeneralJournalPrintSettings) {
      return;
    }

    this.isSavingGeneralJournalPrintSettings = true;
    this.generalJournalPrintSettingsNotice = '';

    const persistedToDatabase = await this.persistGeneralJournalPrintSettings();
    this.generalJournalPrintSettingsNotice = persistedToDatabase
      ? 'Saved to database.'
      : 'Unable to reach database. Saved in this browser as fallback.';

    this.isSavingGeneralJournalPrintSettings = false;
  }

  async resetGeneralJournalPrintSettings(): Promise<void> {
    this.generalJournalPrintSettings = this.createDefaultGeneralJournalPrintSettings();
    if (this.isSavingGeneralJournalPrintSettings) {
      return;
    }

    this.isSavingGeneralJournalPrintSettings = true;
    const persistedToDatabase = await this.persistGeneralJournalPrintSettings();
    this.generalJournalPrintSettingsNotice = persistedToDatabase
      ? 'Reset to defaults and saved to database.'
      : 'Reset to defaults and saved in this browser as fallback.';
    this.isSavingGeneralJournalPrintSettings = false;
  }

  async saveDisbursementRegisterPrintSettings(): Promise<void> {
    if (this.isSavingDisbursementRegisterPrintSettings) {
      return;
    }

    this.isSavingDisbursementRegisterPrintSettings = true;
    this.disbursementRegisterPrintSettingsNotice = '';

    const persistedToDatabase = await this.persistDisbursementRegisterPrintSettings();
    this.disbursementRegisterPrintSettingsNotice = persistedToDatabase
      ? 'Saved to database.'
      : 'Unable to reach database. Saved in this browser as fallback.';

    this.isSavingDisbursementRegisterPrintSettings = false;

    // Close drawer after save to apply changes to main table and provide visual feedback
    setTimeout(() => this.closeDisbursementRegisterPrintSettingsDrawer(), 500);
  }

  async resetDisbursementRegisterPrintSettings(): Promise<void> {
    this.disbursementRegisterPrintSettings = this.createDefaultDisbursementRegisterPrintSettings();
    if (this.isSavingDisbursementRegisterPrintSettings) {
      return;
    }

    this.isSavingDisbursementRegisterPrintSettings = true;
    const persistedToDatabase = await this.persistDisbursementRegisterPrintSettings();
    this.disbursementRegisterPrintSettingsNotice = persistedToDatabase
      ? 'Reset to defaults and saved to database.'
      : 'Reset to defaults and saved in this browser as fallback.';
    this.isSavingDisbursementRegisterPrintSettings = false;

    // Close drawer after reset to apply changes to main table
    setTimeout(() => this.closeDisbursementRegisterPrintSettingsDrawer(), 500);
  }

  addDisbursementDefaultColumn(): void {
    if (this.disbursementRegisterPrintSettings.defaultColumns.length >= 12) {
      return;
    }

    this.disbursementRegisterPrintSettings.defaultColumns = [
      ...this.disbursementRegisterPrintSettings.defaultColumns,
      {
        id: `col-${Date.now()}`,
        accountNumber: '',
        label: '',
        side: 'DR',
      },
    ];
  }

  removeDisbursementDefaultColumn(index: number): void {
    this.disbursementRegisterPrintSettings.defaultColumns =
      this.disbursementRegisterPrintSettings.defaultColumns.filter((_, i) => i !== index);
  }

  getDisbursementBaseColumnOptions(): Array<{ key: DisbursementBaseColumnKey; label: string }> {
    return [
      { key: 'date', label: 'Date' },
      { key: 'referenceNo', label: 'Reference #' },
      { key: 'checkNo', label: 'Check No.' },
      { key: 'payee', label: 'Payee' },
      { key: 'description', label: 'Description' },
      { key: 'tinNumber', label: 'TIN' },
      { key: 'address', label: 'Address' },
      { key: 'zipCode', label: 'Zip Code' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'invoiceDate', label: 'Invoice Date' },
      { key: 'voucherType', label: 'Voucher Type' },
      { key: 'preparedBy', label: 'Prepared By' },
      { key: 'releasedAt', label: 'Released At' },
      { key: 'bankName', label: 'Bank Name' },
      { key: 'chequeDate', label: 'Cheque Date' },
    ];
  }

  addDisbursementBaseColumn(): void {
    if (this.disbursementRegisterPrintSettings.baseColumns.length >= 10) {
      return;
    }

    this.disbursementRegisterPrintSettings.baseColumns = [
      ...this.disbursementRegisterPrintSettings.baseColumns,
      {
        id: `dbc-${Date.now()}`,
        key: 'description',
        label: 'Description',
      },
    ];
  }

  removeDisbursementBaseColumn(index: number): void {
    if (this.disbursementRegisterPrintSettings.baseColumns.length <= 1) {
      return;
    }

    this.disbursementRegisterPrintSettings.baseColumns = this.disbursementRegisterPrintSettings.baseColumns.filter(
      (_, i) => i !== index,
    );
  }

  moveDisbursementBaseColumn(index: number, direction: 'up' | 'down'): void {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.disbursementRegisterPrintSettings.baseColumns.length) {
      return;
    }

    const columns = [...this.disbursementRegisterPrintSettings.baseColumns];
    const [item] = columns.splice(index, 1);
    columns.splice(targetIndex, 0, item);
    this.disbursementRegisterPrintSettings.baseColumns = columns;
  }

  getDisbursementBaseColumnValue(cv: ChequeVoucherReleasedRecord, column: DisbursementBaseColumn): string {
    switch (column.key) {
      case 'date':
        return this.formatDateOnly(cv.voucherDate) || '-';
      case 'referenceNo':
        return cv.cvNo || '-';
      case 'checkNo':
        return cv.deposits.map((deposit) => deposit.chequeNo).filter(Boolean).join(', ') || '-';
      case 'payee':
        return cv.payee || '-';
      case 'description':
        return cv.particulars || '-';
      case 'tinNumber':
        return cv.tinNumber || '-';
      case 'address':
        return cv.address || '-';
      case 'zipCode':
        return cv.zipCode || '-';
      case 'invoice':
        return cv.invoices.map((invoice) => invoice.invoiceNo).filter(Boolean).join(', ') || '-';
      case 'invoiceDate':
        return cv.invoices
          .map((invoice) => this.formatDateOnly(invoice.invoiceDate || ''))
          .filter(Boolean)
          .join(', ') || '-';
      case 'voucherType':
        return cv.voucherType || '-';
      case 'preparedBy':
        return cv.preparedBy || '-';
      case 'releasedAt':
        return this.formatDateOnly(cv.releasedAt || '') || '-';
      case 'bankName':
        return cv.deposits.map((deposit) => deposit.bankName).filter(Boolean).join(', ') || '-';
      case 'chequeDate':
        return cv.deposits.map((deposit) => this.formatDateOnly(deposit.chequeDate || '')).filter(Boolean).join(', ') || '-';
      default:
        return '-';
    }
  }

  getDisbursementBaseColumns(): DisbursementBaseColumn[] {
    return this.disbursementRegisterPrintSettings.baseColumns;
  }

  cancelEditVoucher(): void {
    this.isEditingViewingVoucher = false;
  }

  cancelEditGeneralJournal(): void {
    this.isEditingGeneralJournalView = false;
  }

  addEditingGeneralJournalSundry(): void {
    if (!this.canManageGeneralJournal() || !this.isEditingGeneralJournalView) {
      return;
    }
    this.editingGeneralJournalForm.sundries = [
      ...this.editingGeneralJournalForm.sundries,
      this.createJournalSundryDraft(),
    ];
  }

  removeEditingGeneralJournalSundry(index: number): void {
    if (!this.canManageGeneralJournal() || !this.isEditingGeneralJournalView) {
      return;
    }
    if (this.editingGeneralJournalForm.sundries.length <= 1) {
      return;
    }
    this.editingGeneralJournalForm.sundries = this.editingGeneralJournalForm.sundries.filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  async saveVoucherEdit(): Promise<void> {
    if (this.isSavingVoucherEdit || !this.viewingVoucher) {
      return;
    }

    if (!String(this.editingVoucherForm.payee ?? '').trim()) {
      this.reportError = 'Payee is required.';
      return;
    }

    this.isSavingVoucherEdit = true;
    this.reportError = '';

    try {
      const cvNo = this.viewingVoucher.cvNo;
      const payload = {
        voucherType: this.editingVoucherForm.voucherType,
        payee: this.editingVoucherForm.payee,
        voucherDate: this.editingVoucherForm.voucherDate,
        tinNumber: this.editingVoucherForm.tinNumber,
        address: this.editingVoucherForm.address,
        zipCode: this.editingVoucherForm.zipCode,
        particulars: this.editingVoucherForm.particulars,
        deposits: this.editingVoucherForm.deposits.map((row) => ({
          bankName: row.bankName,
          chequeNo: row.chequeNo,
          chequeDate: row.chequeDate,
          amount: Number(row.amount) || 0,
        })),
        invoices: this.editingVoucherForm.invoices.map((row) => ({
          invoiceNo: row.invoiceNo,
          invoiceDate: row.invoiceDate,
          description: row.description,
          amount: Number(row.amount) || 0,
        })),
        accountTitles: this.editingVoucherForm.accountTitles.map((row) => ({
          accountNumber: row.accountNumber,
          description: row.description,
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        })),
      };

      const response = await apiClient.patch<{ success: boolean; data?: ChequeVoucherReleasedRecord }>(
        `/accounting/cheque-vouchers/${encodeURIComponent(cvNo)}`,
        payload,
      );

      if (!response.data?.success || !response.data.data) {
        this.reportError = 'Unable to save voucher changes.';
        return;
      }

      const updated = response.data.data;
      this.viewingVoucher = updated;
      const idx = this.releasedChequeVouchers.findIndex((v) => v.cvNo === cvNo);
      if (idx >= 0) {
        this.releasedChequeVouchers = [
          ...this.releasedChequeVouchers.slice(0, idx),
          updated,
          ...this.releasedChequeVouchers.slice(idx + 1),
        ];
      }
      this.isEditingViewingVoucher = false;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.reportError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to save voucher changes.';
      } else {
        this.reportError = 'Unable to save voucher changes.';
      }
    } finally {
      this.isSavingVoucherEdit = false;
    }
  }

  async saveGeneralJournalEdit(): Promise<void> {
    if (this.isSavingGeneralJournalEdit || !this.viewingGeneralJournal) {
      return;
    }

    if (!String(this.editingGeneralJournalForm.description ?? '').trim()) {
      this.reportError = 'Description is required.';
      return;
    }

    if (!String(this.editingGeneralJournalForm.journalDate ?? '').trim()) {
      this.reportError = 'Journal date is required.';
      return;
    }

    const lines = this.editingGeneralJournalForm.sundries
      .map((row) => ({
        accountNumber: String(row.accountNumber ?? '').trim(),
        description: String(row.description ?? '').trim(),
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
      }))
      .filter((row) => row.accountNumber || row.description || row.debit > 0 || row.credit > 0);

    if (lines.length === 0) {
      this.reportError = 'Add at least one journal line.';
      return;
    }

    const hasIncompleteLine = lines.some((row) => !row.accountNumber || !row.description);
    if (hasIncompleteLine) {
      this.reportError = 'Each line needs account number and description.';
      return;
    }

    const debitTotal = lines.reduce((sum, row) => sum + row.debit, 0);
    const creditTotal = lines.reduce((sum, row) => sum + row.credit, 0);
    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      this.reportError = 'Total debit and credit must be equal.';
      return;
    }

    this.isSavingGeneralJournalEdit = true;
    this.reportError = '';

    try {
      const journalNumber = this.viewingGeneralJournal.journalNumber;
      const response = await apiClient.patch<{ success: boolean; data?: GeneralJournalReleasedRecord }>(
        `/accounting/general-journals/${encodeURIComponent(journalNumber)}`,
        {
          journalDate: this.editingGeneralJournalForm.journalDate,
          description: this.editingGeneralJournalForm.description,
          sundries: lines,
        },
      );

      if (!response.data?.success || !response.data.data) {
        this.reportError = 'Unable to save general journal changes.';
        return;
      }

      const updated = response.data.data;
      this.viewingGeneralJournal = updated;
      const idx = this.releasedGeneralJournals.findIndex((entry) => entry.journalNumber === journalNumber);
      if (idx >= 0) {
        this.releasedGeneralJournals = [
          ...this.releasedGeneralJournals.slice(0, idx),
          updated,
          ...this.releasedGeneralJournals.slice(idx + 1),
        ];
      }
      this.isEditingGeneralJournalView = false;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.reportError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to save general journal changes.';
      } else {
        this.reportError = 'Unable to save general journal changes.';
      }
    } finally {
      this.isSavingGeneralJournalEdit = false;
    }
  }

  get editingVoucherDepositTotal(): number {
    return this.editingVoucherForm.deposits.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }

  get editingVoucherInvoiceTotal(): number {
    return this.editingVoucherForm.invoices.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }

  get editingVoucherDebitTotal(): number {
    return this.editingVoucherForm.accountTitles.reduce((sum, row) => sum + (Number(row.debit) || 0), 0);
  }

  get editingVoucherCreditTotal(): number {
    return this.editingVoucherForm.accountTitles.reduce((sum, row) => sum + (Number(row.credit) || 0), 0);
  }

  addEditDeposit(): void {
    this.editingVoucherForm.deposits = [...this.editingVoucherForm.deposits, this.createChequeDepositDraft()];
  }

  removeEditDeposit(index: number): void {
    if (this.editingVoucherForm.deposits.length <= 1) {
      return;
    }
    this.editingVoucherForm.deposits = this.editingVoucherForm.deposits.filter((_, i) => i !== index);
  }

  addEditInvoice(): void {
    this.editingVoucherForm.invoices = [...this.editingVoucherForm.invoices, this.createInvoiceDraft()];
  }

  removeEditInvoice(index: number): void {
    if (this.editingVoucherForm.invoices.length <= 1) {
      return;
    }
    this.editingVoucherForm.invoices = this.editingVoucherForm.invoices.filter((_, i) => i !== index);
  }

  addEditAccountTitle(): void {
    this.editingVoucherForm.accountTitles = [...this.editingVoucherForm.accountTitles, this.createAccountTitleDraft()];
  }

  removeEditAccountTitle(index: number): void {
    if (this.editingVoucherForm.accountTitles.length <= 1) {
      return;
    }
    this.editingVoucherForm.accountTitles = this.editingVoucherForm.accountTitles.filter((_, i) => i !== index);
  }

  clearChequeVoucherFilters(): void {
    this.applyDefaultChequeVoucherDateRange();
    this.voucherSearchQuery = '';
    this.chequeVoucherPagination.page = 1;
    void this.loadReleasedChequeVouchers();
  }

  clearChequeVoucherSearchFilters(): void {
    this.voucherSearchQuery = '';
    this.chequeVoucherPagination.page = 1;
    void this.loadReleasedChequeVouchers(this.chequeVoucherListDateFrom, this.chequeVoucherListDateTo);
  }

  applyChequeVoucherFilters(): void {
    this.chequeVoucherPagination.page = 1;
    void this.loadReleasedChequeVouchers(this.chequeVoucherListDateFrom, this.chequeVoucherListDateTo);
  }

  applyTax2307Filters(): void {
    if (this.tax2307DateFrom && this.tax2307DateTo) {
      const fromDate = new Date(this.tax2307DateFrom);
      const toDate = new Date(this.tax2307DateTo);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && fromDate > toDate) {
        this.reportError = 'From date must not be later than To date for 2307 report.';
        return;
      }
    }

    this.reportError = '';
    // Reload cheque voucher data with the new date range
    this.tax2307Pagination.page = 1;
    void this.loadTax2307ReportPaginated();
  }

  clearTax2307Filters(): void {
    this.applyDefaultTax2307DateRange();
    this.tax2307SearchQuery = '';
    this.tax2307SupplierFilter = '';
    this.tax2307Pagination.page = 1;
    this.reportError = '';
  }

  onPageChange(report: string, page: number): void {
    const pagination = this.getPaginationState(report);
    if (!pagination) return;

    if (page < 1 || page > pagination.totalPages) return;
    pagination.page = page;
    void this.reloadReportForPagination(report);
  }

  onPageSizeChange(report: string, pageSize: number): void {
    const pagination = this.getPaginationState(report);
    if (!pagination) return;

    pagination.pageSize = pageSize;
    pagination.page = 1;
    void this.reloadReportForPagination(report);
  }

  private getPaginationState(report: string): PaginationState | null {
    switch (report) {
      case 'cheque-voucher': return this.chequeVoucherPagination;
      case 'general-journal-register': return this.generalJournalPagination;
      case 'sales-register': return this.salesRegisterPagination;
      case 'tax-2307-report': return this.tax2307Pagination;
      case 'disbursement-register': return this.disbursementPagination;
      case 'weekly-sales': return this.weeklySalesPagination;
      case 'daily-unit-released': return this.dailyUnitReleasedPagination;
      case 'low-stocks-report': return this.lowStocksPagination;
      default: return null;
    }
  }

  private async reloadReportForPagination(report: string): Promise<void> {
    switch (report) {
      case 'cheque-voucher':
        await this.loadReleasedChequeVouchers(this.chequeVoucherListDateFrom, this.chequeVoucherListDateTo);
        break;
      case 'general-journal-register':
        await this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo);
        break;
      case 'sales-register':
        this.isLoadingReport = true;
        this.reportError = '';
        try {
          await this.loadSalesRegisterPaginated();
        } catch (error: unknown) {
          this.reportError = this.extractErrorMessage(error, 'Unable to load accounting report');
        } finally {
          this.isLoadingReport = false;
        }
        break;
      case 'weekly-sales':
        this.isLoadingReport = true;
        this.reportError = '';
        try {
          await this.loadWeeklySalesPaginated();
        } catch (error: unknown) {
          this.reportError = this.extractErrorMessage(error, 'Unable to load accounting report');
        } finally {
          this.isLoadingReport = false;
        }
        break;
      case 'daily-unit-released':
        this.isLoadingReport = true;
        this.reportError = '';
        try {
          await this.loadDailyUnitReleasedPaginated();
        } catch (error: unknown) {
          this.reportError = this.extractErrorMessage(error, 'Unable to load accounting report');
        } finally {
          this.isLoadingReport = false;
        }
        break;
      case 'low-stocks-report':
        this.isLoadingReport = true;
        this.reportError = '';
        try {
          await this.loadLowStockReport();
        } catch (error: unknown) {
          this.reportError = this.extractErrorMessage(error, 'Unable to load accounting report');
        } finally {
          this.isLoadingReport = false;
        }
        break;
      case 'tax-2307-report':
        this.isLoadingReport = true;
        this.reportError = '';
        try {
          await this.loadTax2307ReportPaginated();
        } catch (error: unknown) {
          this.reportError = this.extractErrorMessage(error, 'Unable to load accounting report');
        } finally {
          this.isLoadingReport = false;
        }
        break;
      case 'disbursement-register':
        await this.loadDisbursementRegister();
        break;
    }
  }

  async viewTax2307Row(row: Tax2307ReportRow): Promise<void> {
    const summary = this.createSupplierSummaryFromRows([row], {
      supplierName: row.supplierName,
      tin: row.tin,
    });

    if (!summary) {
      this.reportError = 'Unable to prepare 2307 form for the selected row.';
      return;
    }

    await this.generateTax2307FormsPdf([summary], false, true);
  }

  async generateTax2307Forms(): Promise<void> {
    const summaries = this.getTax2307SupplierSummaries();
    if (summaries.length === 0) {
      this.reportError = 'No supplier rows available for 2307 form generation.';
      return;
    }

    await this.generateTax2307FormsPdf(summaries, false);
  }

  getReleasedVoucherAmountTotal(voucher: ChequeVoucherReleasedRecord): number {
    const invoiceTotal = voucher.invoices.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    if (invoiceTotal > 0) {
      return invoiceTotal;
    }

    return voucher.deposits.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  getVoucherPurchasesDebit(voucher: ChequeVoucherReleasedRecord): number {
    const purchasesRow = voucher.accountTitles.find(
      (at) => String(at.description ?? '').toLowerCase().includes('purchases'),
    );
    return Number(purchasesRow?.debit) || 0;
  }

  getVoucherAccountTitleDebitTotal(voucher: ChequeVoucherReleasedRecord): number {
    return voucher.accountTitles.reduce((sum, row) => sum + (Number(row.debit) || 0), 0);
  }

  getVoucherAccountTitleCreditTotal(voucher: ChequeVoucherReleasedRecord): number {
    return voucher.accountTitles.reduce((sum, row) => sum + (Number(row.credit) || 0), 0);
  }

  async onAccountTitleBlur(index: number): Promise<void> {
    const item = this.chequeVoucherForm.accountTitles[index];
    if (!item) {
      return;
    }

    const accountNumber = String(item.accountNumber ?? '').trim();
    const description = String(item.description ?? '').trim();
    if (!accountNumber || !description) {
      return;
    }

    const exists = this.accountTitleCatalog.some((entry) =>
      String(entry.accountNumber).trim() === accountNumber &&
      String(entry.description).trim().toLowerCase() === description.toLowerCase(),
    );

    if (exists) {
      return;
    }

    try {
      const response = await apiClient.post<{ success: boolean; data?: { accountNumber?: string; description?: string } }>(
        '/accounting/account-titles',
        {
          accountNumber,
          description,
        },
      );

      if (!response.data?.success) {
        return;
      }

      this.accountTitleCatalog = [...this.accountTitleCatalog, {
        accountNumber,
        description,
        debit: 0,
        credit: 0,
      }];
    } catch {
    }
  }

  async releaseChequeVoucher(): Promise<void> {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    if (this.isSavingChequeVoucher) {
      return;
    }

    const debitTotal = this.chequeVoucherDebitTotal;
    const creditTotal = this.chequeVoucherCreditTotal;

    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      this.reportError = 'Total debit must equal total credit.';
      return;
    }

    if (!String(this.chequeVoucherForm.payee ?? '').trim()) {
      this.reportError = 'Payee is required before releasing voucher.';
      return;
    }

    this.isSavingChequeVoucher = true;
    this.reportError = '';

    try {
      const payload = {
        voucherType: this.chequeVoucherForm.voucherType,
        payee: this.chequeVoucherForm.payee,
        voucherDate: this.chequeVoucherForm.voucherDate,
        tinNumber: this.chequeVoucherForm.tinNumber,
        address: this.chequeVoucherForm.address,
        zipCode: this.chequeVoucherForm.zipCode,
        particulars: this.chequeVoucherForm.particulars,
        deposits: this.chequeVoucherForm.deposits.map((row) => ({
          bankName: row.bankName,
          chequeNo: row.chequeNo,
          chequeDate: row.chequeDate,
          amount: Number(row.amount) || 0,
        })),
        invoices: this.chequeVoucherForm.invoices.map((row) => ({
          invoiceNo: row.invoiceNo,
          invoiceDate: row.invoiceDate,
          description: row.description,
          amount: Number(row.amount) || 0,
        })),
        accountTitles: this.chequeVoucherForm.accountTitles.map((row) => ({
          accountNumber: row.accountNumber,
          description: row.description,
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        })),
      };

      const response = await apiClient.post<{ success: boolean; data?: ChequeVoucherReleasedRecord }>(
        '/accounting/cheque-vouchers/release',
        payload,
      );

      if (!response.data?.success || !response.data.data) {
        this.reportError = 'Unable to release cheque voucher.';
        return;
      }

      await this.loadReleasedChequeVouchers(this.chequeVoucherListDateFrom, this.chequeVoucherListDateTo);
      await this.loadAccountTitles();
      await this.resetChequeVoucherDraft();
      this.closeChequeVoucherDrawer();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.reportError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to release cheque voucher.';
      } else {
        this.reportError = 'Unable to release cheque voucher.';
      }
    } finally {
      this.isSavingChequeVoucher = false;
    }
  }

  removeAccountTitle(index: number): void {
    if (!this.canEditSelectedReportDraft()) {
      return;
    }

    if (this.chequeVoucherForm.accountTitles.length <= 1) {
      return;
    }

    this.chequeVoucherForm.accountTitles = this.chequeVoucherForm.accountTitles.filter((_, itemIndex) => itemIndex !== index);
  }

  addJournalSundry(): void {
    if (!this.canManageGeneralJournal()) {
      return;
    }

    this.generalJournalForm.sundries = [...this.generalJournalForm.sundries, this.createJournalSundryDraft()];
  }

  removeJournalSundry(index: number): void {
    if (!this.canManageGeneralJournal()) {
      return;
    }

    if (this.generalJournalForm.sundries.length <= 1) {
      return;
    }

    this.generalJournalForm.sundries = this.generalJournalForm.sundries.filter((_, itemIndex) => itemIndex !== index);
  }

  formatDateOnly(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(value);
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private initializeDateRange(): void {
    const currentDate = new Date();
    const fromDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
    this.reportDateFrom = this.formatDateOnly(fromDate.toISOString());
    this.reportDateTo = this.formatDateOnly(currentDate.toISOString());
  }

  private async loadBusinessProfile(): Promise<void> {
    try {
      this.businessProfile = await this.businessSettingsService.getBusinessProfile();
    } catch {
      // non-critical — print will fall back to defaults
    }

    await Promise.all([
      this.loadChequeVoucherPrintSettings(),
      this.loadTax2307PrintSettings(),
      this.loadGeneralJournalPrintSettings(),
    ]);
  }

  private createDefaultChequeVoucherPrintSettings(): ChequeVoucherPrintSettings {
    const defaultAddress = String(this.businessProfile?.printAddressDetails ?? this.businessProfile?.businessAddress ?? '').trim();

    return {
      showHeader: this.parsePrintBool(this.businessProfile?.printReportShowHeader, true),
      showLogo: this.parsePrintBool(this.businessProfile?.printShowLogo, true),
      showAddress: this.parsePrintBool(this.businessProfile?.printAddressShowAccounting, true),
      showPreparedBy: this.parsePrintBool(this.businessProfile?.printCvShowPreparedBy, true),
      showSignatureLine: this.parsePrintBool(this.businessProfile?.printCvShowSignatureLine, false),
      paperSize: 'A4',
      orientation: 'portrait',
      customWidthMm: 210,
      customHeightMm: 297,
      marginTopMm: 15,
      marginRightMm: 15,
      marginBottomMm: 15,
      marginLeftMm: 15,
      defaultAddress,
      footerLeft: '',
      footerCenter: '',
      footerRight: '',
      signatories: this.createDefaultChequeVoucherSignatories(),
    };
  }

  private createDefaultTax2307PrintSettings(): Tax2307PrintSettings {
    return {
      showHeader: true,
      showLogo: this.parsePrintBool(this.businessProfile?.printShowLogo, true),
      showAddress: this.parsePrintBool(this.businessProfile?.printAddressShowAccounting, true),
      paperSize: 'A4',
      orientation: 'portrait',
      customWidthMm: 210,
      customHeightMm: 297,
      marginTopMm: 15,
      marginRightMm: 15,
      marginBottomMm: 15,
      marginLeftMm: 15,
      footerLeft: '',
      footerCenter: '',
      footerRight: '',
      signatoryName: '',
      signatoryTitle: '',
      signatoryTin: '',
      signatoryImage: '',
    };
  }

  private createDefaultGeneralJournalPrintSettings(): GeneralJournalPrintSettings {
    return {
      showHeader: true,
      showLogo: this.parsePrintBool(this.businessProfile?.printShowLogo, true),
      showAddress: this.parsePrintBool(this.businessProfile?.printAddressShowAccounting, true),
      paperSize: 'A4',
      orientation: 'portrait',
      customWidthMm: 210,
      customHeightMm: 297,
      marginTopMm: 15,
      marginRightMm: 15,
      marginBottomMm: 15,
      marginLeftMm: 15,
      footerLeft: '',
      footerCenter: '',
      footerRight: '',
      signatories: this.createDefaultGeneralJournalSignatories(),
    };
  }

  private createDefaultChequeVoucherSignatories(): ChequeVoucherSignatoryConfig[] {
    return [
      {
        id: 'prepared-by',
        label: 'Prepared by',
        valueSource: 'prepared_by',
        customValue: '',
        signatureSource: 'preparedBy',
      },
      {
        id: 'checked-by',
        label: 'Checked by',
        valueSource: 'custom',
        customValue: '',
        signatureSource: 'checkedBy',
      },
      {
        id: 'approved-by',
        label: 'Approved by',
        valueSource: 'custom',
        customValue: '',
        signatureSource: 'approvedBy',
      },
    ];
  }

  private createDefaultGeneralJournalSignatories(): ChequeVoucherSignatoryConfig[] {
    return [
      { id: 'gj-prepared-by', label: 'Prepared by', valueSource: 'custom', customValue: '', signatureSource: 'preparedBy' },
      { id: 'gj-checked-by', label: 'Checked by', valueSource: 'custom', customValue: '', signatureSource: 'checkedBy' },
      { id: 'gj-approved-by', label: 'Approved by', valueSource: 'custom', customValue: '', signatureSource: 'approvedBy' },
    ];
  }

  private createDefaultDisbursementRegisterPrintSettings(): DisbursementRegisterPrintSettings {
    return {
      showHeader: true,
      showLogo: this.parsePrintBool(this.businessProfile?.printShowLogo, true),
      showAddress: this.parsePrintBool(this.businessProfile?.printAddressShowAccounting, true),
      baseColumns: this.createDefaultDisbursementBaseColumns(),
      paperSize: 'LEGAL',
      orientation: 'landscape',
      customWidthMm: 355,
      customHeightMm: 216,
      marginTopMm: 10,
      marginRightMm: 10,
      marginBottomMm: 10,
      marginLeftMm: 10,
      footerLeft: '',
      footerCenter: '',
      footerRight: '',
      defaultColumns: [
        { id: 'dc-default-0', accountNumber: '11001', label: 'Cash In Bank', side: 'CR' },
        { id: 'dc-default-1', accountNumber: '12001', label: 'Expanded Withholding Tax', side: 'DR' },
        { id: 'dc-default-2', accountNumber: '14001', label: 'Purchases', side: 'DR' },
        { id: 'dc-default-3', accountNumber: '14010', label: 'Input Tax', side: 'DR' },
        { id: 'dc-default-4', accountNumber: '15001', label: 'DC-Outside Services', side: 'DR' },
        { id: 'dc-default-5', accountNumber: '15002', label: 'DC-Materials', side: 'DR' },
        { id: 'dc-default-6', accountNumber: '15003', label: 'DC-Others', side: 'DR' },
      ],
    };
  }

  private createDefaultDisbursementBaseColumns(): DisbursementBaseColumn[] {
    return [
      { id: 'dbc-date', key: 'date', label: 'Date' },
      { id: 'dbc-reference', key: 'referenceNo', label: 'Reference #' },
      { id: 'dbc-check', key: 'checkNo', label: 'Check No.' },
      { id: 'dbc-payee', key: 'payee', label: 'Payee' },
      { id: 'dbc-description', key: 'description', label: 'Description' },
    ];
  }

  private normalizeDisbursementBaseColumns(
    value: unknown,
    defaults: DisbursementBaseColumn[],
  ): DisbursementBaseColumn[] {
    if (!Array.isArray(value)) {
      return defaults.map((column) => ({ ...column }));
    }

    const allowedKeys = new Set<DisbursementBaseColumnKey>([
      'date',
      'referenceNo',
      'checkNo',
      'payee',
      'description',
      'tinNumber',
      'address',
      'zipCode',
      'invoice',
      'invoiceDate',
      'voucherType',
      'preparedBy',
      'releasedAt',
      'bankName',
      'chequeDate',
    ]);

    const normalized = value
      .map((item, index) => {
        const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const rawKey = String(source['key'] ?? '').trim() as DisbursementBaseColumnKey;
        const fallbackKey = defaults[Math.min(index, defaults.length - 1)]?.key ?? 'description';
        const key = allowedKeys.has(rawKey) ? rawKey : fallbackKey;

        const fallbackLabel = defaults.find((d) => d.key === key)?.label ?? 'Column';
        const label = String(source['label'] ?? '').trim().slice(0, 60) || fallbackLabel;

        return {
          id: String(source['id'] ?? '').trim() || `dbc-${Date.now()}-${index}`,
          key,
          label,
        } as DisbursementBaseColumn;
      })
      .slice(0, 10);

    return normalized.length > 0 ? normalized : defaults.map((column) => ({ ...column }));
  }

  private normalizeDisbursementDefaultColumns(
    value: unknown,
    defaults: DisbursementDefaultColumn[],
  ): DisbursementDefaultColumn[] {
    if (!Array.isArray(value)) {
      return defaults.map((c) => ({ ...c }));
    }

    const normalized = value
      .map((item) => {
        const src = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const side = String(src['side'] ?? '').trim().toUpperCase();
        return {
          id: String(src['id'] ?? '').trim() || `col-${Date.now()}`,
          accountNumber: String(src['accountNumber'] ?? '').trim().slice(0, 30),
          label: String(src['label'] ?? '').trim().slice(0, 80),
          side: side === 'CR' ? 'CR' : 'DR',
        } as DisbursementDefaultColumn;
      })
      .slice(0, 12);

    return normalized.length > 0 ? normalized : defaults.map((c) => ({ ...c }));
  }

  private normalizeDisbursementRegisterPrintSettings(
    payload: Partial<DisbursementRegisterPrintSettings> | null | undefined,
    defaults: DisbursementRegisterPrintSettings,
  ): DisbursementRegisterPrintSettings {
    const parseMargin = (value: unknown, fallback: number): number => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      if (n < 0) return 0;
      if (n > 50) return 50;
      return Number(n.toFixed(2));
    };

    const parseDim = (val: unknown, fb: number): number => {
      const n = Number(val);
      return Number.isFinite(n) && n >= 10 && n <= 1200 ? Number(n.toFixed(1)) : fb;
    };

    const legacyBaseColumns: DisbursementBaseColumn[] = [
      {
        id: 'legacy-date',
        key: 'date',
        label: String((payload as Record<string, unknown> | undefined)?.['dateHeader'] ?? 'Date').trim() || 'Date',
      },
      {
        id: 'legacy-reference',
        key: 'referenceNo',
        label: String((payload as Record<string, unknown> | undefined)?.['referenceHeader'] ?? 'Reference #').trim() || 'Reference #',
      },
      ...(Boolean((payload as Record<string, unknown> | undefined)?.['showChequeDetails'] ?? true)
        ? [{
            id: 'legacy-check',
            key: 'checkNo' as DisbursementBaseColumnKey,
            label: String((payload as Record<string, unknown> | undefined)?.['checkNoHeader'] ?? 'Check No.').trim() || 'Check No.',
          }]
        : []),
      {
        id: 'legacy-payee',
        key: 'payee',
        label: String((payload as Record<string, unknown> | undefined)?.['payeeHeader'] ?? 'Payee').trim() || 'Payee',
      },
      {
        id: 'legacy-description',
        key: 'description',
        label: String((payload as Record<string, unknown> | undefined)?.['descriptionHeader'] ?? 'Description').trim() || 'Description',
      },
    ];

    const paperSizeRaw = String(payload?.paperSize ?? '').trim().toUpperCase();
    const orientationRaw = String(payload?.orientation ?? '').trim().toLowerCase();
    const payloadBaseColumns = (payload as Record<string, unknown> | undefined)?.['baseColumns'];

    return {
      showHeader: typeof payload?.showHeader === 'boolean' ? payload.showHeader : defaults.showHeader,
      showLogo: typeof payload?.showLogo === 'boolean' ? payload.showLogo : defaults.showLogo,
      showAddress: typeof payload?.showAddress === 'boolean' ? payload.showAddress : defaults.showAddress,
      baseColumns: this.normalizeDisbursementBaseColumns(payloadBaseColumns ?? legacyBaseColumns, defaults.baseColumns),
      paperSize: paperSizeRaw === 'LETTER' || paperSizeRaw === 'LEGAL' || paperSizeRaw === 'A4' || paperSizeRaw === 'CUSTOM'
        ? (paperSizeRaw as DisbursementRegisterPrintSettings['paperSize'])
        : defaults.paperSize,
      orientation: orientationRaw === 'landscape' || orientationRaw === 'portrait'
        ? (orientationRaw as DisbursementRegisterPrintSettings['orientation'])
        : defaults.orientation,
      customWidthMm: parseDim(payload?.customWidthMm, defaults.customWidthMm),
      customHeightMm: parseDim(payload?.customHeightMm, defaults.customHeightMm),
      marginTopMm: parseMargin(payload?.marginTopMm, defaults.marginTopMm),
      marginRightMm: parseMargin(payload?.marginRightMm, defaults.marginRightMm),
      marginBottomMm: parseMargin(payload?.marginBottomMm, defaults.marginBottomMm),
      marginLeftMm: parseMargin(payload?.marginLeftMm, defaults.marginLeftMm),
      footerLeft: String(payload?.footerLeft ?? defaults.footerLeft ?? '').trim().slice(0, 200),
      footerCenter: String(payload?.footerCenter ?? defaults.footerCenter ?? '').trim().slice(0, 200),
      footerRight: String(payload?.footerRight ?? defaults.footerRight ?? '').trim().slice(0, 200),
      defaultColumns: this.normalizeDisbursementDefaultColumns(payload?.defaultColumns, defaults.defaultColumns),
    };
  }

  private async loadDisbursementRegisterPrintSettings(): Promise<void> {
    const defaults = this.createDefaultDisbursementRegisterPrintSettings();
    this.isLoadingDisbursementRegisterPrintSettings = true;

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: { settings?: Partial<DisbursementRegisterPrintSettings> };
      }>(`/accounting/report-print-settings/${this.disbursementRegisterPrintSettingsReportKey}`);

      const databaseSettings = response.data?.data?.settings;
      this.disbursementRegisterPrintSettings = this.normalizeDisbursementRegisterPrintSettings(databaseSettings, defaults);

      localStorage.setItem(
        this.disbursementRegisterPrintSettingsStorageKey,
        JSON.stringify(this.disbursementRegisterPrintSettings),
      );

      this.isLoadingDisbursementRegisterPrintSettings = false;
      return;
    } catch {
      // Database fallback to browser cache.
    }

    try {
      const raw = localStorage.getItem(this.disbursementRegisterPrintSettingsStorageKey);
      if (!raw) {
        this.disbursementRegisterPrintSettings = defaults;
        this.isLoadingDisbursementRegisterPrintSettings = false;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<DisbursementRegisterPrintSettings>;
      this.disbursementRegisterPrintSettings = this.normalizeDisbursementRegisterPrintSettings(parsed, defaults);
    } catch {
      this.disbursementRegisterPrintSettings = defaults;
    } finally {
      this.isLoadingDisbursementRegisterPrintSettings = false;
    }
  }

  private async persistDisbursementRegisterPrintSettings(): Promise<boolean> {
    try {
      await apiClient.put<{
        success: boolean;
        data?: { settings?: Partial<DisbursementRegisterPrintSettings> };
      }>(`/accounting/report-print-settings/${this.disbursementRegisterPrintSettingsReportKey}`, this.disbursementRegisterPrintSettings);

      localStorage.setItem(
        this.disbursementRegisterPrintSettingsStorageKey,
        JSON.stringify(this.disbursementRegisterPrintSettings),
      );
      return true;
    } catch {
      try {
        localStorage.setItem(
          this.disbursementRegisterPrintSettingsStorageKey,
          JSON.stringify(this.disbursementRegisterPrintSettings),
        );
      } catch {
        // Ignore.
      }
      return false;
    }
  }

  private createSignatoryId(): string {
    this.signatoryIdSeed += 1;
    return `sig-${Date.now()}-${this.signatoryIdSeed}`;
  }

  private normalizeChequeVoucherSignatories(
    value: unknown,
    defaults: ChequeVoucherSignatoryConfig[],
  ): ChequeVoucherSignatoryConfig[] {
    if (!Array.isArray(value)) {
      return defaults.map((item) => ({ ...item }));
    }

    const normalized = value
      .map((item, index) => {
        const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const valueSourceRaw = String(source['valueSource'] ?? '').trim().toLowerCase();
        const signatureSourceRaw = String(source['signatureSource'] ?? '').trim();
        const label = String(source['label'] ?? '').trim().slice(0, 80);

        return {
          id: String(source['id'] ?? '').trim() || this.createSignatoryId(),
          label: label || `Signatory ${index + 1}`,
          valueSource: valueSourceRaw === 'prepared_by' ? 'prepared_by' : 'custom',
          customValue: String(source['customValue'] ?? '').trim().slice(0, 120),
          signatureSource:
            signatureSourceRaw === 'preparedBy' ||
            signatureSourceRaw === 'checkedBy' ||
            signatureSourceRaw === 'approvedBy'
              ? signatureSourceRaw
              : 'none',
        } as ChequeVoucherSignatoryConfig;
      })
      .slice(0, 8);

    return normalized.length > 0 ? normalized : defaults.map((item) => ({ ...item }));
  }

  private normalizeChequeVoucherPrintSettings(
    payload: Partial<ChequeVoucherPrintSettings> | null | undefined,
    defaults: ChequeVoucherPrintSettings,
  ): ChequeVoucherPrintSettings {
    const parseMargin = (value: unknown, fallback: number): number => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) {
        return fallback;
      }
      if (normalized < 0) {
        return 0;
      }
      if (normalized > 50) {
        return 50;
      }
      return Number(normalized.toFixed(2));
    };

    const paperSizeRaw = String(payload?.paperSize ?? '').trim().toUpperCase();
    const orientationRaw = String(payload?.orientation ?? '').trim().toLowerCase();
    const parseDim = (val: unknown, fb: number): number => {
      const n = Number(val);
      return Number.isFinite(n) && n >= 10 && n <= 1200 ? Number(n.toFixed(1)) : fb;
    };

    return {
      showHeader: typeof payload?.showHeader === 'boolean' ? payload.showHeader : defaults.showHeader,
      showLogo: typeof payload?.showLogo === 'boolean' ? payload.showLogo : defaults.showLogo,
      showAddress: typeof payload?.showAddress === 'boolean' ? payload.showAddress : defaults.showAddress,
      showPreparedBy: typeof payload?.showPreparedBy === 'boolean' ? payload.showPreparedBy : defaults.showPreparedBy,
      showSignatureLine: typeof payload?.showSignatureLine === 'boolean' ? payload.showSignatureLine : defaults.showSignatureLine,
      paperSize: paperSizeRaw === 'LETTER' || paperSizeRaw === 'LEGAL' || paperSizeRaw === 'A4' || paperSizeRaw === 'CUSTOM'
        ? (paperSizeRaw as ChequeVoucherPrintSettings['paperSize'])
        : defaults.paperSize,
      orientation: orientationRaw === 'landscape' || orientationRaw === 'portrait'
        ? (orientationRaw as ChequeVoucherPrintSettings['orientation'])
        : defaults.orientation,
      customWidthMm: parseDim(payload?.customWidthMm, defaults.customWidthMm),
      customHeightMm: parseDim(payload?.customHeightMm, defaults.customHeightMm),
      marginTopMm: parseMargin(payload?.marginTopMm, defaults.marginTopMm),
      marginRightMm: parseMargin(payload?.marginRightMm, defaults.marginRightMm),
      marginBottomMm: parseMargin(payload?.marginBottomMm, defaults.marginBottomMm),
      marginLeftMm: parseMargin(payload?.marginLeftMm, defaults.marginLeftMm),
      defaultAddress: String(payload?.defaultAddress ?? defaults.defaultAddress ?? '').trim().slice(0, 300),
      footerLeft: String(payload?.footerLeft ?? defaults.footerLeft ?? '').trim().slice(0, 200),
      footerCenter: String(payload?.footerCenter ?? defaults.footerCenter ?? '').trim().slice(0, 200),
      footerRight: String(payload?.footerRight ?? defaults.footerRight ?? '').trim().slice(0, 200),
      signatories: this.normalizeChequeVoucherSignatories(payload?.signatories, defaults.signatories),
    };
  }

  private normalizeTax2307PrintSettings(
    payload: Partial<Tax2307PrintSettings> | null | undefined,
    defaults: Tax2307PrintSettings,
  ): Tax2307PrintSettings {
    const parseMargin = (value: unknown, fallback: number): number => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) {
        return fallback;
      }
      if (normalized < 0) {
        return 0;
      }
      if (normalized > 50) {
        return 50;
      }
      return Number(normalized.toFixed(2));
    };

    const paperSizeRaw = String(payload?.paperSize ?? '').trim().toUpperCase();
    const orientationRaw = String(payload?.orientation ?? '').trim().toLowerCase();
    const parseDim = (val: unknown, fb: number): number => {
      const n = Number(val);
      return Number.isFinite(n) && n >= 10 && n <= 1200 ? Number(n.toFixed(1)) : fb;
    };

    return {
      showHeader: typeof payload?.showHeader === 'boolean' ? payload.showHeader : defaults.showHeader,
      showLogo: typeof payload?.showLogo === 'boolean' ? payload.showLogo : defaults.showLogo,
      showAddress: typeof payload?.showAddress === 'boolean' ? payload.showAddress : defaults.showAddress,
      paperSize: paperSizeRaw === 'LETTER' || paperSizeRaw === 'LEGAL' || paperSizeRaw === 'A4' || paperSizeRaw === 'CUSTOM'
        ? (paperSizeRaw as Tax2307PrintSettings['paperSize'])
        : defaults.paperSize,
      orientation: orientationRaw === 'landscape' || orientationRaw === 'portrait'
        ? (orientationRaw as Tax2307PrintSettings['orientation'])
        : defaults.orientation,
      customWidthMm: parseDim(payload?.customWidthMm, defaults.customWidthMm),
      customHeightMm: parseDim(payload?.customHeightMm, defaults.customHeightMm),
      marginTopMm: parseMargin(payload?.marginTopMm, defaults.marginTopMm),
      marginRightMm: parseMargin(payload?.marginRightMm, defaults.marginRightMm),
      marginBottomMm: parseMargin(payload?.marginBottomMm, defaults.marginBottomMm),
      marginLeftMm: parseMargin(payload?.marginLeftMm, defaults.marginLeftMm),
      footerLeft: String(payload?.footerLeft ?? defaults.footerLeft ?? '').trim().slice(0, 200),
      footerCenter: String(payload?.footerCenter ?? defaults.footerCenter ?? '').trim().slice(0, 200),
      footerRight: String(payload?.footerRight ?? defaults.footerRight ?? '').trim().slice(0, 200),
      signatoryName: String(payload?.signatoryName ?? defaults.signatoryName ?? '').trim().slice(0, 120),
      signatoryTitle: String(payload?.signatoryTitle ?? defaults.signatoryTitle ?? '').trim().slice(0, 80),
      signatoryTin: String(payload?.signatoryTin ?? defaults.signatoryTin ?? '').trim().slice(0, 17),
      signatoryImage: String(payload?.signatoryImage ?? defaults.signatoryImage ?? ''),
    };
  }

  private normalizeGeneralJournalPrintSettings(
    payload: Partial<GeneralJournalPrintSettings> | null | undefined,
    defaults: GeneralJournalPrintSettings,
  ): GeneralJournalPrintSettings {
    const parseMargin = (value: unknown, fallback: number): number => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) {
        return fallback;
      }
      if (normalized < 0) {
        return 0;
      }
      if (normalized > 50) {
        return 50;
      }
      return Number(normalized.toFixed(2));
    };

    const paperSizeRaw = String(payload?.paperSize ?? '').trim().toUpperCase();
    const orientationRaw = String(payload?.orientation ?? '').trim().toLowerCase();
    const parseDim = (val: unknown, fb: number): number => {
      const n = Number(val);
      return Number.isFinite(n) && n >= 10 && n <= 1200 ? Number(n.toFixed(1)) : fb;
    };

    return {
      showHeader: typeof payload?.showHeader === 'boolean' ? payload.showHeader : defaults.showHeader,
      showLogo: typeof payload?.showLogo === 'boolean' ? payload.showLogo : defaults.showLogo,
      showAddress: typeof payload?.showAddress === 'boolean' ? payload.showAddress : defaults.showAddress,
      paperSize: paperSizeRaw === 'LETTER' || paperSizeRaw === 'LEGAL' || paperSizeRaw === 'A4' || paperSizeRaw === 'CUSTOM'
        ? (paperSizeRaw as GeneralJournalPrintSettings['paperSize'])
        : defaults.paperSize,
      orientation: orientationRaw === 'landscape' || orientationRaw === 'portrait'
        ? (orientationRaw as GeneralJournalPrintSettings['orientation'])
        : defaults.orientation,
      customWidthMm: parseDim(payload?.customWidthMm, defaults.customWidthMm),
      customHeightMm: parseDim(payload?.customHeightMm, defaults.customHeightMm),
      marginTopMm: parseMargin(payload?.marginTopMm, defaults.marginTopMm),
      marginRightMm: parseMargin(payload?.marginRightMm, defaults.marginRightMm),
      marginBottomMm: parseMargin(payload?.marginBottomMm, defaults.marginBottomMm),
      marginLeftMm: parseMargin(payload?.marginLeftMm, defaults.marginLeftMm),
      footerLeft: String(payload?.footerLeft ?? defaults.footerLeft ?? '').trim().slice(0, 200),
      footerCenter: String(payload?.footerCenter ?? defaults.footerCenter ?? '').trim().slice(0, 200),
      footerRight: String(payload?.footerRight ?? defaults.footerRight ?? '').trim().slice(0, 200),
      signatories: this.normalizeChequeVoucherSignatories(payload?.signatories, defaults.signatories),
    };
  }

  addChequeVoucherSignatory(): void {
    if (this.chequeVoucherPrintSettings.signatories.length >= 8) {
      return;
    }

    this.chequeVoucherPrintSettings.signatories = [
      ...this.chequeVoucherPrintSettings.signatories,
      {
        id: this.createSignatoryId(),
        label: `Signatory ${this.chequeVoucherPrintSettings.signatories.length + 1}`,
        valueSource: 'custom',
        customValue: '',
        signatureSource: 'none',
      },
    ];
  }

  removeChequeVoucherSignatory(index: number): void {
    if (index < 0 || index >= this.chequeVoucherPrintSettings.signatories.length) {
      return;
    }

    this.chequeVoucherPrintSettings.signatories = this.chequeVoucherPrintSettings.signatories.filter((_, itemIndex) => itemIndex !== index);
  }

  getSignatoryDisplayName(signatory: ChequeVoucherSignatoryConfig, voucher: ChequeVoucherReleasedRecord): string {
    if (signatory.valueSource === 'prepared_by') {
      return String(voucher.preparedBy ?? '').trim();
    }

    return String(signatory.customValue ?? '').trim();
  }

  getSignatoryPreviewName(signatory: ChequeVoucherSignatoryConfig): string {
    return this.getSignatoryDisplayName(signatory, this.getChequeVoucherPreviewData());
  }

  getSignatoryImageSrc(signatory: ChequeVoucherSignatoryConfig): string | null {
    const bp = this.businessProfile;

    if (signatory.signatureSource === 'preparedBy') {
      return bp?.printSignaturePreparedBy || null;
    }

    if (signatory.signatureSource === 'checkedBy') {
      return bp?.printSignatureCheckedBy || null;
    }

    if (signatory.signatureSource === 'approvedBy') {
      return bp?.printSignatureApprovedBy || null;
    }

    return null;
  }

  getActiveChequeVoucherSignatories(): ChequeVoucherSignatoryConfig[] {
    return this.chequeVoucherPrintSettings.signatories
      .map((item) => ({ ...item, label: String(item.label ?? '').trim() }))
      .filter((item) => item.label.length > 0)
      .slice(0, 8);
  }

  addGeneralJournalSignatory(): void {
    if (this.generalJournalPrintSettings.signatories.length >= 8) {
      return;
    }

    this.generalJournalPrintSettings.signatories = [
      ...this.generalJournalPrintSettings.signatories,
      {
        id: this.createSignatoryId(),
        label: `Signatory ${this.generalJournalPrintSettings.signatories.length + 1}`,
        valueSource: 'custom',
        customValue: '',
        signatureSource: 'none',
      },
    ];
  }

  removeGeneralJournalSignatory(index: number): void {
    if (index < 0 || index >= this.generalJournalPrintSettings.signatories.length) {
      return;
    }

    this.generalJournalPrintSettings.signatories = this.generalJournalPrintSettings.signatories.filter((_, i) => i !== index);
  }

  getActiveGeneralJournalSignatories(): ChequeVoucherSignatoryConfig[] {
    return this.generalJournalPrintSettings.signatories
      .map((item) => ({ ...item, label: String(item.label ?? '').trim() }))
      .filter((item) => item.label.length > 0)
      .slice(0, 8);
  }

  private async loadChequeVoucherPrintSettings(): Promise<void> {
    const defaults = this.createDefaultChequeVoucherPrintSettings();
    this.isLoadingChequeVoucherPrintSettings = true;

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: { settings?: Partial<ChequeVoucherPrintSettings> };
      }>(`/accounting/report-print-settings/${this.chequeVoucherPrintSettingsReportKey}`);

      const databaseSettings = response.data?.data?.settings;
      this.chequeVoucherPrintSettings = this.normalizeChequeVoucherPrintSettings(databaseSettings, defaults);

      localStorage.setItem(
        this.chequeVoucherPrintSettingsStorageKey,
        JSON.stringify(this.chequeVoucherPrintSettings),
      );

      this.isLoadingChequeVoucherPrintSettings = false;
      return;
    } catch {
      // Database fallback to browser cache.
    }

    try {
      const raw = localStorage.getItem(this.chequeVoucherPrintSettingsStorageKey);
      if (!raw) {
        this.chequeVoucherPrintSettings = defaults;
        this.isLoadingChequeVoucherPrintSettings = false;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<ChequeVoucherPrintSettings>;
      this.chequeVoucherPrintSettings = this.normalizeChequeVoucherPrintSettings(parsed, defaults);
    } catch {
      this.chequeVoucherPrintSettings = defaults;
    } finally {
      this.isLoadingChequeVoucherPrintSettings = false;
    }
  }

  private async persistChequeVoucherPrintSettings(): Promise<boolean> {
    try {
      await apiClient.put<{
        success: boolean;
        data?: { settings?: Partial<ChequeVoucherPrintSettings> };
      }>(`/accounting/report-print-settings/${this.chequeVoucherPrintSettingsReportKey}`, this.chequeVoucherPrintSettings);

      localStorage.setItem(
        this.chequeVoucherPrintSettingsStorageKey,
        JSON.stringify(this.chequeVoucherPrintSettings),
      );
      return true;
    } catch {
      try {
        localStorage.setItem(
          this.chequeVoucherPrintSettingsStorageKey,
          JSON.stringify(this.chequeVoucherPrintSettings),
        );
      } catch {
        // Ignore local storage failures and keep using in-memory settings.
      }
      return false;
    }
  }

  private async loadTax2307PrintSettings(): Promise<void> {
    const defaults = this.createDefaultTax2307PrintSettings();
    this.isLoadingTax2307PrintSettings = true;

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: { settings?: Partial<Tax2307PrintSettings> };
      }>(`/accounting/report-print-settings/${this.tax2307PrintSettingsReportKey}`);

      const databaseSettings = response.data?.data?.settings;
      this.tax2307PrintSettings = this.normalizeTax2307PrintSettings(databaseSettings, defaults);

      localStorage.setItem(
        this.tax2307PrintSettingsStorageKey,
        JSON.stringify(this.tax2307PrintSettings),
      );

      this.signatoryImagePreview = this.tax2307PrintSettings.signatoryImage || null;
      this.isLoadingTax2307PrintSettings = false;
      return;
    } catch {
      // Database fallback to browser cache.
    }

    try {
      const raw = localStorage.getItem(this.tax2307PrintSettingsStorageKey);
      if (!raw) {
        this.tax2307PrintSettings = defaults;
        this.signatoryImagePreview = null;
        this.isLoadingTax2307PrintSettings = false;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<Tax2307PrintSettings>;
      this.tax2307PrintSettings = this.normalizeTax2307PrintSettings(parsed, defaults);
      this.signatoryImagePreview = this.tax2307PrintSettings.signatoryImage || null;
    } catch {
      this.tax2307PrintSettings = defaults;
      this.signatoryImagePreview = null;
    } finally {
      this.isLoadingTax2307PrintSettings = false;
    }
  }

  private async persistTax2307PrintSettings(): Promise<boolean> {
    try {
      await apiClient.put<{
        success: boolean;
        data?: { settings?: Partial<Tax2307PrintSettings> };
      }>(`/accounting/report-print-settings/${this.tax2307PrintSettingsReportKey}`, this.tax2307PrintSettings);

      localStorage.setItem(
        this.tax2307PrintSettingsStorageKey,
        JSON.stringify(this.tax2307PrintSettings),
      );
      return true;
    } catch {
      try {
        localStorage.setItem(
          this.tax2307PrintSettingsStorageKey,
          JSON.stringify(this.tax2307PrintSettings),
        );
      } catch {
        // Ignore local storage failures and keep using in-memory settings.
      }
      return false;
    }
  }

  private async loadGeneralJournalPrintSettings(): Promise<void> {
    const defaults = this.createDefaultGeneralJournalPrintSettings();
    this.isLoadingGeneralJournalPrintSettings = true;

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: { settings?: Partial<GeneralJournalPrintSettings> };
      }>(`/accounting/report-print-settings/${this.generalJournalPrintSettingsReportKey}`);

      const databaseSettings = response.data?.data?.settings;
      this.generalJournalPrintSettings = this.normalizeGeneralJournalPrintSettings(databaseSettings, defaults);

      localStorage.setItem(
        this.generalJournalPrintSettingsStorageKey,
        JSON.stringify(this.generalJournalPrintSettings),
      );

      this.isLoadingGeneralJournalPrintSettings = false;
      return;
    } catch {
      // Database fallback to browser cache.
    }

    try {
      const raw = localStorage.getItem(this.generalJournalPrintSettingsStorageKey);
      if (!raw) {
        this.generalJournalPrintSettings = defaults;
        this.isLoadingGeneralJournalPrintSettings = false;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<GeneralJournalPrintSettings>;
      this.generalJournalPrintSettings = this.normalizeGeneralJournalPrintSettings(parsed, defaults);
    } catch {
      this.generalJournalPrintSettings = defaults;
    } finally {
      this.isLoadingGeneralJournalPrintSettings = false;
    }
  }

  private async persistGeneralJournalPrintSettings(): Promise<boolean> {
    try {
      await apiClient.put<{
        success: boolean;
        data?: { settings?: Partial<GeneralJournalPrintSettings> };
      }>(`/accounting/report-print-settings/${this.generalJournalPrintSettingsReportKey}`, this.generalJournalPrintSettings);

      localStorage.setItem(
        this.generalJournalPrintSettingsStorageKey,
        JSON.stringify(this.generalJournalPrintSettings),
      );
      return true;
    } catch {
      try {
        localStorage.setItem(
          this.generalJournalPrintSettingsStorageKey,
          JSON.stringify(this.generalJournalPrintSettings),
        );
      } catch {
        // Ignore local storage failures and keep using in-memory settings.
      }
      return false;
    }
  }

  getTax2307PrintLogoSrc(): string | null {
    if (!this.tax2307PrintSettings.showLogo) {
      return null;
    }

    const bp = this.businessProfile;
    const logoVariant = bp?.printLogoVariant ?? 'light';
    return logoVariant === 'dark'
      ? (bp?.businessLogoDark ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo-dark.png`)
      : (bp?.businessLogoLight ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo.png`);
  }

  getTax2307HeaderLines(): string[] {
    if (!this.tax2307PrintSettings.showAddress) {
      return [];
    }

    const bp = this.businessProfile;
    return [
      bp?.printAddressDetails || bp?.businessAddress || '',
      bp?.businessContact || '',
      bp?.businessEmail || '',
    ]
      .map((line) => String(line ?? '').trim())
      .filter((line) => line.length > 0);
  }

  getGeneralJournalPrintLogoSrc(): string | null {
    if (!this.generalJournalPrintSettings.showLogo) {
      return null;
    }

    const bp = this.businessProfile;
    const logoVariant = bp?.printLogoVariant ?? 'light';
    return logoVariant === 'dark'
      ? (bp?.businessLogoDark ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo-dark.png`)
      : (bp?.businessLogoLight ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo.png`);
  }

  getGeneralJournalHeaderLines(): string[] {
    if (!this.generalJournalPrintSettings.showAddress) {
      return [];
    }

    const bp = this.businessProfile;
    return [
      bp?.printAddressDetails || bp?.businessAddress || '',
      bp?.businessContact || '',
      bp?.businessEmail || '',
    ]
      .map((line) => String(line ?? '').trim())
      .filter((line) => line.length > 0);
  }

  getChequeVoucherPrintLogoSrc(): string | null {
    if (!this.chequeVoucherPrintSettings.showLogo) {
      return null;
    }

    const bp = this.businessProfile;
    const logoVariant = bp?.printLogoVariant ?? 'light';
    return logoVariant === 'dark'
      ? (bp?.businessLogoDark ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo-dark.png`)
      : (bp?.businessLogoLight ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo.png`);
  }

  getChequeVoucherBusinessName(): string {
    return this.businessProfile?.businessName || 'HVAC Warehouse & Sales';
  }

  getChequeVoucherHeaderLines(): string[] {
    const bp = this.businessProfile;
    const configuredAddress = String(this.chequeVoucherPrintSettings.defaultAddress ?? '').trim();
    const businessAddress = this.chequeVoucherPrintSettings.showAddress
      ? (configuredAddress || bp?.printAddressDetails || bp?.businessAddress || '')
      : '';
    const businessContact = bp?.businessContact || '';
    const businessEmail = bp?.businessEmail || '';

    return [
      businessAddress ? `Address: ${businessAddress}` : '',
      businessContact ? `Contact Us: ${businessContact}` : '',
      businessEmail ? `Email Us: ${businessEmail}` : '',
    ].filter((line) => line.trim().length > 0);
  }

  private parsePrintBool(value: string | null | undefined, defaultValue: boolean): boolean {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    return String(value).trim().toLowerCase() === 'true';
  }

  private async initializeDraftForms(): Promise<void> {
    const today = this.formatDateOnly(new Date().toISOString());
    this.isLoadingChequeVoucherDraftData = true;
    this.applyDefaultChequeVoucherDateRange();
    this.applyDefaultGeneralJournalDateRange();
    this.applyDefaultTax2307DateRange();

    await Promise.all([
      this.loadReleasedChequeVouchers(this.chequeVoucherListDateFrom, this.chequeVoucherListDateTo),
      this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo),
      this.loadAccountTitles(),
      this.loadNextChequeVoucherNumber(),
      this.loadNextGeneralJournalNumber(),
    ]);

    this.chequeVoucherForm.voucherDate = today;
    this.chequeVoucherForm.accountTitles = this.accountTitleCatalog.map((row) => ({ ...row, locked: true }));
    this.generalJournalForm.journalDate = today;
    this.isLoadingChequeVoucherDraftData = false;
  }

  private applyDefaultChequeVoucherDateRange(): void {
    const currentDate = new Date();
    const firstDateOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    this.chequeVoucherListDateFrom = this.formatDateOnly(firstDateOfMonth.toISOString());
    this.chequeVoucherListDateTo = this.formatDateOnly(currentDate.toISOString());
  }

  private applyDefaultGeneralJournalDateRange(): void {
    const currentDate = new Date();
    const firstDateOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    this.generalJournalListDateFrom = this.formatDateOnly(firstDateOfMonth.toISOString());
    this.generalJournalListDateTo = this.formatDateOnly(currentDate.toISOString());
  }

  private applyDefaultTax2307DateRange(): void {
    const currentDate = new Date();
    const firstDateOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    this.tax2307DateFrom = this.formatDateOnly(firstDateOfMonth.toISOString());
    this.tax2307DateTo = this.formatDateOnly(currentDate.toISOString());
  }

  private async loadReleasedChequeVouchers(dateFrom?: string, dateTo?: string): Promise<void> {
    this.isLoadingReport = true;
    this.reportError = '';

    try {
      const searchTerm = this.voucherSearchQuery.trim() || undefined;
      const { page, pageSize } = this.chequeVoucherPagination;

      const response = await this.fetchWithTimeout(
        apiClient.get<{ success: boolean; data?: { data: ChequeVoucherReleasedRecord[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
          '/accounting/cheque-vouchers',
          {
            params: {
              page: String(page),
              pageSize: String(pageSize),
              dateFrom: searchTerm ? undefined : (dateFrom || undefined),
              dateTo: searchTerm ? undefined : (dateTo || undefined),
              invoice: searchTerm,
              particulars: searchTerm,
              chequeNo: searchTerm,
            },
          },
        ),
        30000,
      );

      if (!response.data?.success || !response.data.data) {
        this.releasedChequeVouchers = [];
        this.chequeVoucherPagination.total = 0;
        this.chequeVoucherPagination.totalPages = 0;
        return;
      }

      const envelope = response.data.data;
      this.releasedChequeVouchers = Array.isArray(envelope.data) ? envelope.data : [];
      if (envelope.meta) {
        this.chequeVoucherPagination.total = envelope.meta.total;
        this.chequeVoucherPagination.totalPages = envelope.meta.totalPages;
        this.chequeVoucherPagination.page = envelope.meta.page;
        this.chequeVoucherPagination.pageSize = envelope.meta.pageSize;
      }
    } catch (error: unknown) {
      this.reportError = this.extractErrorMessage(error, 'Unable to load cheque vouchers. Please try again.');
    } finally {
      this.isLoadingReport = false;
    }
  }

  async loadDisbursementRegister(): Promise<void> {
    if (!this.disbursementRegisterMonth) {
      return;
    }

    this.isLoadingDisbursementRegister = true;
    this.disbursementRegisterError = '';

    const [yearStr, monthStr] = this.disbursementRegisterMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    try {
      const { page, pageSize } = this.disbursementPagination;

      const response = await this.fetchWithTimeout(
        apiClient.get<{ success: boolean; data?: { data: ChequeVoucherReleasedRecord[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
          '/accounting/disbursement-register',
          { params: { page: String(page), pageSize: String(pageSize), dateFrom, dateTo } },
        ),
        30000,
      );

      if (!response.data?.success || !response.data.data) {
        this.disbursementRegisterData = [];
        this.disbursementPagination.total = 0;
        this.disbursementPagination.totalPages = 0;
        return;
      }

      const envelope = response.data.data;
      this.disbursementRegisterData = Array.isArray(envelope.data) ? envelope.data : [];
      if (envelope.meta) {
        this.disbursementPagination.total = envelope.meta.total;
        this.disbursementPagination.totalPages = envelope.meta.totalPages;
        this.disbursementPagination.page = envelope.meta.page;
        this.disbursementPagination.pageSize = envelope.meta.pageSize;
      }
    } catch (error: unknown) {
      this.disbursementRegisterError = this.extractErrorMessage(error, 'Unable to load disbursement data. Please try again.');
    } finally {
      this.isLoadingDisbursementRegister = false;
    }
  }

  getDisbursementMonthLabel(): string {
    if (!this.disbursementRegisterMonth) {
      return '';
    }

    const [yearStr, monthStr] = this.disbursementRegisterMonth.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  getDisbursementColumnAmountForCV(cv: ChequeVoucherReleasedRecord, col: DisbursementDefaultColumn): number {
    const match = cv.accountTitles.find((a) => a.accountNumber === col.accountNumber);
    if (!match) {
      return 0;
    }

    return col.side === 'DR' ? (Number(match.debit) || 0) : (Number(match.credit) || 0);
  }

  getDisbursementSundryRowsForCV(cv: ChequeVoucherReleasedRecord): AccountTitleDraft[] {
    const defaultColNums = new Set(
      this.disbursementRegisterPrintSettings.defaultColumns.map((c) => c.accountNumber).filter(Boolean),
    );
    return cv.accountTitles.filter((a) => !defaultColNums.has(a.accountNumber));
  }

  getDisbursementSundryAccountSummary(): Array<{ accountNumber: string; description: string; dr: number; cr: number }> {
    const map = new Map<string, { accountNumber: string; description: string; dr: number; cr: number }>();
    for (const cv of this.disbursementRegisterData) {
      for (const sundry of this.getDisbursementSundryRowsForCV(cv)) {
        const key = sundry.accountNumber || sundry.description;
        if (!map.has(key)) {
          map.set(key, { accountNumber: sundry.accountNumber, description: sundry.description, dr: 0, cr: 0 });
        }

        const existing = map.get(key)!;
        existing.dr += Number(sundry.debit) || 0;
        existing.cr += Number(sundry.credit) || 0;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }

  getDisbursementRegisterColTotals(): number[] {
    return this.disbursementRegisterPrintSettings.defaultColumns.map((col) =>
      this.disbursementRegisterData.reduce((sum, cv) => sum + this.getDisbursementColumnAmountForCV(cv, col), 0),
    );
  }

  getDisbursementSundryRegisterTotals(): { dr: number; cr: number } {
    let dr = 0;
    let cr = 0;
    for (const cv of this.disbursementRegisterData) {
      for (const sundry of this.getDisbursementSundryRowsForCV(cv)) {
        dr += Number(sundry.debit) || 0;
        cr += Number(sundry.credit) || 0;
      }
    }
    return { dr, cr };
  }

  private async loadReleasedGeneralJournals(dateFrom?: string, dateTo?: string): Promise<void> {
    this.isLoadingGeneralJournalData = true;
    this.reportError = '';

    try {
      const { page, pageSize } = this.generalJournalPagination;

      const response = await this.fetchWithTimeout(
        apiClient.get<{ success: boolean; data?: { data: GeneralJournalReleasedRecord[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
          '/accounting/general-journals',
          {
            params: {
              page: String(page),
              pageSize: String(pageSize),
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
            },
          },
        ),
        30000,
      );

      if (!response.data?.success || !response.data.data) {
        this.releasedGeneralJournals = [];
        this.generalJournalPagination.total = 0;
        this.generalJournalPagination.totalPages = 0;
        this.isLoadingGeneralJournalData = false;
        return;
      }

      const envelope = response.data.data;
      this.releasedGeneralJournals = Array.isArray(envelope.data) ? envelope.data : [];
      if (envelope.meta) {
        this.generalJournalPagination.total = envelope.meta.total;
        this.generalJournalPagination.totalPages = envelope.meta.totalPages;
        this.generalJournalPagination.page = envelope.meta.page;
        this.generalJournalPagination.pageSize = envelope.meta.pageSize;
      }
    } catch (error: unknown) {
      this.reportError = this.extractErrorMessage(error, 'Unable to load general journals. Please try again.');
    } finally {
      this.isLoadingGeneralJournalData = false;
    }
  }

  async applyGeneralJournalFilters(): Promise<void> {
    this.generalJournalPagination.page = 1;
    await this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo);
  }

  async clearGeneralJournalFilters(): Promise<void> {
    this.applyDefaultGeneralJournalDateRange();
    this.generalJournalPagination.page = 1;
    await this.loadReleasedGeneralJournals(this.generalJournalListDateFrom, this.generalJournalListDateTo);
  }

  async postGeneralJournal(): Promise<void> {
    if (!this.canManageGeneralJournal() || this.isSavingGeneralJournal) {
      return;
    }

    if (!String(this.generalJournalForm.description ?? '').trim()) {
      this.reportError = 'Description is required.';
      return;
    }

    if (!String(this.generalJournalForm.journalDate ?? '').trim()) {
      this.reportError = 'Journal date is required.';
      return;
    }

    const lines = this.generalJournalForm.sundries
      .map((row) => ({
        accountNumber: String(row.accountNumber ?? '').trim(),
        description: String(row.description ?? '').trim(),
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
      }))
      .filter((row) => row.accountNumber || row.description || row.debit > 0 || row.credit > 0);

    if (lines.length === 0) {
      this.reportError = 'Add at least one journal line.';
      return;
    }

    const hasIncompleteLine = lines.some((row) => !row.accountNumber || !row.description);
    if (hasIncompleteLine) {
      this.reportError = 'Each line needs account number and description.';
      return;
    }

    const debitTotal = lines.reduce((sum, row) => sum + row.debit, 0);
    const creditTotal = lines.reduce((sum, row) => sum + row.credit, 0);

    if (debitTotal <= 0 && creditTotal <= 0) {
      this.reportError = 'Debit and credit totals cannot both be zero.';
      return;
    }

    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      this.reportError = 'Total debit must equal total credit.';
      return;
    }

    this.isSavingGeneralJournal = true;
    this.reportError = '';

    try {
      const response = await apiClient.post<{ success: boolean; data?: GeneralJournalReleasedRecord }>(
        '/accounting/general-journals/post',
        {
          journalNo: this.generalJournalForm.journalNo,
          journalDate: this.generalJournalForm.journalDate,
          description: this.generalJournalForm.description,
          sundries: lines,
        },
      );

      if (!response.data?.success || !response.data.data) {
        this.reportError = 'Unable to post general journal entry.';
        this.isSavingGeneralJournal = false;
        return;
      }

      const posted = response.data.data;
      this.releasedGeneralJournals = [posted, ...this.releasedGeneralJournals];
      await this.loadNextGeneralJournalNumber();
      this.generalJournalForm.description = '';
      this.generalJournalForm.sundries = [this.createJournalSundryDraft()];
      this.isGeneralJournalDrawerOpen = false;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.reportError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to post general journal entry';
      } else if (error instanceof Error) {
        this.reportError = error.message;
      } else {
        this.reportError = 'Unable to post general journal entry';
      }
    } finally {
      this.isSavingGeneralJournal = false;
    }
  }

  private async loadAccountTitles(): Promise<void> {
    try {
      const response = await apiClient.get<{ success: boolean; data?: Array<{ accountNumber?: string; description?: string }> }>(
        '/accounting/account-titles',
      );

      if (!response.data?.success) {
        this.accountTitleCatalog = this.defaultAccountTitles.map((item) => ({ ...item }));
        return;
      }

      const rows = Array.isArray(response.data.data) ? response.data.data : [];
      this.accountTitleCatalog = rows.length > 0
        ? rows.map((item) => ({
            accountNumber: String(item.accountNumber ?? '').trim(),
            description: String(item.description ?? '').trim(),
            debit: 0,
            credit: 0,
          }))
        : this.defaultAccountTitles.map((item) => ({ ...item }));
    } catch {
      this.accountTitleCatalog = this.defaultAccountTitles.map((item) => ({ ...item }));
    }
  }

  private async loadNextChequeVoucherNumber(): Promise<void> {
    try {
      const response = await apiClient.get<{ success: boolean; data?: { cvNo?: string } }>(
        '/accounting/cheque-vouchers/next-number',
      );

      this.chequeVoucherForm.cvNo = String(response.data?.data?.cvNo ?? '').trim();
    } catch {
      this.chequeVoucherForm.cvNo = '';
    }
  }

  private async loadNextGeneralJournalNumber(): Promise<void> {
    this.isLoadingGeneralJournalNextNumber = true;
    try {
      const response = await apiClient.get<{ success: boolean; data?: { journalNo?: string } }>(
        '/accounting/general-journals/next-number',
      );

      this.generalJournalForm.journalNo = String(response.data?.data?.journalNo ?? '').trim();
    } catch {
      this.generalJournalForm.journalNo = '';
    } finally {
      this.isLoadingGeneralJournalNextNumber = false;
    }
  }

  private async resetChequeVoucherDraft(): Promise<void> {
    const today = this.formatDateOnly(new Date().toISOString());
    await this.loadNextChequeVoucherNumber();

    this.chequeVoucherForm = {
      cvNo: this.chequeVoucherForm.cvNo,
      voucherType: this.chequeVoucherForm.voucherType,
      payee: '',
      voucherDate: today,
      tinNumber: '',
      address: '',
      zipCode: '',
      particulars: '',
      deposits: [this.createChequeDepositDraft()],
      invoices: [this.createInvoiceDraft()],
      accountTitles: this.accountTitleCatalog.map((row) => ({ ...row })),
    };
  }

  private isVoucherWithinDateRange(value: string): boolean {
    const parsedValue = new Date(value);
    if (Number.isNaN(parsedValue.getTime())) {
      return false;
    }

    if (this.chequeVoucherListDateFrom) {
      const parsedFrom = new Date(this.chequeVoucherListDateFrom);
      if (!Number.isNaN(parsedFrom.getTime()) && parsedValue < parsedFrom) {
        return false;
      }
    }

    if (this.chequeVoucherListDateTo) {
      const parsedTo = new Date(this.chequeVoucherListDateTo);
      if (!Number.isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        if (parsedValue > parsedTo) {
          return false;
        }
      }
    }

    return true;
  }

  private isTax2307WithinDateRange(value: string): boolean {
    const parsedValue = new Date(value);
    if (Number.isNaN(parsedValue.getTime())) {
      return false;
    }

    if (this.tax2307DateFrom) {
      const parsedFrom = new Date(this.tax2307DateFrom);
      if (!Number.isNaN(parsedFrom.getTime()) && parsedValue < parsedFrom) {
        return false;
      }
    }

    if (this.tax2307DateTo) {
      const parsedTo = new Date(this.tax2307DateTo);
      if (!Number.isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        if (parsedValue > parsedTo) {
          return false;
        }
      }
    }

    return true;
  }

  private getTax2307BaseRows(): Tax2307ReportRow[] {
    // Use pre-fetched paginated tax 2307 rows if available
    if (this.tax2307ReportRows.length > 0) {
      return this.tax2307ReportRows;
    }

    // Fallback: derive from released cheque vouchers (used for PDF generation)
    return this.releasedChequeVouchers
      .filter((voucher) => this.isTax2307WithinDateRange(voucher.voucherDate || voucher.releasedAt))
      .map((voucher) => {
        const withholdingRows = voucher.accountTitles.filter((accountTitle) => {
          const normalizedDescription = String(accountTitle.description ?? '').toLowerCase();
          return normalizedDescription.includes('expanded withholding tax') || normalizedDescription.includes('2307');
        });

        const taxWithheld = withholdingRows.reduce((sum, accountTitle) => {
          return sum + Math.max(Number(accountTitle.debit) || 0, Number(accountTitle.credit) || 0);
        }, 0);

        return {
          referenceNo: String(voucher.cvNo ?? '').trim(),
          tin: String(voucher.tinNumber ?? '').trim(),
          supplierName: String(voucher.payee ?? '').trim(),
          supplierAddress: `${String(voucher.address ?? '').trim()}${voucher.zipCode ? `, ${String(voucher.zipCode).trim()}` : ''}`.trim(),
          vatableAmount: this.getVoucherPurchasesDebit(voucher),
          taxWithheld,
          voucherDate: String(voucher.voucherDate ?? voucher.releasedAt ?? '').trim(),
        };
      })
      .filter((row) => row.taxWithheld > 0);
  }

  private getTax2307RowsForGeneration(): Tax2307ReportRow[] {
    return this.getTax2307BaseRows().filter((row) => {
      if (!this.tax2307SupplierFilter) {
        return true;
      }
      return row.supplierName === this.tax2307SupplierFilter;
    });
  }

  private getTax2307SupplierSummaries(): Tax2307SupplierSummary[] {
    const rows = this.getTax2307RowsForGeneration();
    const grouped = new Map<string, Tax2307SupplierSummary>();

    for (const row of rows) {
      const key = `${row.supplierName}::${row.tin}`;
      const existing = grouped.get(key) ?? {
        tin: row.tin,
        supplierName: row.supplierName,
        supplierAddress: row.supplierAddress,
        references: [],
        vatableAmount: 0,
        taxWithheld: 0,
      };

      existing.references.push(row.referenceNo);
      existing.vatableAmount += row.vatableAmount;
      existing.taxWithheld += row.taxWithheld;
      if (!existing.supplierAddress && row.supplierAddress) {
        existing.supplierAddress = row.supplierAddress;
      }

      grouped.set(key, existing);
    }

    return [...grouped.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }

  private createSupplierSummaryFromRows(rows: Tax2307ReportRow[], selector: { supplierName: string; tin: string }): Tax2307SupplierSummary | null {
    const filteredRows = rows.filter((row) => row.supplierName === selector.supplierName && row.tin === selector.tin);
    if (filteredRows.length === 0) {
      return null;
    }

    return {
      tin: selector.tin,
      supplierName: selector.supplierName,
      supplierAddress: filteredRows.find((row) => row.supplierAddress)?.supplierAddress ?? '',
      references: filteredRows.map((row) => row.referenceNo),
      vatableAmount: filteredRows.reduce((sum, row) => sum + row.vatableAmount, 0),
      taxWithheld: filteredRows.reduce((sum, row) => sum + row.taxWithheld, 0),
    };
  }

  private canAccessReport(report: AccountingReportDefinition): boolean {
    const acceptedKeys = report.permissionKeys ?? [];
    if (acceptedKeys.length === 0) {
      return true;
    }

    const isDenied = acceptedKeys.some((permissionKey) => this.rbacService.hasDeniedPermissionKey(permissionKey));
    if (isDenied) {
      return false;
    }

    const hasAnyAllowedRules = this.rbacService.hasAnyEffectivePermissionWithPrefix(this.reportPermissionPrefix);
    const hasAnyDeniedRules = this.rbacService.hasAnyDeniedPermissionWithPrefix(this.reportPermissionPrefix);

    if (!hasAnyAllowedRules && !hasAnyDeniedRules) {
      return true;
    }

    const isExplicitlyAllowed = acceptedKeys.some((permissionKey) =>
      this.rbacService.hasEffectivePermissionKey(permissionKey),
    );
    if (isExplicitlyAllowed) {
      return true;
    }

    if (!hasAnyAllowedRules && hasAnyDeniedRules) {
      return true;
    }

    return false;
  }

  private canAccessReportAction(permissionKeys: string[]): boolean {
    const acceptedKeys = permissionKeys ?? [];
    if (acceptedKeys.length === 0) {
      return true;
    }

    const isDenied = acceptedKeys.some((permissionKey) => this.rbacService.hasDeniedPermissionKey(permissionKey));
    if (isDenied) {
      return false;
    }

    const hasAnyAllowedRules = this.rbacService.hasAnyEffectivePermissionWithPrefix(this.reportActionPermissionPrefix);
    const hasAnyDeniedRules = this.rbacService.hasAnyDeniedPermissionWithPrefix(this.reportActionPermissionPrefix);

    if (!hasAnyAllowedRules && !hasAnyDeniedRules) {
      return true;
    }

    const isExplicitlyAllowed = acceptedKeys.some((permissionKey) =>
      this.rbacService.hasEffectivePermissionKey(permissionKey),
    );
    if (isExplicitlyAllowed) {
      return true;
    }

    if (!hasAnyAllowedRules && hasAnyDeniedRules) {
      return true;
    }

    return false;
  }

  private matchesSearch(value: string, tokens: string[]): boolean {
    if (tokens.length === 0) {
      return true;
    }

    const normalizedValue = this.normalizeSearchText(value);
    return tokens.every((token) => normalizedValue.includes(token));
  }

  private normalizeSearchText(value: string): string {
    return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private async loadFilteredSalesRegisterRows(): Promise<SalesRegisterRow[]> {
    const salesOrders = await this.loadAllRemittedSalesOrders();
    return salesOrders
      .map((item) => this.mapSalesRegisterRow(item))
      .filter((row) => this.isWithinDateRange(row.releaseDate))
      .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  private async loadAllRemittedSalesOrders(): Promise<SalesOrderListItem[]> {
    const items: SalesOrderListItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 25) {
      const response = await this.salesOrderService.getRemittedSales({
        page,
        limit: 200,
      });

      items.push(...response.items);
      totalPages = Math.max(1, Number(response.meta?.totalPages ?? 1));
      page += 1;
    }

    return items;
  }

  private mapSalesRegisterRow(item: SalesOrderListItem): SalesRegisterRow {
    return {
      id: Number(item.id) || 0,
      soNumber: String(item.soNumber ?? '').trim(),
      customerName: String(item.customerName ?? '').trim(),
      salesType: String(item.salesType ?? '').trim(),
      status: String(item.status ?? '').trim(),
      releaseDate: this.formatDateOnly(item.scheduleDate ?? item.createdAt ?? ''),
      serialCount: Number(item.serialCount ?? 0),
      totalAmount: Number(item.totalAmount ?? 0),
    };
  }

  private buildWeeklySalesRows(rows: SalesRegisterRow[]): WeeklySalesRow[] {
    const weeklyGroups = new Map<string, WeeklySalesRow>();

    for (const row of rows) {
      const parsedDate = new Date(row.releaseDate);
      if (Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      const weekStart = this.getWeekStart(parsedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const key = this.formatDateOnly(weekStart.toISOString());
      const current = weeklyGroups.get(key) ?? {
        weekLabel: `Week of ${key}`,
        weekStart: key,
        weekEnd: this.formatDateOnly(weekEnd.toISOString()),
        orderCount: 0,
        unitCount: 0,
        totalAmount: 0,
      };

      current.orderCount += 1;
      current.unitCount += row.serialCount;
      current.totalAmount += row.totalAmount;
      weeklyGroups.set(key, current);
    }

    return [...weeklyGroups.values()].sort((left, right) => right.weekStart.localeCompare(left.weekStart));
  }

  private buildDailyUnitReleasedRows(rows: SalesRegisterRow[]): DailyUnitReleasedRow[] {
    const dailyGroups = new Map<string, DailyUnitReleasedRow>();

    for (const row of rows) {
      const current = dailyGroups.get(row.releaseDate) ?? {
        releaseDate: row.releaseDate,
        orderCount: 0,
        unitCount: 0,
        totalAmount: 0,
      };

      current.orderCount += 1;
      current.unitCount += row.serialCount;
      current.totalAmount += row.totalAmount;
      dailyGroups.set(row.releaseDate, current);
    }

    return [...dailyGroups.values()].sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  private async loadLowStockReport(): Promise<void> {
    const { page, pageSize } = this.lowStocksPagination;

    const response = await this.fetchWithTimeout(
      apiClient.get<{ success: boolean; data?: { data: Array<Record<string, unknown>>; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
        '/accounting/low-stocks',
        { params: { page: String(page), pageSize: String(pageSize) } },
      ),
      30000,
    );

    if (!response.data?.success || !response.data.data) {
      this.lowStockRows = [];
      this.lowStocksPagination.total = 0;
      this.lowStocksPagination.totalPages = 0;
      return;
    }

    const envelope = response.data.data;
    const items = Array.isArray(envelope.data) ? envelope.data : [];

    this.lowStockRows = items.map((item) => ({
      id: Number(item['id']) || 0,
      materialCode: String(item['material_code'] ?? item['materialCode'] ?? '').trim(),
      materialName: String(item['material_name'] ?? item['materialName'] ?? '').trim(),
      brandName: String(item['brand_name'] ?? item['brandName'] ?? '').trim(),
      unit: String(item['unit'] ?? '').trim(),
      onHandStock: Number(item['on_hand_stock'] ?? item['onHandStock'] ?? 0),
      reorderLevel: Number(item['reorder_level'] ?? item['reorderLevel'] ?? 0),
      sellPrice: Number(item['sell_price'] ?? item['sellPrice'] ?? 0),
    }));

    if (envelope.meta) {
      this.lowStocksPagination.total = envelope.meta.total;
      this.lowStocksPagination.totalPages = envelope.meta.totalPages;
      this.lowStocksPagination.page = envelope.meta.page;
      this.lowStocksPagination.pageSize = envelope.meta.pageSize;
    }
  }

  private async loadSalesRegisterPaginated(): Promise<void> {
    const { page, pageSize } = this.salesRegisterPagination;

    const response = await this.fetchWithTimeout(
      apiClient.get<{ success: boolean; data?: { data: SalesRegisterRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
        '/accounting/sales-register',
        {
          params: {
            page: String(page),
            pageSize: String(pageSize),
            dateFrom: this.reportDateFrom || undefined,
            dateTo: this.reportDateTo || undefined,
          },
        },
      ),
      30000,
    );

    if (!response.data?.success || !response.data.data) {
      this.salesRegisterRows = [];
      this.salesRegisterPagination.total = 0;
      this.salesRegisterPagination.totalPages = 0;
      return;
    }

    const envelope = response.data.data;
    this.salesRegisterRows = Array.isArray(envelope.data) ? envelope.data : [];
    if (envelope.meta) {
      this.salesRegisterPagination.total = envelope.meta.total;
      this.salesRegisterPagination.totalPages = envelope.meta.totalPages;
      this.salesRegisterPagination.page = envelope.meta.page;
      this.salesRegisterPagination.pageSize = envelope.meta.pageSize;
    }
  }

  private async loadWeeklySalesPaginated(): Promise<void> {
    const { page, pageSize } = this.weeklySalesPagination;

    const response = await this.fetchWithTimeout(
      apiClient.get<{ success: boolean; data?: { data: WeeklySalesRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
        '/accounting/weekly-sales',
        {
          params: {
            page: String(page),
            pageSize: String(pageSize),
            dateFrom: this.reportDateFrom || undefined,
            dateTo: this.reportDateTo || undefined,
          },
        },
      ),
      30000,
    );

    if (!response.data?.success || !response.data.data) {
      this.weeklySalesRows = [];
      this.weeklySalesPagination.total = 0;
      this.weeklySalesPagination.totalPages = 0;
      return;
    }

    const envelope = response.data.data;
    this.weeklySalesRows = Array.isArray(envelope.data) ? envelope.data : [];
    if (envelope.meta) {
      this.weeklySalesPagination.total = envelope.meta.total;
      this.weeklySalesPagination.totalPages = envelope.meta.totalPages;
      this.weeklySalesPagination.page = envelope.meta.page;
      this.weeklySalesPagination.pageSize = envelope.meta.pageSize;
    }
  }

  private async loadDailyUnitReleasedPaginated(): Promise<void> {
    const { page, pageSize } = this.dailyUnitReleasedPagination;

    const response = await this.fetchWithTimeout(
      apiClient.get<{ success: boolean; data?: { data: DailyUnitReleasedRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
        '/accounting/daily-unit-released',
        {
          params: {
            page: String(page),
            pageSize: String(pageSize),
            dateFrom: this.reportDateFrom || undefined,
            dateTo: this.reportDateTo || undefined,
          },
        },
      ),
      30000,
    );

    if (!response.data?.success || !response.data.data) {
      this.dailyUnitReleasedRows = [];
      this.dailyUnitReleasedPagination.total = 0;
      this.dailyUnitReleasedPagination.totalPages = 0;
      return;
    }

    const envelope = response.data.data;
    this.dailyUnitReleasedRows = Array.isArray(envelope.data) ? envelope.data : [];
    if (envelope.meta) {
      this.dailyUnitReleasedPagination.total = envelope.meta.total;
      this.dailyUnitReleasedPagination.totalPages = envelope.meta.totalPages;
      this.dailyUnitReleasedPagination.page = envelope.meta.page;
      this.dailyUnitReleasedPagination.pageSize = envelope.meta.pageSize;
    }
  }

  private async loadTax2307ReportPaginated(): Promise<void> {
    const { page, pageSize } = this.tax2307Pagination;

    const response = await this.fetchWithTimeout(
      apiClient.get<{ success: boolean; data?: { data: Tax2307ReportRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } }>(
        '/accounting/tax-2307-report',
        {
          params: {
            page: String(page),
            pageSize: String(pageSize),
            dateFrom: this.tax2307DateFrom || undefined,
            dateTo: this.tax2307DateTo || undefined,
          },
        },
      ),
      30000,
    );

    if (!response.data?.success || !response.data.data) {
      this.releasedChequeVouchers = [];
      this.tax2307Pagination.total = 0;
      this.tax2307Pagination.totalPages = 0;
      return;
    }

    const envelope = response.data.data;
    // Store the tax 2307 rows - the withholdingTaxRows getter will use these
    this.tax2307ReportRows = Array.isArray(envelope.data) ? envelope.data : [];
    if (envelope.meta) {
      this.tax2307Pagination.total = envelope.meta.total;
      this.tax2307Pagination.totalPages = envelope.meta.totalPages;
      this.tax2307Pagination.page = envelope.meta.page;
      this.tax2307Pagination.pageSize = envelope.meta.pageSize;
    }
  }

  private fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timed out. Please try again.'));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
      return (error.response?.data as { message?: string } | undefined)?.message ?? fallback;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }

  private isWithinDateRange(value: string): boolean {
    const parsedValue = new Date(value);
    if (Number.isNaN(parsedValue.getTime())) {
      return false;
    }

    if (this.reportDateFrom) {
      const parsedFrom = new Date(this.reportDateFrom);
      if (!Number.isNaN(parsedFrom.getTime()) && parsedValue < parsedFrom) {
        return false;
      }
    }

    if (this.reportDateTo) {
      const parsedTo = new Date(this.reportDateTo);
      if (!Number.isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        if (parsedValue > parsedTo) {
          return false;
        }
      }
    }

    return true;
  }

  private getWeekStart(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    const dayIndex = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayIndex);
    return date;
  }

  private buildExcelExportDefinition(): ExcelExportDefinition | null {
    switch (this.selectedReportKey) {
      case 'sales-register':
        return {
          fileName: `sales_register_${this.reportDateFrom}_${this.reportDateTo}.xlsx`,
          sheetName: 'Sales Register',
          title: 'Sales Register',
          subtitle: `Date Range: ${this.reportDateFrom} to ${this.reportDateTo}`,
          headers: ['Release Date', 'SO Number', 'Customer', 'Sales Type', 'Status', 'Units', 'Total Amount'],
          rows: this.salesRegisterRows.map((row) => [
            row.releaseDate,
            row.soNumber,
            row.customerName,
            row.salesType,
            row.status,
            row.serialCount,
            row.totalAmount,
          ]),
        };
      case 'weekly-sales':
        return {
          fileName: `weekly_sales_${this.reportDateFrom}_${this.reportDateTo}.xlsx`,
          sheetName: 'Weekly Sales',
          title: 'Weekly Sales',
          subtitle: `Date Range: ${this.reportDateFrom} to ${this.reportDateTo}`,
          headers: ['Week Label', 'Week Start', 'Week End', 'Orders', 'Units', 'Total Amount'],
          rows: this.weeklySalesRows.map((row) => [
            row.weekLabel,
            row.weekStart,
            row.weekEnd,
            row.orderCount,
            row.unitCount,
            row.totalAmount,
          ]),
        };
      case 'daily-unit-released':
        return {
          fileName: `daily_unit_released_${this.reportDateFrom}_${this.reportDateTo}.xlsx`,
          sheetName: 'Daily Unit Released',
          title: 'Daily Unit Released',
          subtitle: `Date Range: ${this.reportDateFrom} to ${this.reportDateTo}`,
          headers: ['Release Date', 'Orders', 'Units', 'Total Amount'],
          rows: this.dailyUnitReleasedRows.map((row) => [
            row.releaseDate,
            row.orderCount,
            row.unitCount,
            row.totalAmount,
          ]),
        };
      case 'low-stocks-report':
        return {
          fileName: 'low_stocks_report.xlsx',
          sheetName: 'Low Stocks',
          title: 'Low Stocks Report',
          headers: ['Material Code', 'Material Name', 'Brand', 'Unit', 'On Hand', 'Reorder Level', 'Sell Price'],
          rows: this.lowStockRows.map((row) => [
            row.materialCode,
            row.materialName,
            row.brandName,
            row.unit,
            row.onHandStock,
            row.reorderLevel,
            row.sellPrice,
          ]),
        };
      case 'cheque-voucher':
        return {
          fileName: `cheque_voucher_${this.chequeVoucherForm.cvNo || 'live'}.xlsx`,
          sheetName: 'Cheque Voucher',
          title: 'Cheque Voucher',
          headers: ['Section', 'Field', 'Value', 'Amount'],
          rows: [
            ['Voucher', 'CV No.', this.chequeVoucherForm.cvNo, ''],
            ['Voucher', 'Payee', this.chequeVoucherForm.payee, ''],
            ['Voucher', 'Voucher Date', this.chequeVoucherForm.voucherDate, ''],
            ['Voucher', 'TIN Number', this.chequeVoucherForm.tinNumber, ''],
            ['Voucher', 'Address', this.chequeVoucherForm.address, ''],
            ['Voucher', 'Zip Code', this.chequeVoucherForm.zipCode, ''],
            ['Voucher', 'Particulars', this.chequeVoucherForm.particulars, ''],
            ...this.chequeVoucherForm.deposits.map((row) => [
              'Deposit',
              `${row.bankName || '-'} / ${row.chequeNo || '-'}`,
              row.chequeDate,
              Number(row.amount) || 0,
            ]),
            ...this.chequeVoucherForm.invoices.map((row) => [
              'Invoice',
              row.invoiceNo,
              row.description,
              Number(row.amount) || 0,
            ]),
            ...this.chequeVoucherForm.accountTitles.map((row) => [
              'Account Title',
              `${row.accountNumber} ${row.description}`.trim(),
              Number(row.debit) > 0 ? 'Debit' : 'Credit',
              Number(row.debit) || Number(row.credit) || 0,
            ]),
          ],
        };
      case 'general-journal-register':
        return {
          fileName: `general_journal_${this.generalJournalForm.journalNo || 'draft'}.xlsx`,
          sheetName: 'General Journal',
          title: 'General Journal Register Draft',
          headers: ['Journal No.', 'Journal Date', 'Description', 'Account Number', 'Account Description', 'Debit', 'Credit'],
          rows: this.generalJournalForm.sundries.map((row) => [
            this.generalJournalForm.journalNo,
            this.generalJournalForm.journalDate,
            this.generalJournalForm.description,
            row.accountNumber,
            row.description,
            Number(row.debit) || 0,
            Number(row.credit) || 0,
          ]),
        };
      case 'disbursement-register':
        const exportBaseColumns = this.getDisbursementBaseColumns();
        return {
          fileName: 'disbursement_register_preview.xlsx',
          sheetName: 'Disbursement Register',
          title: 'Disbursement Register Preview',
          subtitle: `For the Month of ${this.getDisbursementMonthLabel()}`,
          headers: exportBaseColumns.map((column) => column.label || 'Column'),
          rows: this.disbursementRegisterData.map((cv) =>
            exportBaseColumns.map((column) => this.getDisbursementBaseColumnValue(cv, column)),
          ),
        };
      case 'tax-2307-report':
        return {
          fileName: '2307_tax_report_preview.xlsx',
          sheetName: '2307 Tax Report',
          title: '2307 Tax Report Preview',
          subtitle: `For the Month of ${this.tax2307MonthLabel}`,
          headers: ['Reference No. (CV No.)', 'TIN', 'Supplier Name', 'Vatable Amount', 'Tax Withheld'],
          rows: this.withholdingTaxRows.map((row) => [
            row.referenceNo,
            row.tin,
            row.supplierName,
            row.vatableAmount,
            row.taxWithheld,
          ]),
        };
      default:
        return null;
    }
  }

  private async createWorkbook(): Promise<{
    addWorksheet: (name?: string) => any;
    xlsx: { writeBuffer: () => Promise<ArrayBuffer> };
  }> {
    const excelJsModule = await import('exceljs').catch(async () => import('exceljs/dist/exceljs.min.js'));
    const workbookConstructor =
      (excelJsModule as { Workbook?: new () => any }).Workbook ??
      (excelJsModule as { default?: { Workbook?: new () => any } }).default?.Workbook;

    if (!workbookConstructor) {
      throw new Error('Excel workbook constructor is unavailable.');
    }

    return new workbookConstructor();
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  private createChequeDepositDraft(): ChequeDepositDraft {
    return {
      bankName: '',
      chequeNo: '',
      chequeDate: new Date().toISOString().split('T')[0],
      amount: 0,
    };
  }

  private createInvoiceDraft(): InvoiceDraft {
    return {
      invoiceNo: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      description: '',
      amount: 0,
    };
  }

  private createAccountTitleDraft(): AccountTitleDraft {
    return {
      accountNumber: '',
      description: '',
      debit: 0,
      credit: 0,
    };
  }

  private createJournalSundryDraft(): JournalSundryDraft {
    return {
      accountNumber: '',
      description: '',
      debit: 0,
      credit: 0,
    };
  }

  onSundryAccountInput(index: number, value: string): void {
    const query = value.trim().toLowerCase();
    if (!query) {
      this.sundryAccountDropdownIndex = -1;
      this.sundryAccountSearchResults = [];
      return;
    }
    this.sundryAccountSearchResults = this.accountTitleCatalog
      .filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query),
      )
      .slice(0, 10);
    this.sundryAccountDropdownIndex = this.sundryAccountSearchResults.length > 0 ? index : -1;
  }

  selectSundryAccount(index: number, account: AccountTitleDraft): void {
    this.generalJournalForm.sundries[index].accountNumber = account.accountNumber;
    this.generalJournalForm.sundries[index].description = account.description;
    this.sundryAccountDropdownIndex = -1;
    this.sundryAccountSearchResults = [];
  }

  closeSundryAccountDropdown(): void {
    setTimeout(() => {
      this.sundryAccountDropdownIndex = -1;
      this.sundryAccountSearchResults = [];
    }, 150);
  }

  onPayeeInput(value: string): void {
    this.chequeVoucherForm.payee = value;
    const query = value.trim().toLowerCase();

    if (!query) {
      this.payeeSearchResults = [];
      this.isPayeeDropdownOpen = false;
      return;
    }

    this.isSearchingPayee = true;
    apiClient.get<{ success: boolean; items: any[] }>(`/vendor?search=${encodeURIComponent(query)}&limit=10`)
      .then(response => {
        if (response.data?.success) {
          this.payeeSearchResults = response.data.items || [];
          this.isPayeeDropdownOpen = this.payeeSearchResults.length > 0;
        }
      })
      .catch(() => {
        this.payeeSearchResults = [];
      })
      .finally(() => {
        this.isSearchingPayee = false;
      });
  }

  selectPayee(vendor: any): void {
    this.chequeVoucherForm.payee = vendor.name;
    this.chequeVoucherForm.tinNumber = vendor.tin_number || '';
    this.chequeVoucherForm.address = vendor.address || '';
    // If there's no zip code in the vendor record, we keep current or empty
    this.payeeSearchResults = [];
    this.isPayeeDropdownOpen = false;
  }

  closePayeeDropdown(): void {
    setTimeout(() => {
      this.isPayeeDropdownOpen = false;
    }, 200);
  }

  onCvAccountInput(index: number, value: string): void {
    const query = value.trim().toLowerCase();
    if (!query) {
      this.cvAccountDropdownIndex = -1;
      this.cvAccountSearchResults = [];
      return;
    }
    this.cvAccountSearchResults = this.accountTitleCatalog
      .filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query),
      )
      .slice(0, 10);
    this.cvAccountDropdownIndex = this.cvAccountSearchResults.length > 0 ? index : -1;
  }

  selectCvAccount(index: number, account: AccountTitleDraft): void {
    this.chequeVoucherForm.accountTitles[index].accountNumber = account.accountNumber;
    this.chequeVoucherForm.accountTitles[index].description = account.description;
    this.cvAccountDropdownIndex = -1;
    this.cvAccountSearchResults = [];
  }

  closeCvAccountDropdown(index: number): void {
    setTimeout(() => {
      if (this.cvAccountDropdownIndex === index) {
        this.cvAccountDropdownIndex = -1;
        this.cvAccountSearchResults = [];
      }
    }, 150);
  }

  onEditCvAccountInput(index: number, value: string): void {
    const query = value.trim().toLowerCase();
    if (!query) {
      this.editCvAccountDropdownIndex = -1;
      this.editCvAccountSearchResults = [];
      return;
    }
    this.editCvAccountSearchResults = this.accountTitleCatalog
      .filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query),
      )
      .slice(0, 10);
    this.editCvAccountDropdownIndex = this.editCvAccountSearchResults.length > 0 ? index : -1;
  }

  selectEditCvAccount(index: number, account: AccountTitleDraft): void {
    this.editingVoucherForm.accountTitles[index].accountNumber = account.accountNumber;
    this.editingVoucherForm.accountTitles[index].description = account.description;
    this.editCvAccountDropdownIndex = -1;
    this.editCvAccountSearchResults = [];
  }

  closeEditCvAccountDropdown(index: number): void {
    setTimeout(() => {
      if (this.editCvAccountDropdownIndex === index) {
        this.editCvAccountDropdownIndex = -1;
        this.editCvAccountSearchResults = [];
      }
    }, 150);
  }

  private printTax2307Report(): void {
    const printWindow = window.open('', '', 'height=700,width=980');
    if (!printWindow) {
      this.reportError = 'Unable to open print window. Please allow popups and try again.';
      return;
    }

    const htmlContent = this.generateTax2307PrintHTML();
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);

    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
    }, { once: true });
  }

  private printGeneralJournalReport(): void {
    const printWindow = window.open('', '', 'height=700,width=980');
    if (!printWindow) {
      this.reportError = 'Unable to open print window. Please allow popups and try again.';
      return;
    }

    const htmlContent = this.generateGeneralJournalPrintHTML();
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);

    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
    }, { once: true });
  }

  private generateGeneralJournalPrintHTML(): string {
    const settings = this.generalJournalPrintSettings;
    const logoSrc = this.getGeneralJournalPrintLogoSrc();
    const headerLines = this.getGeneralJournalHeaderLines();
    const paperSize = settings.paperSize === 'CUSTOM'
      ? `${settings.customWidthMm}mm ${settings.customHeightMm}mm`
      : settings.paperSize === 'LETTER'
        ? 'Letter'
        : settings.paperSize === 'LEGAL'
          ? 'Legal'
          : 'A4';

    const rows = this.generalJournalForm.sundries
      .map((row) => ({
        accountNumber: String(row.accountNumber ?? '').trim(),
        description: String(row.description ?? '').trim(),
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
      }))
      .filter((row) => row.accountNumber || row.description || row.debit > 0 || row.credit > 0);

    const rowsHtml = rows
      .map((row) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.accountNumber || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.description || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${row.debit.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${row.credit.toFixed(2)}</td>
        </tr>
      `)
      .join('');

    const footerLeft = settings.footerLeft;
    const footerCenter = settings.footerCenter;
    const footerRight = settings.footerRight;
    const hasFooter = Boolean(footerLeft || footerCenter || footerRight);

    const signatories = this.getActiveGeneralJournalSignatories();
    const signatureColumns = signatories.length >= 4 ? 4 : signatories.length <= 1 ? 1 : signatories.length;
    const signatoriesHTML = signatories
      .map((signatory) => {
        const imageSrc = this.getSignatoryImageSrc(signatory);
        const displayName = String(signatory.customValue ?? '').trim();
        return `
          <div class="signature-box">
            ${imageSrc ? `<img src="${imageSrc}" alt="${signatory.label} signature" class="signature-image" />` : ''}
            <div style="font-weight:600; color:#111827; margin-bottom:2px;">${displayName}</div>
            <div>${signatory.label}</div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>General Journal Register</title>
        <style>
          @page {
            size: ${paperSize} ${settings.orientation};
            margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm;
          }
          body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
          .sheet { width: 100%; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px; }
          .logo { width: 140px; height: auto; object-fit: contain; }
          .contacts { color: #1f3f9a; font-size: 11px; line-height: 1.35; font-weight: 600; text-align: right; }
          .doc-title { text-align: right; margin: 8px 0 4px; font-size: 18px; font-weight: 700; color: #111827; }
          .doc-subtitle { text-align: right; margin: 0 0 18px; font-size: 12px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th { background-color: #f3f4f6; padding: 10px 8px; text-align: left; font-weight: 700; border-bottom: 2px solid #9ca3af; }
          .empty { padding: 18px; color: #6b7280; text-align: center; border-bottom: 1px solid #e5e7eb; }
          .right { text-align: right; }
          .grand-total td { font-weight: 700; background: #f9fafb; border-top: 2px solid #9ca3af; }
          .meta { margin-top: 12px; font-size: 12px; color: #374151; display: grid; gap: 4px; }
          .signature-grid { display: grid; grid-template-columns: repeat(${signatureColumns}, minmax(0, 1fr)); gap: 30px; margin-top: 40px; }
          .signature-box { border-top: 1px solid #000; padding-top: 6px; font-size: 11px; text-align: center; color: #555; }
          .signature-image { display: block; width: 100%; max-height: 52px; object-fit: contain; margin: 0 auto 4px; }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${settings.showHeader
            ? `<div class="top">
                <div>
                  ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Business Logo" />` : ''}
                </div>
                <div class="contacts">
                  ${headerLines.map((line) => `<div>${line}</div>`).join('')}
                </div>
              </div>`
            : ''}

          <div class="doc-title">GENERAL JOURNAL REGISTER</div>
          <div class="doc-subtitle">Journal No: ${this.generalJournalForm.journalNo || '-'} · Date: ${this.formatDateOnly(this.generalJournalForm.journalDate) || '-'}</div>

          <div class="meta">
            <div><strong>Description:</strong> ${String(this.generalJournalForm.description || '-')}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Account Number</th>
                <th>Description</th>
                <th class="right">Debit</th>
                <th class="right">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length > 0
                ? `${rowsHtml}
                  <tr class="grand-total">
                    <td colspan="2" style="padding: 10px 8px;">Grand Total</td>
                    <td style="padding: 10px 8px; text-align: right;">${this.generalJournalDebitTotal.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: right;">${this.generalJournalCreditTotal.toFixed(2)}</td>
                  </tr>`
                : '<tr><td colspan="4" class="empty">No sundry lines entered yet.</td></tr>'}
            </tbody>
          </table>

          ${hasFooter
            ? `<div style="margin-top: 16px; border-top: 1px dashed #d1d5db; padding-top: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: #4b5563; font-size: 11px;">
                <div style="text-align: left;">${footerLeft || ''}</div>
                <div style="text-align: center;">${footerCenter || ''}</div>
                <div style="text-align: right;">${footerRight || ''}</div>
              </div>`
            : ''}

          ${signatories.length > 0
            ? `<div class="signature-grid">
                ${signatoriesHTML}
              </div>`
            : ''}
        </div>
      </body>
      </html>
    `;
  }

  private generateTax2307PrintHTML(): string {
    const rows = this.withholdingTaxRows;
    const settings = this.tax2307PrintSettings;
    const logoSrc = this.getTax2307PrintLogoSrc();
    const headerLines = this.getTax2307HeaderLines();
    const paperSize = settings.paperSize === 'CUSTOM'
      ? `${settings.customWidthMm}mm ${settings.customHeightMm}mm`
      : settings.paperSize === 'LETTER'
        ? 'Letter'
        : settings.paperSize === 'LEGAL'
          ? 'Legal'
          : 'A4';
    const footerLeft = settings.footerLeft;
    const footerCenter = settings.footerCenter;
    const footerRight = settings.footerRight;
    const hasFooter = Boolean(footerLeft || footerCenter || footerRight);
    const tableRows = rows
      .map((row) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.referenceNo || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.tin || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${row.supplierName || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${row.vatableAmount.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${row.taxWithheld.toFixed(2)}</td>
        </tr>
      `)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>2307 Tax Report</title>
        <style>
          @page {
            size: ${paperSize} ${settings.orientation};
            margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm;
          }
          body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
          .sheet { width: 100%; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px; }
          .logo { width: 140px; height: auto; object-fit: contain; }
          .contacts { color: #1f3f9a; font-size: 11px; line-height: 1.35; font-weight: 600; text-align: right; }
          .doc-title { text-align: right; margin: 8px 0 4px; font-size: 18px; font-weight: 700; color: #111827; }
          .doc-subtitle { text-align: right; margin: 0 0 18px; font-size: 12px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th { background-color: #f3f4f6; padding: 10px 8px; text-align: left; font-weight: 700; border-bottom: 2px solid #9ca3af; }
          .empty { padding: 18px; color: #6b7280; text-align: center; border-bottom: 1px solid #e5e7eb; }
          .right { text-align: right; }
          .grand-total td { font-weight: 700; background: #f9fafb; border-top: 2px solid #9ca3af; }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${settings.showHeader
            ? `<div class="top">
                <div>
                  ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Business Logo" />` : ''}
                </div>
                <div class="contacts">
                  ${headerLines.map((line) => `<div>${line}</div>`).join('')}
                </div>
              </div>`
            : ''}

          <div class="doc-title">2307 TAX REPORT</div>
          <div class="doc-subtitle">For the Month of ${this.tax2307MonthLabel}</div>

          <table>
            <thead>
              <tr>
                <th>Reference No. (CV No.)</th>
                <th>TIN</th>
                <th>Supplier Name</th>
                <th class="right">Vatable Amount</th>
                <th class="right">Tax Withheld</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length > 0
                ? `${tableRows}
                  <tr class="grand-total">
                    <td colspan="3" style="padding: 10px 8px;">Grand Total</td>
                    <td style="padding: 10px 8px; text-align: right;">${this.withholdingVatableTotal.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: right;">${this.withholdingTaxTotal.toFixed(2)}</td>
                  </tr>`
                : '<tr><td colspan="5" class="empty">No 2307 tax lines for the selected date range.</td></tr>'}
            </tbody>
          </table>

          ${hasFooter
            ? `<div style="margin-top: 16px; border-top: 1px dashed #d1d5db; padding-top: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: #4b5563; font-size: 11px;">
                <div style="text-align: left;">${footerLeft || ''}</div>
                <div style="text-align: center;">${footerCenter || ''}</div>
                <div style="text-align: right;">${footerRight || ''}</div>
              </div>`
            : ''}
        </div>
      </body>
      </html>
    `;
  }

  private async generateTax2307FormsPdf(
    summaries: Tax2307SupplierSummary[],
    openInNewTab: boolean,
    previewInModal = false,
  ): Promise<void> {
    try {
      this.revokeTax2307PreviewUrl();
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const templateBytes = await fetch('/docs/2307Form.pdf').then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load 2307 form template.');
        }
        return response.arrayBuffer();
      });

      const templateDoc = await PDFDocument.load(templateBytes);
      const outputDoc = await PDFDocument.create();
      const font = await outputDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await outputDoc.embedFont(StandardFonts.HelveticaBold);

      for (const summary of summaries) {
        const [page] = await outputDoc.copyPages(templateDoc, [0]);
        outputDoc.addPage(page);

        const width = page.getWidth();
        const height = page.getHeight();
        const yFromTop = (topOffset: number) => height - topOffset;

        const draw = (
          text: string,
          x: number,
          topOffset: number,
          options?: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right' },
        ) => {
          const usedFont = options?.bold ? boldFont : font;
          const fontSize = options?.size ?? 9;
          let drawX = x;
          if (options?.align && options.align !== 'left') {
            const textWidth = usedFont.widthOfTextAtSize(String(text || ''), fontSize);
            if (options.align === 'center') {
              drawX = x - textWidth / 2;
            } else if (options.align === 'right') {
              drawX = x - textWidth;
            }
          }

          page.drawText(String(text || ''), {
            x: drawX,
            y: yFromTop(topOffset),
            size: fontSize,
            font: usedFont,
            color: rgb(0, 0, 0),
          });
        };

        const fromDate = this.formatDateOnly(this.tax2307DateFrom || new Date().toISOString());
        const toDate = this.formatDateOnly(this.tax2307DateTo || new Date().toISOString());
        const formatForForm = (isoDate: string) => {
          const parsedDate = new Date(isoDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return isoDate.replace(/\//g, '  ').replace(/\s+/g, '  ');
          }
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          const year = String(parsedDate.getFullYear());
          return `${month}    ${day}     ${year}`;
        };

        const normalizeTinForBoxes = (rawTin: string) => {
          const digits = String(rawTin || '').replace(/\D/g, '');
          const normalizedDigits = digits.slice(0, 9);
          if (!normalizedDigits) {
            return '000   000   000';
          }
          const parts = [];
          for (let i = 0; i < normalizedDigits.length; i += 3) {
            parts.push(normalizedDigits.slice(i, i + 3));
          }
          return parts.join('          ');
        };

        draw(formatForForm(fromDate), width * 0.31, 108, { size: 10, align: 'center', bold: true });
        draw(formatForForm(toDate), width * 0.68, 108, { size: 10, align: 'center', bold: true });

        draw(normalizeTinForBoxes(summary.tin || ''), width * 0.43, 139, { size: 10, align: 'center', bold: true });
        draw(summary.supplierName || '-', width * 0.08, 163, { size: 9, bold: true });
        draw(summary.supplierAddress || '-', width * 0.08, 189, { size: 9, bold: true });

        const businessTin = normalizeTinForBoxes(String(this.businessProfile?.businessTinNumber ?? '').trim() || '00000000000000');
        const businessName = String(this.businessProfile?.businessName ?? '').trim() || '';
        const businessAddress = String(this.businessProfile?.businessAddress ?? '').trim() || '';

        draw(businessTin, width * 0.43, 245, { size: 10, align: 'center', bold: true });
        draw(businessName, width * 0.08, 272, { size: 9, bold: true });
        draw(businessAddress || 'test address', width * 0.08, 297, { size: 9, bold: true });

        // Quarterly column logic based on voucher date month
        const firstRefDate = this.getTax2307BaseRows().find(
          (r: Tax2307ReportRow) => r.referenceNo === summary.references[0],
        )?.voucherDate;
        const voucherDate = new Date(firstRefDate || fromDate);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthOf = monthNames[voucherDate.getMonth()] || 'January';

        const quarters = [
          { quarter: '1st Q', months: ['January', 'April', 'July', 'October'] },
          { quarter: '2nd Q', months: ['February', 'May', 'August', 'November'] },
          { quarter: '3rd Q', months: ['March', 'June', 'September', 'December'] },
          { quarter: 'Total', months: [] },
          { quarter: 'taxWithHeld', months: [] },
        ];

        let quarterX = 210;
        let quarterY = 352;
        let qBottomX = 210;
        let qBottomY = 478;

        const fmtAmount = (val: number) => val.toLocaleString('en-US', {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        for (const q of quarters) {
          if (q.months.includes(monthOf)) {
            draw(fmtAmount(summary.vatableAmount), quarterX, quarterY, { size: 9 });
            draw(fmtAmount(summary.vatableAmount), qBottomX, qBottomY, { size: 9 });
          } else if (q.quarter === 'Total') {
            draw(fmtAmount(summary.vatableAmount), quarterX, quarterY, { size: 9 });
            draw(fmtAmount(summary.vatableAmount), qBottomX, qBottomY, { size: 9 });
          } else if (q.quarter === 'taxWithHeld') {
            draw(fmtAmount(summary.taxWithheld), quarterX + 20, quarterY, { size: 9 });
            draw(fmtAmount(summary.taxWithheld), qBottomX + 20, qBottomY, { size: 9 });
          }

          quarterX += 63;
          qBottomX += 63;
        }

        // Render signatory block at the bottom of each page
        await this.renderSignatoryBlock(page, outputDoc, font, boldFont, rgb, yFromTop);

      }

      const pdfBytes = await outputDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (previewInModal) {
        this.tax2307PreviewFilename = `2307-Tax-Form-${this.tax2307MonthLabel.replace(/\s+/g, '-')}.pdf`;
        this.tax2307PreviewObjectUrl = url;
        this.tax2307PreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.isTax2307PrintPreviewOpen = true;
        return;
      }

      if (openInNewTab) {
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = `2307-Tax-Forms-${this.tax2307MonthLabel.replace(/\s+/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('2307 form generation failed:', error);
      this.reportError = 'Failed to generate 2307 form PDF. Please try again.';
    }
  }

  /**
   * Renders the signatory block at the bottom of a 2307 PDF page.
   * Includes declaration text, signature image (if valid), printed name,
   * label, title/designation + TIN, and subtitle.
   */
  private async renderSignatoryBlock(
    page: import('pdf-lib').PDFPage,
    pdfDoc: import('pdf-lib').PDFDocument,
    font: import('pdf-lib').PDFFont,
    boldFont: import('pdf-lib').PDFFont,
    rgb: typeof import('pdf-lib').rgb,
    yFromTop: (topOffset: number) => number,
  ): Promise<void> {
    const settings = this.tax2307PrintSettings;

    const hasSignatory = !!(
      settings.signatoryName?.trim() ||
      settings.signatoryTitle?.trim() ||
      settings.signatoryTin?.trim() ||
      settings.signatoryImage
    );

    if (!hasSignatory) return;

    const fontSize = 8;
    const lineHeight = 11;
    const leftX = page.getWidth() * 0.4;
    const maxTextWidth = page.getWidth() * 0.84;
    let currentTopOffset = 630;

    // Helper to draw text at current position
    const drawText = (text: string, options?: { size?: number; bold?: boolean; x?: number }) => {
      const usedFont = options?.bold ? boldFont : font;
      const size = options?.size ?? fontSize;
      const x = options?.x ?? leftX;
      page.drawText(String(text || ''), {
        x,
        y: yFromTop(currentTopOffset),
        size,
        font: usedFont,
        color: rgb(0, 0, 0),
      });
    };

    // Helper to wrap text into lines that fit within maxWidth
    const wrapText = (text: string, maxWidth: number, usedFont: import('pdf-lib').PDFFont, size: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = usedFont.widthOfTextAtSize(testLine, size);
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    // // 1. Render declaration text
    // const declarationText =
    //   'I declare, under the penalties of perjury, that this certificate has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.';

    // const declarationLines = wrapText(declarationText, maxTextWidth, font, fontSize);
    // for (const line of declarationLines) {
    //   drawText(line);
    //   currentTopOffset += lineHeight;
    // }

    currentTopOffset += 30; // Extra spacing after declaration

    // 2. Render signature image (if valid base64 PNG/JPEG)
    const signatureImageAreaHeight = 40;
    if (settings.signatoryImage) {
      try {
        const imageData = settings.signatoryImage;
        let imageBytes: Uint8Array | null = null;
        let isPng = false;
        let isJpeg = false;

        if (imageData.startsWith('data:image/png;base64,')) {
          const base64 = imageData.replace('data:image/png;base64,', '');
          imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          isPng = true;
        } else if (imageData.startsWith('data:image/jpeg;base64,') || imageData.startsWith('data:image/jpg;base64,')) {
          const base64 = imageData.replace(/data:image\/jpe?g;base64,/, '');
          imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          isJpeg = true;
        }

        if (imageBytes && (isPng || isJpeg)) {
          const embeddedImage = isPng
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);

          // Scale to fit within 150x60 preserving aspect ratio
          const maxW = 100;
          const maxH = 40;
          const imgWidth = embeddedImage.width;
          const imgHeight = embeddedImage.height;
          const scale = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
          const scaledWidth = imgWidth * scale;
          const scaledHeight = imgHeight * scale;

          page.drawImage(embeddedImage, {
            x: leftX,
            y: yFromTop(currentTopOffset + scaledHeight),
            width: scaledWidth,
            height: scaledHeight,
          });
        }
      } catch {
        // Invalid image — render block without image (leave area blank)
      }
    }

    currentTopOffset += signatureImageAreaHeight - 10;

    // 3. Render printed name below signature image area
    if (settings.signatoryName?.trim()) {
      drawText(settings.signatoryName.trim(), { size: 8, bold: false });
    }
    currentTopOffset += lineHeight - 3;

    // // 4. Render label
    // drawText('Signature over Printed Name of Payor/Payor\'s Authorized Representative/Tax Agent', { size: fontSize });
    // currentTopOffset += lineHeight + 2;

    // 5. Render title/designation and TIN on next line
    const titleAndTin = [
      settings.signatoryTitle?.trim() || '',
      settings.signatoryTin?.trim() || '',
    ].filter(Boolean).join(' ');
    if (titleAndTin) {
      drawText(titleAndTin, { size: 8, x: page.getWidth() * 0.35 });
    }
    currentTopOffset += lineHeight;
  }

  printVoucher(): void {
    this.isPrintPreviewOpen = true;
  }

  printGeneralJournalEntry(entry?: GeneralJournalReleasedRecord): void {
    const journal = entry ?? this.viewingGeneralJournal;
    if (!journal) {
      return;
    }

    const printWindow = window.open('', '', 'height=760,width=980');
    if (!printWindow) {
      return;
    }

    const htmlContent = this.generateGeneralJournalEntryPrintHTML(journal);
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    setTimeout(triggerPrint, 250);
    printWindow.addEventListener(
      'afterprint',
      () => {
        printWindow.close();
      },
      { once: true },
    );
  }

  closePrintPreview(): void {
    this.isPrintPreviewOpen = false;
  }

  executePrint(): void {
    const printWindow = window.open('', '', 'height=700,width=980');
    if (!printWindow) {
      return;
    }

    const htmlContent = this.generatePrintHTML();
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    setTimeout(triggerPrint, 250);

    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
    }, { once: true });

    this.closePrintPreview();
  }

  getChequeVoucherPreviewData(): ChequeVoucherReleasedRecord {
    return this.viewingVoucher ?? this.dummyChequeVoucherPreview;
  }

  private generatePrintHTML(): string {
    const v = this.getChequeVoucherPreviewData();
    const bp = this.businessProfile;
    const addressWithZip = `${v.address || 'N/A'}${v.zipCode ? `, ${v.zipCode}` : ''}`;

    const showHeader = this.chequeVoucherPrintSettings.showHeader;
    const showPreparedBy = this.chequeVoucherPrintSettings.showPreparedBy;
    const showSignatureLine = this.chequeVoucherPrintSettings.showSignatureLine;
    const paperSize = this.chequeVoucherPrintSettings.paperSize === 'CUSTOM'
      ? `${this.chequeVoucherPrintSettings.customWidthMm}mm ${this.chequeVoucherPrintSettings.customHeightMm}mm`
      : this.chequeVoucherPrintSettings.paperSize === 'LETTER'
      ? 'Letter'
      : this.chequeVoucherPrintSettings.paperSize === 'LEGAL'
        ? 'Legal'
        : 'A4';
    const orientation = this.chequeVoucherPrintSettings.orientation;
    const marginTopMm = this.chequeVoucherPrintSettings.marginTopMm;
    const marginRightMm = this.chequeVoucherPrintSettings.marginRightMm;
    const marginBottomMm = this.chequeVoucherPrintSettings.marginBottomMm;
    const marginLeftMm = this.chequeVoucherPrintSettings.marginLeftMm;
    const footerLeft = this.chequeVoucherPrintSettings.footerLeft;
    const footerCenter = this.chequeVoucherPrintSettings.footerCenter;
    const footerRight = this.chequeVoucherPrintSettings.footerRight;
    const hasFooterNotes = Boolean(footerLeft || footerCenter || footerRight);
    const signatories = this.getActiveChequeVoucherSignatories();
    const logoSrc = this.getChequeVoucherPrintLogoSrc();
    const businessName = this.getChequeVoucherBusinessName();
    const headerLines = this.getChequeVoucherHeaderLines();
    const depositsHTML = v.deposits
      .map(
        (d) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.bankName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.chequeNo}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${this.formatDateOnly(d.chequeDate)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${(Number(d.amount) || 0).toFixed(2)}</td>
      </tr>
    `
      )
      .join('');

    const invoicesHTML = v.invoices
      .map(
        (i) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${i.invoiceNo}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${this.formatDateOnly(i.invoiceDate)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${i.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${(Number(i.amount) || 0).toFixed(2)}</td>
      </tr>
    `
      )
      .join('');

    const accountTitlesHTML = v.accountTitles
      .map(
        (a) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.accountNumber}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${(Number(a.debit) || 0).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${(Number(a.credit) || 0).toFixed(2)}</td>
      </tr>
    `
      )
      .join('');
    const accountTitleDebitTotal = this.getVoucherAccountTitleDebitTotal(v);
    const accountTitleCreditTotal = this.getVoucherAccountTitleCreditTotal(v);
    const signatureColumns = signatories.length >= 4 ? 4 : signatories.length <= 1 ? 1 : signatories.length;
    const signatoriesHTML = signatories
      .map((signatory) => {
        const imageSrc = this.getSignatoryImageSrc(signatory);
        const displayName = this.getSignatoryDisplayName(signatory, v);
        return `
          <div class="signature-box">
            ${imageSrc ? `<img src="${imageSrc}" alt="${signatory.label} signature" class="signature-image" />` : ''}
            <div style="font-weight:600; color:#111827; margin-bottom:2px;">${displayName}</div>
            <div>${signatory.label}</div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cheque Voucher - ${v.cvNo}</title>
        <style>
          @page {
            size: ${paperSize} ${orientation};
            margin: ${marginTopMm}mm ${marginRightMm}mm ${marginBottomMm}mm ${marginLeftMm}mm;
          }
          body { font-family: Arial, sans-serif; margin: 0; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px; }
          .logo { width: 140px; height: auto; object-fit: contain; }
          .contacts { color: #1f3f9a; font-size: 11px; line-height: 1.45; font-weight: 600; text-align: right; max-width: 320px; }
          .doc-title { text-align: right; margin: 8px 0 18px; font-size: 16px; font-weight: 600; color: #111827; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 12px; }
          .detail-row { margin-bottom: 8px; }
          .detail-label { font-weight: bold; color: #333; }
          .detail-value { color: #666; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { background-color: #f3f4f6; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; }
          .footer { margin-top: 30px; border-top: 2px solid #000; padding-top: 15px; font-size: 11px; color: #666; }
          .table-title { font-weight: bold; font-size: 13px; margin-bottom: 10px; margin-top: 15px; }
          .signature-grid { display: grid; grid-template-columns: repeat(${signatureColumns}, minmax(0, 1fr)); gap: 30px; margin-top: 40px; }
          .signature-box { border-top: 1px solid #000; padding-top: 6px; font-size: 11px; text-align: center; color: #555; }
          .signature-image { display: block; width: 100%; max-height: 52px; object-fit: contain; margin: 0 auto 4px; }
          .footer-notes { margin-top: 18px; padding-top: 8px; border-top: 1px dashed #d1d5db; display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: #6b7280; }
          .footer-notes .center { text-align: center; flex: 1; }
          .footer-notes .left, .footer-notes .right { width: 30%; }
          .footer-notes .right { text-align: right; }
        </style>
      </head>
      <body>
        ${showHeader ? `
        <div class="top">
          <div>
            ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="${businessName}" />` : `<div style="font-size:15px;font-weight:700;color:#111">${businessName}</div>`}
          </div>
          <div class="contacts">
            ${headerLines.map((line) => `<div>${line}</div>`).join('')}
          </div>
        </div>
        ` : ''}
        <div class="doc-title">Cheque Voucher ${v.cvNo}</div>

        <div class="details-grid">
          <div>
            <div class="detail-row">
              <div class="detail-label">Payee:</div>
              <div class="detail-value">${v.payee}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Address:</div>
              <div class="detail-value">${addressWithZip}</div>
            </div>
          </div>
          <div>
            <div class="detail-row">
              <div class="detail-label">Date:</div>
              <div class="detail-value">${this.formatDateOnly(v.voucherDate)}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">TIN:</div>
              <div class="detail-value">${v.tinNumber || 'N/A'}</div>
            </div>
          </div>
        </div>

        ${v.particulars ? `<div style="margin-bottom: 20px; font-size: 12px; border: 1px solid #e5e7eb; padding: 10px;"><strong>Particulars:</strong><br />${v.particulars.replace(/\n/g, '<br />')}</div>` : ''}

        ${v.deposits.length > 0 ? `
          <div class="table-title">Cheque Deposits</div>
          <table>
            <thead>
              <tr>
                <th>Bank Name</th>
                <th>Cheque No.</th>
                <th>Cheque Date</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${depositsHTML}
            </tbody>
          </table>
        ` : ''}

        ${v.invoices.length > 0 ? `
          <div class="table-title">Invoices</div>
          <table>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Invoice Date</th>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoicesHTML}
            </tbody>
          </table>
        ` : ''}

        ${v.accountTitles.length > 0 ? `
          <div class="table-title">Account Titles</div>
          <table>
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Description</th>
                <th style="text-align: right;">Debit</th>
                <th style="text-align: right;">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${accountTitlesHTML}
              <tr style="font-weight: 700; background-color: #f9fafb;">
                <td colspan="2" style="padding: 8px; border-top: 2px solid #9ca3af;">Total</td>
                <td style="padding: 8px; border-top: 2px solid #9ca3af; text-align: right;">${accountTitleDebitTotal.toFixed(2)}</td>
                <td style="padding: 8px; border-top: 2px solid #9ca3af; text-align: right;">${accountTitleCreditTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <p>Released on: ${this.formatDateOnly(v.releasedAt)}</p>
          ${showPreparedBy ? `<p>Prepared by: ${String(v.preparedBy ?? '').trim()}</p>` : ''}
        </div>

        ${hasFooterNotes ? `
        <div class="footer-notes">
          <div class="left">${footerLeft}</div>
          <div class="center">${footerCenter}</div>
          <div class="right">${footerRight}</div>
        </div>
        ` : ''}

        ${showSignatureLine && signatories.length > 0 ? `
        <div class="signature-grid">
          ${signatoriesHTML}
        </div>
        ` : ''}
      </body>
      </html>
    `;
  }

  private generateGeneralJournalEntryPrintHTML(entry: GeneralJournalReleasedRecord): string {
    const settings = this.generalJournalPrintSettings;
    const logoSrc = this.getGeneralJournalPrintLogoSrc();
    const headerLines = this.getGeneralJournalHeaderLines();
    const paperSize = settings.paperSize === 'CUSTOM'
      ? `${settings.customWidthMm}mm ${settings.customHeightMm}mm`
      : settings.paperSize === 'LETTER'
        ? 'Letter'
        : settings.paperSize === 'LEGAL'
          ? 'Legal'
          : 'A4';
    const footerLeft = settings.footerLeft;
    const footerCenter = settings.footerCenter;
    const footerRight = settings.footerRight;
    const hasFooter = Boolean(footerLeft || footerCenter || footerRight);

    const signatories = this.getActiveGeneralJournalSignatories();
    const signatureColumns = signatories.length >= 4 ? 4 : signatories.length <= 1 ? 1 : signatories.length;
    const signatoriesHTML = signatories
      .map((signatory) => {
        const imageSrc = this.getSignatoryImageSrc(signatory);
        const displayName = String(signatory.customValue ?? '').trim();
        return `
          <div class="signature-box">
            ${imageSrc ? `<img src="${imageSrc}" alt="${signatory.label} signature" class="signature-image" />` : ''}
            <div style="font-weight:600; color:#111827; margin-bottom:2px;">${displayName}</div>
            <div>${signatory.label}</div>
          </div>
        `;
      })
      .join('');

    const lineRows = entry.lines
      .map(
        (line) => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${line.accountNumber || '-'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${line.description || '-'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align:right;">${(Number(line.debit) || 0).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align:right;">${(Number(line.credit) || 0).toFixed(2)}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>General Journal Entry ${entry.journalNumber}</title>
          <style>
            @page {
              size: ${paperSize} ${settings.orientation};
              margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm;
            }
            body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
            .sheet { width: 100%; }
            .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px; }
            .logo { width: 140px; height: auto; object-fit: contain; }
            .contacts { color: #1f3f9a; font-size: 11px; line-height: 1.35; font-weight: 600; text-align: right; }
            .doc-title { text-align: right; margin: 8px 0 4px; font-size: 18px; font-weight: 700; color: #111827; }
            .doc-subtitle { text-align: right; margin: 0 0 18px; font-size: 12px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th { background-color: #f3f4f6; padding: 10px 8px; text-align: left; font-weight: 700; border-bottom: 2px solid #9ca3af; }
            .right { text-align: right; }
            .grand-total td { font-weight: 700; background: #f9fafb; border-top: 2px solid #9ca3af; }
            .meta { margin-top: 12px; font-size: 12px; color: #374151; display: grid; gap: 4px; }
            .signature-grid { display: grid; grid-template-columns: repeat(${signatureColumns}, minmax(0, 1fr)); gap: 30px; margin-top: 40px; }
            .signature-box { border-top: 1px solid #000; padding-top: 6px; font-size: 11px; text-align: center; color: #555; }
            .signature-image { display: block; width: 100%; max-height: 52px; object-fit: contain; margin: 0 auto 4px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            ${settings.showHeader
              ? `<div class="top">
                  <div>
                    ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Business Logo" />` : ''}
                  </div>
                  <div class="contacts">
                    ${headerLines.map((line) => `<div>${line}</div>`).join('')}
                  </div>
                </div>`
              : ''}

            <div class="doc-title">GENERAL JOURNAL ENTRY</div>
            <div class="doc-subtitle">Journal No: ${entry.journalNumber || '-'} · Date: ${this.formatDateOnly(entry.journalDate) || '-'}</div>

            <div class="meta">
              <div><strong>Description:</strong> ${String(entry.description || '-')}</div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Account Number</th>
                  <th>Description</th>
                  <th class="right">Debit</th>
                  <th class="right">Credit</th>
                </tr>
              </thead>
              <tbody>
                ${lineRows}
                <tr class="grand-total">
                  <td colspan="2" style="padding: 10px 8px;">Grand Total</td>
                  <td style="padding: 10px 8px; text-align: right;">${(Number(entry.totalDebit) || 0).toFixed(2)}</td>
                  <td style="padding: 10px 8px; text-align: right;">${(Number(entry.totalCredit) || 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            ${hasFooter
              ? `<div style="margin-top: 16px; border-top: 1px dashed #d1d5db; padding-top: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: #4b5563; font-size: 11px;">
                  <div style="text-align: left;">${footerLeft || ''}</div>
                  <div style="text-align: center;">${footerCenter || ''}</div>
                  <div style="text-align: right;">${footerRight || ''}</div>
                </div>`
              : ''}

            ${signatories.length > 0
              ? `<div class="signature-grid">
                  ${signatoriesHTML}
                </div>`
              : ''}
          </div>
        </body>
      </html>
    `;
  }

  getDisbursementRegisterPrintLogoSrc(): string | null {
    if (!this.disbursementRegisterPrintSettings.showLogo) {
      return null;
    }

    const bp = this.businessProfile;
    const logoVariant = bp?.printLogoVariant ?? 'light';
    return logoVariant === 'dark'
      ? (bp?.businessLogoDark ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo-dark.png`)
      : (bp?.businessLogoLight ?? bp?.businessLogo ?? `${window.location.origin}/images/fwdslogo.png`);
  }

  getDisbursementRegisterHeaderLines(): string[] {
    if (!this.disbursementRegisterPrintSettings.showAddress) {
      return [];
    }

    const bp = this.businessProfile;
    if (!bp) {
      return [];
    }

    const lines: string[] = [];
    if (bp.businessName) lines.push(bp.businessName);
    if (bp.printAddressDetails || bp.businessAddress) lines.push(String(bp.printAddressDetails ?? bp.businessAddress ?? ''));
    if (bp.businessContact) lines.push(bp.businessContact);
    if (bp.businessEmail) lines.push(bp.businessEmail);
    return lines.filter(Boolean);
  }

  printDisbursementRegister(): void {
    const printWindow = window.open('', '', 'height=760,width=1200');
    if (!printWindow) {
      return;
    }

    const htmlContent = this.generateDisbursementRegisterPrintHTML();
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    setTimeout(triggerPrint, 300);
    printWindow.addEventListener('afterprint', () => { printWindow.close(); }, { once: true });
  }

  private generateDisbursementRegisterPrintHTML(): string {
    const settings = this.disbursementRegisterPrintSettings;
    const data = this.disbursementRegisterData;
    const logoSrc = this.getDisbursementRegisterPrintLogoSrc();
    const headerLines = this.getDisbursementRegisterHeaderLines();
    const monthLabel = this.getDisbursementMonthLabel();
    const baseColumns = settings.baseColumns;
    const cols = settings.defaultColumns.filter((c) => c.accountNumber);

    const paperSize = settings.paperSize === 'CUSTOM'
      ? `${settings.customWidthMm}mm ${settings.customHeightMm}mm`
      : settings.paperSize === 'LETTER' ? 'Letter'
      : settings.paperSize === 'LEGAL' ? 'Legal' : 'A4';

    const footerLeft = settings.footerLeft;
    const footerCenter = settings.footerCenter;
    const footerRight = settings.footerRight;
    const hasFooter = Boolean(footerLeft || footerCenter || footerRight);

    const fixedColCount = baseColumns.length + cols.length;
    const totalColCount = fixedColCount + 4;

    const baseColHeaders = baseColumns
      .map((column) => `<th rowspan="2">${column.label || 'Column'}</th>`)
      .join('');

    const defaultColHeaders = cols
      .map((col) => `<th rowspan="2" style="text-align:right;white-space:nowrap;">${col.accountNumber}<br/><span style="font-size:8px;">${col.label}</span><br/>${col.side}.</th>`)
      .join('');

    const colTotals = cols.map((col) =>
      data.reduce((sum, cv) => sum + this.getDisbursementColumnAmountForCV(cv, col), 0),
    );

    let totalSundryDr = 0;
    let totalSundryCr = 0;
    for (const cv of data) {
      for (const s of this.getDisbursementSundryRowsForCV(cv)) {
        totalSundryDr += Number(s.debit) || 0;
        totalSundryCr += Number(s.credit) || 0;
      }
    }

    let rowsHtml = '';
    for (const cv of data) {
      const sundries = this.getDisbursementSundryRowsForCV(cv);
      const baseCells = baseColumns
        .map((column) => `<td>${this.getDisbursementBaseColumnValue(cv, column)}</td>`)
        .join('');

      const defaultCells = cols
        .map((col) => {
          const amt = this.getDisbursementColumnAmountForCV(cv, col);
          return amt > 0 ? `<td style="text-align:right;">${amt.toFixed(2)}</td>` : '<td></td>';
        })
        .join('');

      const firstSundry = sundries[0];
      const firstSundryHtml = firstSundry
        ? `<td>${firstSundry.accountNumber}</td><td>${firstSundry.description}</td>`
          + `<td style="text-align:right;">${(Number(firstSundry.debit) || 0) > 0 ? (Number(firstSundry.debit) || 0).toFixed(2) : ''}</td>`
          + `<td style="text-align:right;">${(Number(firstSundry.credit) || 0) > 0 ? (Number(firstSundry.credit) || 0).toFixed(2) : ''}</td>`
        : '<td></td><td></td><td></td><td></td>';

      rowsHtml += `<tr>
        ${baseCells}
        ${defaultCells}
        ${firstSundryHtml}
      </tr>`;

      for (let i = 1; i < sundries.length; i++) {
        const s = sundries[i];
        const blankFixed = baseColumns.map(() => '<td></td>').join('');
        const blankDefaults = cols.map(() => '<td></td>').join('');
        rowsHtml += `<tr>
          ${blankFixed}
          ${blankDefaults}
          <td>${s.accountNumber}</td><td>${s.description}</td>
          <td style="text-align:right;">${(Number(s.debit) || 0) > 0 ? (Number(s.debit) || 0).toFixed(2) : ''}</td>
          <td style="text-align:right;">${(Number(s.credit) || 0) > 0 ? (Number(s.credit) || 0).toFixed(2) : ''}</td>
        </tr>`;
      }
    }

    const blankFixedSpan = baseColumns.length;
    const totalCells = colTotals
      .map((t) => `<td style="text-align:right;font-weight:700;">${t > 0 ? t.toFixed(2) : ''}</td>`)
      .join('');
    const totalRowHtml = `<tr style="border-top:2px solid #333;background:#e5e7eb;">
      <td colspan="${blankFixedSpan}" style="font-weight:700;padding:4px 5px;">TOTAL</td>
      ${totalCells}
      <td></td><td></td>
      <td style="text-align:right;font-weight:700;">${totalSundryDr > 0 ? totalSundryDr.toFixed(2) : ''}</td>
      <td style="text-align:right;font-weight:700;">${totalSundryCr > 0 ? totalSundryCr.toFixed(2) : ''}</td>
    </tr>`;

    const sundryAccountSummary = this.getDisbursementSundryAccountSummary();
    const summaryRowsHtml = sundryAccountSummary.map((row) => `
      <tr>
        <td>${row.accountNumber}</td>
        <td>${row.description}</td>
        <td style="text-align:right;">${row.dr > 0 ? row.dr.toFixed(2) : ''}</td>
        <td style="text-align:right;">${row.cr > 0 ? row.cr.toFixed(2) : ''}</td>
      </tr>
    `).join('');

    const summaryTotalDr = sundryAccountSummary.reduce((s, r) => s + r.dr, 0);
    const summaryTotalCr = sundryAccountSummary.reduce((s, r) => s + r.cr, 0);
    const summaryTotalRow = `<tr style="font-weight:700;border-top:2px solid #333;background:#e5e7eb;">
      <td colspan="2" style="padding:4px 5px;font-weight:700;">Total</td>
      <td style="text-align:right;padding:4px 5px;font-weight:700;">${summaryTotalDr > 0 ? summaryTotalDr.toFixed(2) : ''}</td>
      <td style="text-align:right;padding:4px 5px;font-weight:700;">${summaryTotalCr > 0 ? summaryTotalCr.toFixed(2) : ''}</td>
    </tr>`;

    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Disbursement Register - ${monthLabel}</title>
        <style>
          @page { size: ${paperSize} ${settings.orientation}; margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm; }
          body { font-family: Arial, sans-serif; font-size: 9px; color: #111; margin: 0; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; }
          .logo { width: 110px; height: auto; object-fit: contain; }
          .contacts { color: #1f3f9a; font-size: 9px; line-height: 1.35; font-weight: 600; text-align: right; }
          .register-title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 4px 0 2px; }
          .register-sub { font-size: 10px; color: #374151; margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          td { padding: 3px 5px; vertical-align: middle; }
          th { padding: 5px; border-bottom: 2px solid #333; background: #d0d5dd; font-weight: 700; text-align: left; font-size: 8px; }
          .summary-section { page-break-inside: avoid; margin-top: 24px; }
          .summary-table { width: 55%; border-collapse: collapse; font-size: 9px; }
          .summary-table th { padding: 5px; border-bottom: 2px solid #333; background: #d0d5dd; font-weight: 700; text-align: left; font-size: 8px; }
          .summary-table td { padding: 3px 5px; vertical-align: middle; }
          .footer-notes { margin-top: 16px; border-top: 1px dashed #d1d5db; padding-top: 6px; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; font-size: 8px; color: #6b7280; }
        </style>
      </head>
      <body>
        ${settings.showHeader ? `<div class="top">
          <div>${logoSrc ? `<img src="${logoSrc}" class="logo" alt="Business Logo" />` : ''}</div>
          <div class="contacts">${headerLines.map((l) => `<div>${l}</div>`).join('')}</div>
        </div>` : ''}

        <div class="register-title">Disbursement Register</div>
        <div class="register-sub">For the Month of ${monthLabel}</div>

        <table>
          <thead>
            <tr>
              ${baseColHeaders}
              ${defaultColHeaders}
              <th colspan="4" style="text-align:center;">SUNDRIES</th>
            </tr>
            <tr>
              <th>Account #</th>
              <th>Account Title</th>
              <th style="text-align:right;">Dr.</th>
              <th style="text-align:right;">Cr.</th>
            </tr>
          </thead>
          <tbody>
            ${data.length > 0
              ? rowsHtml + totalRowHtml
              : `<tr><td colspan="${totalColCount}" style="text-align:center;padding:10px;color:#6b7280;">No disbursement records for ${monthLabel}.</td></tr>`}
          </tbody>
        </table>

        <div class="summary-section">
          <p class="register-title" style="margin-top:12px;">Summary of Sundries</p>
          <p class="register-sub">For the Month of ${monthLabel}</p>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Account #</th>
                <th>Account Description</th>
                <th style="text-align:right;">Dr</th>
                <th style="text-align:right;">Cr</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRowsHtml || '<tr><td colspan="4" style="text-align:center;padding:8px;color:#6b7280;">No sundry entries for this period.</td></tr>'}
              ${summaryTotalRow}
            </tbody>
          </table>
        </div>

        ${hasFooter ? `<div class="footer-notes">
          <div style="text-align:left;">${footerLeft}</div>
          <div style="text-align:center;">${footerCenter}</div>
          <div style="text-align:right;">${footerRight}</div>
        </div>` : ''}
      </body>
      </html>
    `;
  }

  async exportVoucherPDF(): Promise<void> {
    if (!this.viewingVoucher) {
      return;
    }

    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const v = this.viewingVoucher;
      const settings = this.chequeVoucherPrintSettings;
      const pageWidth = 612;
      const pageHeight = 792;
      const marginLeft = 50;
      const marginRight = 50;
      const contentWidth = pageWidth - marginLeft - marginRight;
      const fontSize = 9;
      const headerFontSize = 10;
      const titleFontSize = 14;
      const lineHeight = 14;
      const tableRowHeight = 16;
      const sectionGap = 16;

      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - 40;

      const addNewPage = () => {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - 40;
      };

      const ensureSpace = (needed: number) => {
        if (y - needed < 60) {
          addNewPage();
        }
      };

      const drawLine = (x1: number, y1: number, x2: number, thickness = 0.5) => {
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y1 },
          thickness,
          color: rgb(0.6, 0.6, 0.6),
        });
      };

      const formatCurrency = (amount: number): string => {
        return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      // === HEADER ===
      if (settings.showHeader) {
        const businessName = this.getChequeVoucherBusinessName();
        const headerLines = this.getChequeVoucherHeaderLines();

        // Try to embed logo
        const logoSrc = this.getChequeVoucherPrintLogoSrc();
        let logoEmbedded = false;
        if (logoSrc) {
          try {
            const logoResponse = await fetch(logoSrc);
            if (logoResponse.ok) {
              const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
              const isPng = logoSrc.toLowerCase().includes('.png') || logoBytes[0] === 0x89;
              const image = isPng
                ? await pdfDoc.embedPng(logoBytes)
                : await pdfDoc.embedJpg(logoBytes);
              const maxLogoHeight = 40;
              const maxLogoWidth = 140;
              const scale = Math.min(maxLogoWidth / image.width, maxLogoHeight / image.height, 1);
              const logoWidth = image.width * scale;
              const logoHeight = image.height * scale;
              page.drawImage(image, {
                x: marginLeft,
                y: y - logoHeight,
                width: logoWidth,
                height: logoHeight,
              });
              logoEmbedded = true;
            }
          } catch {
            // Logo embed failed, fall back to text
          }
        }

        if (!logoEmbedded) {
          page.drawText(businessName, {
            x: marginLeft,
            y: y - 12,
            size: 12,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
        }

        // Header lines (right-aligned)
        let headerY = y - 4;
        for (const line of headerLines) {
          const lineWidth = font.widthOfTextAtSize(line, 8);
          page.drawText(line, {
            x: pageWidth - marginRight - lineWidth,
            y: headerY,
            size: 8,
            font: font,
            color: rgb(0.12, 0.25, 0.6),
          });
          headerY -= 11;
        }

        y -= 48;
        drawLine(marginLeft, y, pageWidth - marginRight, 1);
        y -= sectionGap;
      }

      // === TITLE ===
      ensureSpace(30);
      const titleText = `Cheque Voucher`;
      const cvNoText = v.cvNo;
      const titleWidth = boldFont.widthOfTextAtSize(titleText, titleFontSize);
      const cvNoWidth = boldFont.widthOfTextAtSize(cvNoText, titleFontSize);
      page.drawText(titleText, {
        x: pageWidth - marginRight - titleWidth - cvNoWidth - 6,
        y,
        size: titleFontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      page.drawText(cvNoText, {
        x: pageWidth - marginRight - cvNoWidth,
        y,
        size: titleFontSize,
        font: boldFont,
        color: rgb(0.8, 0.2, 0.2),
      });
      y -= sectionGap + 8;

      // === DETAILS GRID ===
      ensureSpace(60);
      const colMid = marginLeft + contentWidth / 2;
      const detailLabelSize = 8;
      const detailValueSize = 9;

      // Left column
      page.drawText('Payee:', { x: marginLeft, y, size: detailLabelSize, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      page.drawText(v.payee || '-', { x: marginLeft, y, size: detailValueSize, font, color: rgb(0, 0, 0) });
      y -= 16;
      page.drawText('Address:', { x: marginLeft, y, size: detailLabelSize, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      const addressText = `${v.address || '-'}${v.zipCode ? `, ${v.zipCode}` : ''}`;
      page.drawText(addressText.substring(0, 60), { x: marginLeft, y, size: detailValueSize, font, color: rgb(0, 0, 0) });

      // Right column
      let rightY = y + 40;
      page.drawText('Date:', { x: colMid + 20, y: rightY, size: detailLabelSize, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      rightY -= 12;
      page.drawText(this.formatDateOnly(v.voucherDate), { x: colMid + 20, y: rightY, size: detailValueSize, font, color: rgb(0, 0, 0) });
      rightY -= 16;
      page.drawText('TIN:', { x: colMid + 20, y: rightY, size: detailLabelSize, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      rightY -= 12;
      page.drawText(v.tinNumber || 'N/A', { x: colMid + 20, y: rightY, size: detailValueSize, font, color: rgb(0, 0, 0) });

      y -= sectionGap + 4;

      // === PARTICULARS ===
      if (v.particulars) {
        ensureSpace(40);
        y -= 4;
        drawLine(marginLeft, y + 6, pageWidth - marginRight, 0.5);
        y -= 8;
        page.drawText('Particulars:', { x: marginLeft, y, size: fontSize, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
        y -= lineHeight;
        // Wrap particulars text
        const maxCharsPerLine = 90;
        const particularsLines = v.particulars.split('\n');
        for (const pLine of particularsLines) {
          const chunks = [];
          for (let i = 0; i < pLine.length; i += maxCharsPerLine) {
            chunks.push(pLine.substring(i, i + maxCharsPerLine));
          }
          if (chunks.length === 0) chunks.push('');
          for (const chunk of chunks) {
            ensureSpace(lineHeight);
            page.drawText(chunk, { x: marginLeft, y, size: fontSize, font, color: rgb(0, 0, 0) });
            y -= lineHeight;
          }
        }
        y -= 4;
      }

      // === DEPOSITS TABLE ===
      if (v.deposits.length > 0) {
        ensureSpace(50);
        y -= sectionGap;
        page.drawText('Cheque Deposits', { x: marginLeft, y, size: headerFontSize, font: boldFont, color: rgb(0, 0, 0) });
        y -= sectionGap;

        // Table header
        const depCols = [
          { label: 'Bank Name', x: marginLeft, width: 160 },
          { label: 'Cheque No.', x: marginLeft + 160, width: 120 },
          { label: 'Cheque Date', x: marginLeft + 280, width: 100 },
          { label: 'Amount', x: marginLeft + 380, width: contentWidth - 380, align: 'right' as const },
        ];

        // Header background
        page.drawRectangle({
          x: marginLeft,
          y: y - 3,
          width: contentWidth,
          height: tableRowHeight,
          color: rgb(0.95, 0.95, 0.95),
        });

        for (const col of depCols) {
          const text = col.label;
          if (col.align === 'right') {
            const tw = boldFont.widthOfTextAtSize(text, 8);
            page.drawText(text, { x: pageWidth - marginRight - tw, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          } else {
            page.drawText(text, { x: col.x, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          }
        }
        y -= 4;
        drawLine(marginLeft, y, pageWidth - marginRight, 1.5);
        y -= tableRowHeight - 4;

        // Table rows
        for (const deposit of v.deposits) {
          ensureSpace(tableRowHeight);
          page.drawText(String(deposit.bankName || '').substring(0, 30), { x: depCols[0].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          page.drawText(String(deposit.chequeNo || ''), { x: depCols[1].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          page.drawText(this.formatDateOnly(deposit.chequeDate), { x: depCols[2].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          const amtText = formatCurrency(Number(deposit.amount) || 0);
          const amtWidth = font.widthOfTextAtSize(amtText, fontSize);
          page.drawText(amtText, { x: pageWidth - marginRight - amtWidth, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= tableRowHeight;
          drawLine(marginLeft, y + 4, pageWidth - marginRight, 0.3);
        }
      }

      // === INVOICES TABLE ===
      if (v.invoices.length > 0) {
        ensureSpace(50);
        y -= sectionGap;
        page.drawText('Invoices', { x: marginLeft, y, size: headerFontSize, font: boldFont, color: rgb(0, 0, 0) });
        y -= sectionGap;

        const invCols = [
          { label: 'Invoice No.', x: marginLeft, width: 110 },
          { label: 'Invoice Date', x: marginLeft + 110, width: 100 },
          { label: 'Description', x: marginLeft + 210, width: 180 },
          { label: 'Amount', x: marginLeft + 390, width: contentWidth - 390, align: 'right' as const },
        ];

        // Header background
        page.drawRectangle({
          x: marginLeft,
          y: y - 3,
          width: contentWidth,
          height: tableRowHeight,
          color: rgb(0.95, 0.95, 0.95),
        });

        for (const col of invCols) {
          const text = col.label;
          if (col.align === 'right') {
            const tw = boldFont.widthOfTextAtSize(text, 8);
            page.drawText(text, { x: pageWidth - marginRight - tw, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          } else {
            page.drawText(text, { x: col.x, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          }
        }
        y -= 4;
        drawLine(marginLeft, y, pageWidth - marginRight, 1.5);
        y -= tableRowHeight - 4;

        for (const invoice of v.invoices) {
          ensureSpace(tableRowHeight);
          page.drawText(String(invoice.invoiceNo || '').substring(0, 20), { x: invCols[0].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          page.drawText(this.formatDateOnly(invoice.invoiceDate), { x: invCols[1].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          page.drawText(String(invoice.description || '').substring(0, 35), { x: invCols[2].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          const amtText = formatCurrency(Number(invoice.amount) || 0);
          const amtWidth = font.widthOfTextAtSize(amtText, fontSize);
          page.drawText(amtText, { x: pageWidth - marginRight - amtWidth, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= tableRowHeight;
          drawLine(marginLeft, y + 4, pageWidth - marginRight, 0.3);
        }
      }

      // === ACCOUNT TITLES TABLE ===
      if (v.accountTitles.length > 0) {
        ensureSpace(50);
        y -= sectionGap;
        page.drawText('Account Titles', { x: marginLeft, y, size: headerFontSize, font: boldFont, color: rgb(0, 0, 0) });
        y -= sectionGap;

        const acctCols = [
          { label: 'Account No.', x: marginLeft, width: 100 },
          { label: 'Description', x: marginLeft + 100, width: 220 },
          { label: 'Debit', x: marginLeft + 320, width: 95, align: 'right' as const },
          { label: 'Credit', x: marginLeft + 415, width: contentWidth - 415, align: 'right' as const },
        ];

        // Header background
        page.drawRectangle({
          x: marginLeft,
          y: y - 3,
          width: contentWidth,
          height: tableRowHeight,
          color: rgb(0.95, 0.95, 0.95),
        });

        for (const col of acctCols) {
          const text = col.label;
          if (col.align === 'right') {
            const colRightEdge = col.x + col.width;
            const tw = boldFont.widthOfTextAtSize(text, 8);
            page.drawText(text, { x: colRightEdge - tw, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          } else {
            page.drawText(text, { x: col.x, y, size: 8, font: boldFont, color: rgb(0, 0, 0) });
          }
        }
        y -= 4;
        drawLine(marginLeft, y, pageWidth - marginRight, 1.5);
        y -= tableRowHeight - 4;

        for (const acct of v.accountTitles) {
          ensureSpace(tableRowHeight);
          page.drawText(String(acct.accountNumber || '').substring(0, 18), { x: acctCols[0].x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          page.drawText(String(acct.description || '').substring(0, 40), { x: acctCols[1].x, y, size: fontSize, font, color: rgb(0, 0, 0) });

          const debitText = (Number(acct.debit) || 0) > 0 ? formatCurrency(Number(acct.debit)) : '-';
          const debitWidth = font.widthOfTextAtSize(debitText, fontSize);
          page.drawText(debitText, { x: acctCols[2].x + acctCols[2].width - debitWidth, y, size: fontSize, font, color: rgb(0, 0, 0) });

          const creditText = (Number(acct.credit) || 0) > 0 ? formatCurrency(Number(acct.credit)) : '-';
          const creditWidth = font.widthOfTextAtSize(creditText, fontSize);
          page.drawText(creditText, { x: acctCols[3].x + acctCols[3].width - creditWidth, y, size: fontSize, font, color: rgb(0, 0, 0) });

          y -= tableRowHeight;
          drawLine(marginLeft, y + 4, pageWidth - marginRight, 0.3);
        }

        // Totals row
        ensureSpace(tableRowHeight + 4);
        drawLine(marginLeft, y + 4, pageWidth - marginRight, 1.5);
        y -= 2;

        page.drawRectangle({
          x: marginLeft,
          y: y - 3,
          width: contentWidth,
          height: tableRowHeight,
          color: rgb(0.97, 0.97, 0.97),
        });

        page.drawText('Total', { x: marginLeft, y, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });

        const debitTotal = this.getVoucherAccountTitleDebitTotal(v);
        const creditTotal = this.getVoucherAccountTitleCreditTotal(v);

        const debitTotalText = formatCurrency(debitTotal);
        const debitTotalWidth = boldFont.widthOfTextAtSize(debitTotalText, fontSize);
        page.drawText(debitTotalText, { x: acctCols[2].x + acctCols[2].width - debitTotalWidth, y, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });

        const creditTotalText = formatCurrency(creditTotal);
        const creditTotalWidth = boldFont.widthOfTextAtSize(creditTotalText, fontSize);
        page.drawText(creditTotalText, { x: acctCols[3].x + acctCols[3].width - creditTotalWidth, y, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });

        y -= tableRowHeight;
      }

      // === FOOTER ===
      ensureSpace(60);
      y -= sectionGap + 8;
      drawLine(marginLeft, y + 6, pageWidth - marginRight, 1);
      y -= 8;
      page.drawText(`Released on: ${this.formatDateOnly(v.releasedAt)}`, { x: marginLeft, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
      if (settings.showPreparedBy && v.preparedBy) {
        page.drawText(`Prepared by: ${v.preparedBy}`, { x: marginLeft, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
        y -= 12;
      }

      // Footer notes
      const footerLeft = settings.footerLeft || '';
      const footerCenter = settings.footerCenter || '';
      const footerRight = settings.footerRight || '';
      if (footerLeft || footerCenter || footerRight) {
        y -= 8;
        drawLine(marginLeft, y + 6, pageWidth - marginRight, 0.3);
        y -= 6;
        if (footerLeft) {
          page.drawText(footerLeft, { x: marginLeft, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        }
        if (footerCenter) {
          const centerWidth = font.widthOfTextAtSize(footerCenter, 7);
          page.drawText(footerCenter, { x: (pageWidth - centerWidth) / 2, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        }
        if (footerRight) {
          const rightWidth = font.widthOfTextAtSize(footerRight, 7);
          page.drawText(footerRight, { x: pageWidth - marginRight - rightWidth, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        }
        y -= 12;
      }

      // === SIGNATORIES ===
      const signatories = this.getActiveChequeVoucherSignatories();
      if (settings.showSignatureLine && signatories.length > 0) {
        ensureSpace(70);
        y -= 30;
        const sigCount = Math.min(signatories.length, 4);
        const sigWidth = contentWidth / sigCount;

        for (let i = 0; i < sigCount; i++) {
          const signatory = signatories[i];
          const sigX = marginLeft + i * sigWidth;
          const sigCenterX = sigX + sigWidth / 2;

          // Signature image
          const imageSrc = this.getSignatoryImageSrc(signatory);
          if (imageSrc) {
            try {
              const sigResponse = await fetch(imageSrc);
              if (sigResponse.ok) {
                const sigBytes = new Uint8Array(await sigResponse.arrayBuffer());
                const isPng = imageSrc.toLowerCase().includes('.png') || sigBytes[0] === 0x89;
                const sigImage = isPng
                  ? await pdfDoc.embedPng(sigBytes)
                  : await pdfDoc.embedJpg(sigBytes);
                const maxSigH = 30;
                const maxSigW = sigWidth - 20;
                const sigScale = Math.min(maxSigW / sigImage.width, maxSigH / sigImage.height, 1);
                const sw = sigImage.width * sigScale;
                const sh = sigImage.height * sigScale;
                page.drawImage(sigImage, {
                  x: sigCenterX - sw / 2,
                  y: y + 4,
                  width: sw,
                  height: sh,
                });
              }
            } catch {
              // Signature image embed failed, skip
            }
          }

          // Line
          drawLine(sigX + 10, y, sigX + sigWidth - 10, 0.8);

          // Name
          const displayName = this.getSignatoryDisplayName(signatory, v);
          if (displayName) {
            const nameWidth = boldFont.widthOfTextAtSize(displayName, 8);
            page.drawText(displayName, { x: sigCenterX - nameWidth / 2, y: y - 12, size: 8, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
          }

          // Label
          const labelWidth = font.widthOfTextAtSize(signatory.label, 7);
          page.drawText(signatory.label, { x: sigCenterX - labelWidth / 2, y: y - 22, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CV-${v.cvNo}-${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export failed:', error);
      this.reportError = 'Failed to export PDF. Please try again.';
    }
  }
}
