import { Component, HostListener, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  DashboardActivityItem,
  DashboardKpiCard,
  DashboardOperationDetailMode,
  DashboardOpsItem,
  DashboardReceivableVerificationMode,
  DashboardSalesDetailMode,
  DashboardSettlementMode,
  DashboardService,
} from '../../../shared/services/dashboard.service';
import { RbacService } from '../../../shared/services/rbac.service';
import { PrintUnpaidReportService } from '../../../shared/services/print-unpaid-report.service'; // Adjust path accordingly

@Component({
  selector: 'app-ecommerce',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './ecommerce.component.html',
})
export class EcommerceComponent implements OnInit {
  isLoadingDashboard = false;
  dashboardError = '';
  todayFocus = '-';
  lastUpdatedLabel = '—';
  isAdminUser = false;
  isSuperAdmin = false;

  netoData = { gross: 0, discounts: 0, returns: 0, neto: 0, outstanding: 0 };

  topKpis: DashboardKpiCard[] = [
    { label: 'Active Pending SO', value: '0', change: '0', trend: 'up' },
    { label: 'Completed SO', value: '0', change: '0', trend: 'up' },
    { label: 'Draft / Quotation', value: '0', change: '0', trend: 'up' },
    { label: 'Total Sales Orders', value: '0', change: '0', trend: 'up' },
  ];

  operations: DashboardOpsItem[] = [
    { label: 'Total Purchase Orders', value: '-', hint: '-', level: 'normal' },
    { label: 'Total Credit Terms', value: '-', hint: '-', level: 'normal' },
    { label: 'Total Paid Purchases', value: '-', hint: '-', level: 'normal' },
    { label: 'Stock Alert', value: '-', hint: '-', level: 'normal' },
  ];

  salesSummary: DashboardKpiCard[] = [
    { label: 'Collected Sales', value: '0', change: '0%', trend: 'up' },
    { label: 'Unpaid S.O.', value: '0', change: '0%', trend: 'down' },
    { label: 'Overdues', value: '0', change: '0%', trend: 'down' },
    { label: 'Cheques', value: '0', change: '0%', trend: 'up' },
  ];

  topCustomers: Array<{ rank: number; name: string; totalAmount: number; orderCount: number }> = [];

  topSuppliers: Array<{ rank: number; name: string; totalAmount: number; poCount: number }> = [];

  topEmployees: Array<{ rank: number; name: string; totalSales: number; orderCount: number }> = [];

  activityFeed: DashboardActivityItem[] = [
    { time: '--:--', text: '-', status: 'received' },
    { time: '--:--', text: '-', status: 'dispatch' },
    { time: '--:--', text: '-', status: 'install' },
    { time: '--:--', text: '-', status: 'payment' },
  ];

  // Sales Summary Modal
  expandedSalesSummaryMode: DashboardSalesDetailMode | null = null;
  salesSummaryDetailItems: Array<{ id?: string | number; [key: string]: unknown }> = [];
  salesSummaryLoading = false;
  salesSummarySearch = '';
  settlementBusy = false;
  settlementError = '';
  settlementTarget: {
    salesOrderId: number;
    soNumber: string;
    customer: string;
    balance: number;
  } | null = null;
  settlementMode: DashboardSettlementMode = 'partial';
  settlementAmount = '';
  splitBankAmount = '';
  splitChequeAmount = '';
  settlementBankName = '';
  settlementCheckNo = '';
  settlementPostDated = '';
  verifyingReceivableId: number | null = null;

  // Operations Control Modal
  expandedOperationMode: DashboardOperationDetailMode | null = null;
  operationDetailItems: Array<{ id?: string | number; [key: string]: unknown }> = [];
  operationDetailLoading = false;
  poSettlementBusy = false;
  poSettlementError = '';
  poSettlementTarget: {
    purchaseOrderId: number;
    paymentId?: string;
    poNumber: string;
    vendor: string;
    balance: number;
  } | null = null;

  // Export Generation Unpaid
  isGeneratingPdfReport = false;


