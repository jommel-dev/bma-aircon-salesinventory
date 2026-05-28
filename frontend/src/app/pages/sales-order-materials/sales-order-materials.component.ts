import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SalesOrderMaterialService,
  SalesOrderStatus,
  MaterialSalesOrderListItem,
  MaterialSalesOrderListMeta,
  MaterialSalesOrderListParams,
} from '../../shared/services/sales-order-material.service';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

interface TabDefinition {
  key: SalesOrderStatus;
  label: string;
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

  constructor(
    private salesOrderMaterialService: SalesOrderMaterialService,
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

  onPrintOrder(orderId: number, soNumber: string | null): void {
    // Open a print-friendly view in a new window
    const printUrl = `/users/sales-order-materials/edit/${orderId}`;
    const printWindow = window.open(printUrl, '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
    }
  }

  onCreateOrder(): void {
    this.router.navigate(['/users/sales-order-materials/create']);
  }

  onEditOrder(orderId: number): void {
    this.router.navigate(['/users/sales-order-materials/edit', orderId]);
  }
}
