import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import {
  BackorderListCounts,
  BackorderListItem,
  BackorderListStatus,
  BackorderService,
} from '../../shared/services/backorder.service';
import { RbacService } from '../../shared/services/rbac.service';
import * as ExcelJS from 'exceljs';

interface TabDefinition {
  key: BackorderListStatus;
  label: string;
  countKey: keyof BackorderListCounts;
}

@Component({
  selector: 'app-backorders',
  imports: [CommonModule, FormsModule, RouterModule, PageBreadcrumbComponent],
  templateUrl: './backorders.component.html',
})
export class BackordersComponent implements OnInit, OnDestroy {
  Math = Math;

  tabs: TabDefinition[] = [
    { key: 'open', label: 'Open', countKey: 'open' },
    { key: 'pending', label: 'Pending', countKey: 'pending' },
    { key: 'partial_fulfilled', label: 'Partial', countKey: 'partialFulfilled' },
    { key: 'fulfilled', label: 'Fulfilled', countKey: 'fulfilled' },
    { key: 'cancelled', label: 'Cancelled', countKey: 'cancelled' },
    { key: 'all', label: 'All', countKey: 'all' },
  ];

  activeTab: BackorderListStatus = 'open';
  rows: BackorderListItem[] = [];
  counts: BackorderListCounts = {
    pending: 0,
    partialFulfilled: 0,
    fulfilled: 0,
    cancelled: 0,
    open: 0,
    all: 0,
    openRemainingQty: 0,
  };
  page = 1;
  limit = 20;
  total = 0;
  totalPages = 0;
  search = '';
  isLoading = false;
  errorMessage = '';
  recordingEnabled = true;
  canToggleRecording = false;
  isSavingRecording = false;
  recordingMessage = '';
  selectedIds = new Set<number>();
  private selectedRows = new Map<number, BackorderListItem>();
  isFulfillDialogOpen = false;
  fulfillTargets: BackorderListItem[] = [];
  fulfillRemarks = '';
  fulfillPassword = '';
  fulfillError = '';
  isFulfilling = false;
  isExporting = false;
  exportError = '';

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly backorderService: BackorderService,
    private readonly rbacService: RbacService,
  ) {}

  ngOnInit(): void {
    this.canToggleRecording = this.rbacService.isSuperAdmin();
    void this.loadRecording();
    void this.loadRows();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  async setTab(tab: BackorderListStatus): Promise<void> {
    if (this.activeTab === tab) {
      return;
    }
    this.activeTab = tab;
    this.page = 1;
    this.clearSelection();
    await this.loadRows();
  }

  onSearchChange(value: string): void {
    this.search = value;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.page = 1;
      this.clearSelection();
      void this.loadRows();
    }, 300);
  }

  async goToPage(nextPage: number): Promise<void> {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page) {
      return;
    }
    this.page = nextPage;
    await this.loadRows();
  }

  tabCount(tab: TabDefinition): number {
    return this.counts[tab.countKey] ?? 0;
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'partial_fulfilled':
        return 'Partial';
      case 'fulfilled':
        return 'Fulfilled';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status || '—';
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'fulfilled':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'partial_fulfilled':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  }

  canFulfill(row: BackorderListItem): boolean {
    return row.status === 'pending' || row.status === 'partial_fulfilled';
  }

  get selectableRows(): BackorderListItem[] {
    return this.rows.filter((row) => this.canFulfill(row));
  }

  get allPageSelected(): boolean {
    const selectable = this.selectableRows;
    return selectable.length > 0 && selectable.every((row) => this.selectedIds.has(row.id));
  }

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  toggleRow(row: BackorderListItem): void {
    const next = new Set(this.selectedIds);
    if (next.has(row.id)) {
      next.delete(row.id);
      this.selectedRows.delete(row.id);
    } else {
      next.add(row.id);
      this.selectedRows.set(row.id, row);
    }
    this.selectedIds = next;
  }

  toggleSelectAll(): void {
    const next = new Set(this.selectedIds);
    if (this.allPageSelected) {
      for (const row of this.selectableRows) {
        next.delete(row.id);
        this.selectedRows.delete(row.id);
      }
    } else {
      for (const row of this.selectableRows) {
        next.add(row.id);
        this.selectedRows.set(row.id, row);
      }
    }
    this.selectedIds = next;
  }

  openFulfillDialog(rows: BackorderListItem[]): void {
    const targets = rows.filter((row) => this.canFulfill(row));
    if (targets.length === 0) {
      return;
    }
    this.fulfillTargets = targets;
    this.fulfillRemarks = '';
    this.fulfillPassword = '';
    this.fulfillError = '';
    this.isFulfillDialogOpen = true;
  }

  openSelectedFulfillDialog(): void {
    const selected = [...this.selectedIds]
      .map((id) => this.selectedRows.get(id))
      .filter((row): row is BackorderListItem => !!row && this.canFulfill(row));
    this.openFulfillDialog(selected);
  }

  private clearSelection(): void {
    this.selectedIds = new Set<number>();
    this.selectedRows.clear();
  }

  closeFulfillDialog(): void {
    if (this.isFulfilling) {
      return;
    }
    this.isFulfillDialogOpen = false;
    this.fulfillPassword = '';
    this.fulfillError = '';
  }

  async confirmFulfill(): Promise<void> {
    const remarks = this.fulfillRemarks.trim();
    if (!remarks) {
      this.fulfillError = 'Remarks are required.';
      return;
    }
    if (!this.fulfillPassword) {
      this.fulfillError = 'Password is required.';
      return;
    }
    this.isFulfilling = true;
    this.fulfillError = '';
    try {
      const result = await this.backorderService.manualFulfill({
        ids: this.fulfillTargets.map((row) => row.id),
        remarks,
        password: this.fulfillPassword,
      });
      const fulfilled = new Set(this.fulfillTargets.map((row) => row.id));
      this.selectedIds = new Set([...this.selectedIds].filter((id) => !fulfilled.has(id)));
      for (const id of fulfilled) {
        this.selectedRows.delete(id);
      }
      this.isFulfilling = false;
      this.closeFulfillDialog();
      await this.loadRows();
      this.recordingMessage = '';
      this.errorMessage = '';
      if (result.fulfilledCount === 0) {
        this.errorMessage = 'No back orders were marked fulfilled.';
      }
    } catch (error: any) {
      const message = error?.response?.data?.message ?? error?.message ?? 'Could not mark the back orders fulfilled.';
      this.fulfillError = Array.isArray(message) ? message.join(' ') : String(message);
    } finally {
      this.isFulfilling = false;
    }
  }

  async exportOpenToExcel(): Promise<void> {
    if (this.isExporting) {
      return;
    }
    this.isExporting = true;
    this.exportError = '';
    try {
      const rows = await this.loadAllOpenBackorders();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Open Back Orders');
      const today = new Date().toISOString().slice(0, 10);

      worksheet.mergeCells('A1:L1');
      const title = worksheet.getCell('A1');
      title.value = `Open Back Orders — pending and partial — ${today}`;
      title.font = { bold: true, size: 14 };

      worksheet.addRow([]);
      const header = worksheet.addRow([
        'Created',
        'Order',
        'Customer',
        'Material code',
        'Material',
        'Status',
        'Ordered',
        'On hand',
        'Short',
        'Filled',
        'Remaining',
      ]);
      header.font = { bold: true };
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
        cell.border = { bottom: { style: 'thin' } };
      });

      let remainingTotal = 0;
      for (const row of rows) {
        remainingTotal += Number(row.remainingQty) || 0;
        const dataRow = worksheet.addRow([
          row.createdAt ? new Date(row.createdAt) : '',
          row.soNumber || String(row.salesOrderId),
          row.customerName || '',
          row.materialCode || '',
          row.materialName || '',
          this.statusLabel(row.status),
          Number(row.orderedQty) || 0,
          Number(row.onHandQty) || 0,
          Number(row.backorderQty) || 0,
          Number(row.fulfilledQty) || 0,
          Number(row.remainingQty) || 0,
        ]);
        dataRow.getCell(1).numFmt = 'yyyy-mm-dd';
        for (const column of [7, 8, 9, 10, 11]) {
          dataRow.getCell(column).numFmt = '#,##0.##';
        }
      }

      worksheet.addRow([]);
      const totalRow = worksheet.addRow(['', '', '', '', '', 'Remaining total', '', '', '', '', remainingTotal]);
      totalRow.font = { bold: true };
      totalRow.getCell(11).numFmt = '#,##0.##';

      worksheet.columns.forEach((column, index) => {
        const widths = [14, 16, 32, 16, 36, 12, 12, 12, 12, 12, 14];
        column.width = widths[index] ?? 14;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Open_Backorders_${today}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      this.exportError = 'Could not export the open back orders. Try again.';
    } finally {
      this.isExporting = false;
    }
  }

  private async loadAllOpenBackorders(): Promise<BackorderListItem[]> {
    const rows: BackorderListItem[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await this.backorderService.list({
        status: 'open',
        page,
        limit: 100,
      });
      rows.push(...(result.data ?? []));
      totalPages = Math.max(1, result.totalPages ?? 1);
      page += 1;
    } while (page <= totalPages);
    return rows;
  }

  formatQty(value: number | null | undefined): string {
    return new Intl.NumberFormat('en-PH', {
      maximumFractionDigits: 2,
    }).format(value ?? 0);
  }

  async toggleRecording(): Promise<void> {
    if (!this.canToggleRecording || this.isSavingRecording) {
      return;
    }
    this.isSavingRecording = true;
    this.recordingMessage = '';
    try {
      const result = await this.backorderService.setRecording(!this.recordingEnabled);
      this.recordingEnabled = result.enabled;
    } catch {
      this.recordingMessage = 'Could not change back order recording. Try again.';
    } finally {
      this.isSavingRecording = false;
    }
  }

  private async loadRecording(): Promise<void> {
    try {
      const result = await this.backorderService.getRecording();
      this.recordingEnabled = result.enabled;
    } catch {
      this.recordingEnabled = true;
    }
  }

  private async loadRows(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const result = await this.backorderService.list({
        status: this.activeTab,
        page: this.page,
        limit: this.limit,
        search: this.search,
      });
      this.rows = result.data ?? [];
      this.total = result.total ?? 0;
      this.page = result.page ?? this.page;
      this.limit = result.limit ?? this.limit;
      this.totalPages = result.totalPages ?? 0;
      if (result.counts) {
        this.counts = result.counts;
      }
    } catch {
      this.rows = [];
      this.total = 0;
      this.totalPages = 0;
      this.errorMessage = 'Unable to load back orders. Check that the API is running, then try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
