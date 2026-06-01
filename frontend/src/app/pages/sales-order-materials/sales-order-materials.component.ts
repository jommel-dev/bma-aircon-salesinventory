import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  SalesOrderMaterialService,
  SalesOrderStatus,
  MaterialSalesOrderListItem,
  MaterialSalesOrderListMeta,
  MaterialSalesOrderListParams,
} from '../../shared/services/sales-order-material.service';
import { PrintSalesOrderService, PrintSalesOrderData } from '../../shared/services/print-sales-order.service';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

interface TabDefinition {
  key: SalesOrderStatus;
  label: string;
}

interface MigrationPreviewGroup {
  salesNo: string;
  dealer: string;
  itemCount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryDate: string;
  salesStatus: string;
}

@Component({
  selector: 'app-sales-order-materials',
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent],
  templateUrl: './sales-order-materials.component.html',
})
export class SalesOrderMaterialsComponent implements OnInit {
  // Make Math available in template
  Math = Math;

  // Tab definitions
  tabs: TabDefinition[] = [
    { key: 'draft', label: 'Draft' },
    { key: 'pending', label: 'Pending' },
    { key: 'complete', label: 'Complete' },
    { key: 'voided', label: 'Voided' },
  ];

  activeTab: SalesOrderStatus = 'draft';

  // List state
  orders: MaterialSalesOrderListItem[] = [];
  meta: MaterialSalesOrderListMeta = { page: 1, limit: 20, total: 0, totalPages: 0 };
  isLoading = false;
  errorMessage = '';

  // Search
  search = '';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly searchDebounceMs = 300;

  // Date filter (only active on Complete tab, defaults to current month)
  dateFrom: string = this.getFirstDayOfMonth();
  dateTo: string = this.getLastDayOfMonth();

  // Print modal state
  isPrintModalOpen = false;
  printPdfUrl: SafeResourceUrl | null = null;
  isPrintLoading = false;

  // Migration modal state
  isMigrateModalOpen = false;
  isMigrating = false;
  migrateProgress = '';
  migrateError = '';
  migrateFileName = '';
  migrateRows: any[] = [];
  migratePreview: MigrationPreviewGroup[] = [];
  migrateResults: { summary: { total: number; created: number; skipped: number; failed: number }; details: any[] } | null = null;
  migrateTargetStatus: 'draft' | 'pending' | 'complete' | 'voided' = 'pending';

  constructor(
    private salesOrderMaterialService: SalesOrderMaterialService,
    private printSalesOrderService: PrintSalesOrderService,
    private sanitizer: DomSanitizer,
    private router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadOrders();
  }

  async setTab(tab: SalesOrderStatus): Promise<void> {
    if (this.activeTab === tab) {
      return;
    }

    this.activeTab = tab;
    this.meta.page = 1;
    this.search = '';
    await this.loadOrders();
  }