  private readonly operationModes: DashboardOperationDetailMode[] = [
    'purchase-orders',
    'credit-terms',
    'paid-purchases',
    'stock-alerts',
  ];

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly rbacService: RbacService,
    private readonly printReportService: PrintUnpaidReportService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.isAdminUser = this.rbacService.isAdminOrSuperAdmin();
    this.isSuperAdmin = String(this.rbacService.getPayload()?.roleName ?? '').trim().toLowerCase() === 'superadmin'
      || String(this.rbacService.getPayload()?.roleName ?? '').trim().toLowerCase() === 'super admin';
    void this.loadDashboardOverview();
  }

  async downloadUnpaidOverviewReport(): Promise<void> {
    const activeItems = this.salesSummaryDetailItems || [];

    if (activeItems.length === 0) {
      alert('No records loaded within the active dashboard viewpoint view. Change filters or refresh data.');
      return;
    }

    this.isGeneratingPdfReport = true;

    try {
      // Map the generic array data safely to the strict UnpaidReportRow contract
      const formattedRows = activeItems.map((item: any) => ({
        id: item.soNumber ?? '-',
        customer: String(item.customer ?? 'Walk-in Customer'),
        method: item.method,
        totalAmount: Number(item.totalAmount ?? 0),
        paid: Number(item.paid ?? 0),
        balance: Number(item.balance ?? 0),
        dueDate: item.dueDate,
        status: item.status
      }));

      const objectUrl = await this.printReportService.generatePdf(formattedRows);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `Unpaid_Sales_Summary_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Error constructing custom pdf-lib landscape data export document matrix:', error);
    } finally {
      this.isGeneratingPdfReport = false;
    }
  }

  async loadDashboardOverview(): Promise<void> {
    this.isLoadingDashboard = true;
    this.dashboardError = '';

    try {
      const payload = await this.dashboardService.getOverview();
      this.topKpis = Array.isArray(payload.topKpis) && payload.topKpis.length > 0 ? payload.topKpis : this.topKpis;
      this.operations = Array.isArray(payload.operations) && payload.operations.length > 0 ? payload.operations : this.operations;
      this.salesSummary = Array.isArray(payload.salesSummary) && payload.salesSummary.length > 0 ? payload.salesSummary : this.salesSummary;
      this.topCustomers = Array.isArray(payload.topCustomers) ? payload.topCustomers : this.topCustomers;
      this.topSuppliers = Array.isArray(payload.topSuppliers) ? payload.topSuppliers : this.topSuppliers;
      this.topEmployees = Array.isArray(payload.topEmployees) ? payload.topEmployees : this.topEmployees;
      this.netoData = payload.netoData ?? this.netoData;
      this.activityFeed = Array.isArray(payload.activityFeed) && payload.activityFeed.length > 0 ? payload.activityFeed : this.activityFeed;
      this.todayFocus = String(payload.todayFocus ?? '').trim() || this.todayFocus;
      this.lastUpdatedLabel = this.formatDateTime(payload.generatedAt);
    } catch (error: unknown) {
      this.dashboardError =
        error instanceof Error ? error.message : 'Unable to load dashboard overview';
      this.lastUpdatedLabel = this.formatDateTime(new Date().toISOString());
    } finally {
      this.isLoadingDashboard = false;
    }
  }

  refreshDashboard(): void {
    void this.loadDashboardOverview();
  }

  getOperationMode(index: number): DashboardOperationDetailMode {
    return this.operationModes[index] ?? 'receiving';
  }

  getTrendClass(trend: 'up' | 'down'): string {
    return trend === 'up'
      ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400'
      : 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400';
  }

  getOpsLevelClass(level: DashboardOpsItem['level']): string {
    if (level === 'critical') {
      return 'border-error-200 bg-error-50/60 dark:border-error-500/30 dark:bg-error-500/10';
    }

    if (level === 'warning') {
      return 'border-warning-200 bg-warning-50/60 dark:border-warning-500/30 dark:bg-warning-500/10';
    }

    return 'border-gray-200 bg-white dark:border-gray-700 dark:bg-white/[0.03]';
  }

  getActivityDotClass(status: DashboardActivityItem['status']): string {
    if (status === 'dispatch') {
      return 'bg-brand-500';
    }

    if (status === 'install') {
      return 'bg-warning-500';
    }

    if (status === 'payment') {
      return 'bg-success-500';
    }

    return 'bg-gray-500';
  }

  // Sales Summary Modal Methods
  openSalesSummaryDetail(mode: DashboardSalesDetailMode): void {
    this.closeOperationDetail();
    this.closeSettlementModal();
    this.expandedSalesSummaryMode = mode;
    this.salesSummarySearch = '';
    this.salesSummaryLoading = true;
    void this.fetchSalesSummaryDetail(mode);
  }

  closeSalesSummaryDetail(): void {
    this.expandedSalesSummaryMode = null;
    this.salesSummaryDetailItems = [];
    this.salesSummaryLoading = false;
    this.closeSettlementModal();
  }

  openOperationDetail(mode: DashboardOperationDetailMode): void {
    this.closeSalesSummaryDetail();
    this.closePoSettlementModal();
    this.expandedOperationMode = mode;
    this.operationDetailLoading = true;
    void this.fetchOperationDetail(mode);
  }

  closeOperationDetail(): void {
    this.expandedOperationMode = null;
    this.operationDetailItems = [];
    this.operationDetailLoading = false;
    this.closePoSettlementModal();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.expandedSalesSummaryMode) {
      this.closeSalesSummaryDetail();
      return;
    }

    if (this.expandedOperationMode) {
      this.closeOperationDetail();
    }
  }

  trackSalesSummaryDetailRow(index: number, item: { id?: string | number; [key: string]: unknown }): string | number {
    return item['id'] ?? index;
  }

  getFilteredSalesSummaryItems(): Array<{ id?: string | number; [key: string]: unknown }> {
    const search = (this.salesSummarySearch ?? '').trim().toLowerCase();
    if (!search) return this.salesSummaryDetailItems;
    return this.salesSummaryDetailItems.filter(item => {
      const soNumber = String(item['soNumber'] ?? '').toLowerCase();
      const customer = String(item['customer'] ?? '').toLowerCase();
      return soNumber.includes(search) || customer.includes(search);
    });
  }

  trackOperationDetailRow(index: number, item: { id?: string | number; [key: string]: unknown }): string | number {
    return item['id'] ?? index;
  }

  formatCurrencyValue(value: unknown): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return 'PHP 0.00';
    }

    return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatDateValue(value: unknown): string {
    if (!value) {
      return '-';
    }

    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatTextValue(value: unknown, fallback = '-'): string {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : fallback;
  }

  getSalesStatusClass(status: unknown): string {
    const normalized = String(status ?? '').trim().toLowerCase();

    if (['paid', 'posted', 'cleared', 'approved', 'delivered', 'released', 'remitted'].includes(normalized)) {
      return 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400';
    }

    if (['pending', 'partial', 'in-progress'].includes(normalized)) {
      return 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400';
    }

    if (['overdue', 'bounced', 'cancelled', 'rejected'].includes(normalized)) {
      return 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  getOperationStatusClass(status: unknown): string {
    return this.getSalesStatusClass(status);
  }

  getSettlementActionClass(mode: DashboardSettlementMode): string {
    return this.settlementMode === mode
      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-300'
      : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  private formatDateTime(value: unknown): string {
    const parsed = new Date(String(value ?? ''));
    if (Number.isNaN(parsed.getTime())) {
      return '—';
    }

    return parsed.toLocaleString('en-PH', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getOperationModalTitle(): string {
    if (this.expandedOperationMode === 'purchase-orders') {
      return 'Purchase Orders';
    }

    if (this.expandedOperationMode === 'credit-terms') {
      return 'Unpaid Credit Terms';
    }

    if (this.expandedOperationMode === 'paid-purchases') {
      return 'Paid Purchases';
    }

    if (this.expandedOperationMode === 'stock-alerts') {
      return 'Stock Alerts';
    }

    return 'Operations Detail';
  }

  getStockStatusClass(status: unknown): string {
    const normalized = String(status ?? '').trim().toLowerCase();

    if (normalized === 'out-of-stock') {
      return 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400';
    }

    if (normalized === 'low-stock') {
      return 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  openPoSettlementModal(item: { [key: string]: unknown }): void {
    const purchaseOrderId = Number(item['poId'] ?? item['id']);
    const balance = Number(item['balance']);
    if (!Number.isFinite(purchaseOrderId) || purchaseOrderId <= 0 || !Number.isFinite(balance) || balance <= 0) {
      return;
    }

    this.poSettlementTarget = {
      purchaseOrderId,
      paymentId: String(item['paymentId'] ?? '').trim() || undefined,
      poNumber: this.formatTextValue(item['poNumber']),
      vendor: this.formatTextValue(item['vendor']),
      balance,
    };
    this.poSettlementError = '';
  }

  closePoSettlementModal(): void {
    this.poSettlementTarget = null;
    this.poSettlementError = '';
    this.poSettlementBusy = false;
  }

  async submitPoSettlement(): Promise<void> {
    if (!this.poSettlementTarget || this.poSettlementBusy) {
      return;
    }

    this.poSettlementBusy = true;
    this.poSettlementError = '';

    try {
      await this.dashboardService.settlePurchaseOrder({
        purchaseOrderId: this.poSettlementTarget.purchaseOrderId,
        paymentId: this.poSettlementTarget.paymentId,
      });

      const currentMode = this.expandedOperationMode;
      this.closePoSettlementModal();
      await this.loadDashboardOverview();
      if (currentMode) {
        this.operationDetailLoading = true;
        await this.fetchOperationDetail(currentMode);
      }
    } catch (error: unknown) {
      this.poSettlementError = error instanceof Error ? error.message : 'Unable to record settlement.';
    } finally {
      this.poSettlementBusy = false;
    }
  }

  restockMaterial(item: { [key: string]: unknown }): void {
    const materialId = Number(item['materialId'] ?? item['id']);
    void this.router.navigate(['/users/purchase-order-materials/new'], {
      queryParams: materialId > 0 ? { materialId } : undefined,
    });
  }

  viewMaterialInInventory(item: { [key: string]: unknown }): void {
    const materialId = Number(item['materialId'] ?? item['id']);
    void this.router.navigate(['/users/inventory'], {
      queryParams: materialId > 0 ? { materialId } : undefined,
    });
  }

  openSettlementModal(item: { [key: string]: unknown }): void {
    const salesOrderId = Number(item['soId']);
    const balance = Number(item['balance']);
    if (!Number.isFinite(salesOrderId) || salesOrderId <= 0 || !Number.isFinite(balance) || balance <= 0) {
      return;
    }

    this.settlementTarget = {
      salesOrderId,
      soNumber: this.formatTextValue(item['soNumber']),
      customer: this.formatTextValue(item['customer']),
      balance,
    };
    this.settlementError = '';
    this.setSettlementMode('partial');
  }

  closeSettlementModal(): void {
    this.settlementTarget = null;
    this.settlementMode = 'partial';
    this.settlementAmount = '';
    this.splitBankAmount = '';
    this.splitChequeAmount = '';
    this.settlementBankName = '';
    this.settlementCheckNo = '';
    this.settlementPostDated = '';
    this.settlementError = '';
    this.settlementBusy = false;
  }

  setSettlementMode(mode: DashboardSettlementMode): void {
    this.settlementMode = mode;
    this.settlementError = '';
    const balance = this.settlementTarget?.balance ?? 0;
    if (mode === 'full' || mode === 'cheque') {
      this.settlementAmount = balance > 0 ? String(balance) : '';
      this.splitBankAmount = '';
      this.splitChequeAmount = '';
      return;
    }

    if (mode === 'split') {
      this.settlementAmount = '';
      this.splitBankAmount = '';
      this.splitChequeAmount = balance > 0 ? String(balance) : '';
      return;
    }

    this.settlementAmount = '';
    this.splitBankAmount = '';
    this.splitChequeAmount = '';
  }

  updateSplitBankAmount(value: string): void {
    this.splitBankAmount = value;
    this.settlementError = '';
    const balance = this.settlementTarget?.balance ?? 0;
    const bankAmount = Math.max(Number(value), 0);
    if (!Number.isFinite(bankAmount)) {
      this.splitChequeAmount = '';
      return;
    }

    const chequeAmount = Math.max(balance - bankAmount, 0);
    this.splitChequeAmount = chequeAmount > 0 ? String(Number(chequeAmount.toFixed(2))) : '0';
  }

  async submitSettlement(): Promise<void> {
    if (!this.settlementTarget || this.settlementBusy) {
      return;
    }

    const amount = Number(this.settlementAmount);
    if (this.settlementMode === 'partial' && (!Number.isFinite(amount) || amount <= 0)) {
      this.settlementError = 'Enter a valid partial amount.';
      return;
    }

    const splitBankAmount = Number(this.splitBankAmount);
    const splitChequeAmount = Number(this.splitChequeAmount);
    if (
      this.settlementMode === 'split'
      && (
        !Number.isFinite(splitBankAmount)
        || !Number.isFinite(splitChequeAmount)
        || splitBankAmount <= 0
        || splitChequeAmount <= 0
      )
    ) {
      this.settlementError = 'Enter valid bank and cheque amounts for split settlement.';
      return;
    }

    this.settlementBusy = true;
    this.settlementError = '';

    try {
      await this.dashboardService.settleSalesOrder({
        salesOrderId: this.settlementTarget.salesOrderId,
        mode: this.settlementMode,
        amount: this.settlementMode === 'partial' ? amount : undefined,
        bankAmount: this.settlementMode === 'split' ? splitBankAmount : undefined,
        chequeAmount: this.settlementMode === 'split' ? splitChequeAmount : undefined,
        bankName: ['cheque', 'split'].includes(this.settlementMode) ? this.settlementBankName.trim() || null : undefined,
        checkNo: ['cheque', 'split'].includes(this.settlementMode) ? this.settlementCheckNo.trim() || null : undefined,
        postDated: ['cheque', 'split'].includes(this.settlementMode) ? this.settlementPostDated || null : undefined,
      });

      const currentMode = this.expandedSalesSummaryMode;
      this.closeSettlementModal();
      await this.loadDashboardOverview();
      if (currentMode) {
        this.salesSummaryLoading = true;
        await this.fetchSalesSummaryDetail(currentMode);
      }
    } catch (error: unknown) {
      this.settlementError = error instanceof Error ? error.message : 'Unable to record settlement.';
    } finally {
      this.settlementBusy = false;
    }
  }

  async verifyReceivable(item: { [key: string]: unknown }): Promise<void> {
    if (!this.canVerifyReceivable(item)) {
      return;
    }

    const paymentId = Number(item['paymentId']);
    if (!Number.isFinite(paymentId) || paymentId <= 0 || this.verifyingReceivableId === paymentId) {
      return;
    }

    const methodText = String(item['method'] ?? '').trim().toLowerCase();
    const method: DashboardReceivableVerificationMode = methodText === 'credit card' ? 'credit-card' : 'cheque';
    this.verifyingReceivableId = paymentId;

    try {
      await this.dashboardService.verifyReceivable({ paymentId, method });
      const currentMode = this.expandedSalesSummaryMode;
      await this.loadDashboardOverview();
      if (currentMode) {
        this.salesSummaryLoading = true;
        await this.fetchSalesSummaryDetail(currentMode);
      }
    } catch (error) {
      console.error('Failed to verify receivable:', error);
    } finally {
      this.verifyingReceivableId = null;
    }
  }

  canVerifyReceivable(item: { [key: string]: unknown }): boolean {
    const methodText = String(item['method'] ?? '').trim().toLowerCase();
    if (methodText !== 'cheque') {
      return true;
    }

    const rawPostDated = item['postDated'];
    if (!rawPostDated) {
      return true;
    }

    const postDated = new Date(String(rawPostDated));
    if (Number.isNaN(postDated.getTime())) {
      return true;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    postDated.setHours(0, 0, 0, 0);

    return postDated <= today;
  }

  getReceivableVerifyLabel(item: { [key: string]: unknown }): string {
    if (this.canVerifyReceivable(item)) {
      return this.verifyingReceivableId === item['paymentId'] ? 'Verifying…' : 'Verify';
    }

    return 'Waiting for date';
  }

  async fetchSalesSummaryDetail(mode: DashboardSalesDetailMode): Promise<void> {
    try {
      const items = await this.dashboardService.getSalesDetail(mode);
      this.salesSummaryDetailItems = items;
    } catch (error: unknown) {
      console.error('Failed to fetch sales detail:', error);
      this.salesSummaryDetailItems = [];
    } finally {
      this.salesSummaryLoading = false;
    }
  }

  async fetchOperationDetail(mode: DashboardOperationDetailMode): Promise<void> {
    try {
      const items = await this.dashboardService.getOperationsDetail(mode);
      this.operationDetailItems = items;
    } catch (error: unknown) {
      console.error('Failed to fetch operations detail:', error);
      this.operationDetailItems = [];
    } finally {
      this.operationDetailLoading = false;
    }
  }
}