  onSearchChange(value: string): void {
    this.search = value;

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.meta.page = 1;
      void this.loadOrders();
      this.searchDebounceTimer = null;
    }, this.searchDebounceMs);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.meta.totalPages) {
      return;
    }

    this.meta.page = page;
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const params: MaterialSalesOrderListParams = {
        status: this.activeTab,
        page: this.meta.page,
        limit: this.meta.limit,
        search: this.search.trim() || undefined,
        // Only send date filter on the Complete tab
        dateFrom: this.activeTab === 'complete' ? this.dateFrom : undefined,
        dateTo: this.activeTab === 'complete' ? this.dateTo : undefined,
      };

      const result = await this.salesOrderMaterialService.getMaterialSalesOrders(params);
      this.orders = result.items;
      this.meta = result.meta;
    } catch (err) {
      console.error('Failed to load material sales orders:', err);
      this.errorMessage = 'Unable to load sales orders. Please try again.';
      this.orders = [];
    } finally {
      this.isLoading = false;
    }
  }

  onDateFilterChange(): void {
    this.meta.page = 1;
    void this.loadOrders();
  }

  private getFirstDayOfMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private getLastDayOfMonth(): string {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }

  getPaymentMethodChipClass(method: string): string {
    const m = (method || '').toLowerCase().replace(/\s+/g, '');
    switch (m) {
      case 'cash': return 'border-green-300 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/20 dark:text-green-300';
      case 'gcash': return 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300';
      case 'banktransfer': return 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300';
      case 'cheque': return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300';
      case 'terms':
      case 'termswithdp': return 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-600 dark:bg-purple-900/20 dark:text-purple-300';
      case 'creditcard': return 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-600 dark:bg-pink-900/20 dark:text-pink-300';
      case 'installment': return 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-900/20 dark:text-orange-300';
      default: return 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300';
    }
  }

  getPaymentStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'unpaid': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'partial': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusClass(status: string): string {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'complete':
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'voided':
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'draft':
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value ?? 0);
  }

  canPrint(status: string): boolean {
    const s = (status || '').toLowerCase();
    return s === 'pending' || s === 'complete';
  }

  async onPrintOrder(orderId: number, soNumber: string | null): Promise<void> {
    this.isPrintLoading = true;
    this.isPrintModalOpen = true;
    this.printPdfUrl = null;

    try {
      const order = await this.salesOrderMaterialService.getMaterialSalesOrderById(orderId);

      // Build payment term label
      let paymentTerm = '';
      if (order.paymentDetails && order.paymentDetails.length > 0) {
        const payment = order.paymentDetails[0];
        if (payment.method === 'Terms') {
          paymentTerm = `TERMS ${payment.terms || ''} Day(s)`;
        } else {
          paymentTerm = payment.method || '';
        }
      }

      // Format delivery date
      const deliveryDate = order.scheduleDate
        ? new Date(order.scheduleDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : '';

      const printData: PrintSalesOrderData = {
        dealer: order.customerName || '',
        address: order.customerAddress || '',
        deliveryDate,
        soNumber: order.soNumber || '',
        paymentTerm,
        terms: order.paymentDetails?.[0]?.terms || '',
        totalAmount: order.totalAmount || 0,
        items: (order.productItems || []).map(item => ({
          quantity: item.qty,
          unit: 'pcs',
          description: item.description || '',
          unitPrice: item.rate,
          amount: item.total,
        })),
      };

      const dataUri = await this.printSalesOrderService.generatePdf(printData);
      this.printPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUri);
    } catch (err) {
      console.error('Failed to generate print PDF:', err);
      this.isPrintModalOpen = false;
      this.printPdfUrl = null;
    } finally {
      this.isPrintLoading = false;
    }
  }

  closePrintModal(): void {
    this.isPrintModalOpen = false;
    this.printPdfUrl = null;
  }

  onCreateOrder(): void {
    this.router.navigate(['/users/sales-order-materials/create']);
  }

  onEditOrder(orderId: number): void {
    this.router.navigate(['/users/sales-order-materials/edit', orderId]);
  }

  // ─── Migration Methods ──────────────────────────────────────────────────────

  openMigrateModal(): void {
    this.migrateError = '';
    this.migrateRows = [];
    this.migrateFileName = '';
    this.migratePreview = [];
    this.migrateResults = null;
    this.isMigrating = false;
    this.migrateTargetStatus = 'pending';
    this.isMigrateModalOpen = true;
  }

  closeMigrateModal(): void {
    this.isMigrateModalOpen = false;
    this.migrateError = '';
    this.migrateRows = [];
    this.migrateFileName = '';
    this.migratePreview = [];
    this.migrateResults = null;
  }

  async onMigrateFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.migrateFileName = file.name;
    this.migrateError = '';
    this.migrateRows = [];
    this.migratePreview = [];
    this.migrateResults = null;

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'csv') {
        await this.parseMigrateCsv(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        await this.parseMigrateExcel(file);
      } else {
        this.migrateError = 'Unsupported file type. Please upload a .csv or .xlsx file.';
      }
    } catch (err: any) {
      this.migrateError = err?.message || 'Failed to parse file.';
    }

    input.value = '';
  }

  private async parseMigrateCsv(file: File): Promise<void> {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      this.migrateError = 'CSV file must have a header row and at least one data row.';
      return;
    }

    const headers = this.parseCsvLine(lines[0]).map(h => h.trim());
    if (!headers.includes('salesNo')) {
      this.migrateError = 'CSV must contain a "salesNo" column.';
      return;
    }

    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: any = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j]?.trim() ?? '';
      }
      if (row['salesNo']?.trim()) {
        rows.push(row);
      }
    }

    this.migrateRows = rows;
    this.buildMigratePreview();
  }

  private async parseMigrateExcel(file: File): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      this.migrateError = 'Excel file must have a header row and at least one data row.';
      return;
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = (cell.value?.toString() ?? '').trim();
    });

    if (!headers.includes('salesNo')) {
      this.migrateError = 'Excel file must contain a "salesNo" column.';
      return;
    }

    const rows: any[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const rowObj: any = {};
      let hasData = false;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const key = headers[colNumber - 1];
        if (key) {
          const val = cell.value?.toString()?.trim() ?? '';
          rowObj[key] = val;
          if (val) hasData = true;
        }
      });

      if (hasData && rowObj['salesNo']?.trim()) {
        rows.push(rowObj);
      }
    }

    this.migrateRows = rows;
    this.buildMigratePreview();
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private normalizeSalesStatus(raw: string): string {
    const s = String(raw ?? '').trim().toLowerCase();
    if (['pending', 'approved', 'confirmed', 'for_delivery', 'for-delivery'].includes(s)) return 'pending';
    if (['complete', 'completed', 'done', 'delivered', 'closed'].includes(s)) return 'complete';
    if (['voided', 'void', 'cancelled', 'canceled', 'rejected'].includes(s)) return 'voided';
    return 'draft'; // default
  }

  private buildMigratePreview(): void {
    const grouped = new Map<string, any[]>();
    for (const row of this.migrateRows) {
      const salesNo = row['salesNo'] ?? '';
      if (!grouped.has(salesNo)) grouped.set(salesNo, []);
      grouped.get(salesNo)!.push(row);
    }

    this.migratePreview = Array.from(grouped.entries()).map(([salesNo, items]) => {
      let total = 0;
      for (const item of items) {
        const price = Number(item['price']) || 0;
        const qty = Number(item['quantity']) || 0;
        total += price * qty;
      }
      const firstRow = items[0];
      return {
        salesNo,
        dealer: firstRow['dealer'] ?? '—',
        itemCount: items.length,
        total: Math.round(total * 100) / 100,
        paymentMethod: firstRow['paymentTerm'] ?? '—',
        paymentStatus: firstRow['paymentStatus'] ?? '—',
        deliveryDate: firstRow['deliveryDate'] ?? '—',
        salesStatus: this.normalizeSalesStatus(firstRow['status'] ?? firstRow['salesStatus'] ?? ''),
      };
    });
  }

  async submitMigration(): Promise<void> {
    if (this.migrateRows.length === 0) {
      this.migrateError = 'No rows to migrate.';
      return;
    }

    this.isMigrating = true;
    this.migrateError = '';
    this.migrateResults = null;
    this.migrateProgress = 'Preparing migration...';

    try {
      // Group rows by salesNo first, then batch by complete orders (max 50 orders per batch)
      const ORDERS_PER_BATCH = 50;
      const grouped = new Map<string, any[]>();
      for (const row of this.migrateRows) {
        const salesNo = row['salesNo'] ?? row['poNo'] ?? '';
        if (!salesNo) continue;
        if (!grouped.has(salesNo)) grouped.set(salesNo, []);
        grouped.get(salesNo)!.push(row);
      }

      const allSalesNos = Array.from(grouped.keys());
      const totalBatches = Math.ceil(allSalesNos.length / ORDERS_PER_BATCH);
      const combinedSummary = { total: 0, created: 0, skipped: 0, failed: 0 };
      const combinedDetails: any[] = [];

      // Send batches of complete orders
      for (let i = 0; i < allSalesNos.length; i += ORDERS_PER_BATCH) {
        const batchNum = Math.floor(i / ORDERS_PER_BATCH) + 1;
        const batchKeys = allSalesNos.slice(i, i + ORDERS_PER_BATCH);
        const batchRows: any[] = [];
        for (const key of batchKeys) {
          batchRows.push(...grouped.get(key)!);
        }

        this.migrateProgress = `Processing batch ${batchNum} of ${totalBatches} (${combinedSummary.created} created so far)...`;

        const result = await this.salesOrderMaterialService.migrateSalesOrders(batchRows);

        combinedSummary.total += result.summary?.total ?? 0;
        combinedSummary.created += result.summary?.created ?? 0;
        combinedSummary.skipped += result.summary?.skipped ?? 0;
        combinedSummary.failed += result.summary?.failed ?? 0;

        if (result.details) {
          combinedDetails.push(...result.details);
        }
      }

      this.migrateProgress = '';
      this.migrateResults = {
        summary: combinedSummary,
        details: combinedDetails,
      };

      // Refresh the list after migration
      await this.loadOrders();
    } catch (err: any) {
      this.migrateProgress = '';
      this.migrateError =
        err?.response?.data?.message ||
        err?.message ||
        'Migration failed. Please try again.';
    } finally {
      this.isMigrating = false;
    }
  }
}
