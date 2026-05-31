import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  PoMaterialsService,
  PoListItem,
  PoListMeta,
  PoQueryParams,
} from '../po-materials.service';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

type PoMaterialsTab = 'my_requests' | 'deliveries' | 'approvals' | 'master_data';

interface TabDefinition {
  key: PoMaterialsTab;
  label: string;
}

@Component({
  selector: 'app-po-materials-list',
  standalone: true,
  imports: [CommonModule, PageBreadcrumbComponent],
  templateUrl: './po-materials-list.component.html',
})
export class PoMaterialsListComponent implements OnInit {
  Math = Math;

  // Tab definitions
  tabs: TabDefinition[] = [
    { key: 'my_requests', label: 'My Requests' },
    { key: 'deliveries', label: 'Deliveries' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'master_data', label: 'Master Data' },
  ];

  activeTab: PoMaterialsTab = 'my_requests';

  // List state
  items: PoListItem[] = [];
  meta: PoListMeta = { page: 1, limit: 10, total: 0, totalPages: 0 };
  isLoading = false;
  errorMessage = '';

  // Search
  search = '';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly searchDebounceMs = 500;

  constructor(
    private poMaterialsService: PoMaterialsService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadItems();
  }

  async setTab(tab: PoMaterialsTab): Promise<void> {
    if (this.activeTab === tab) {
      return;
    }

    this.activeTab = tab;
    this.meta.page = 1;
    this.search = '';
    await this.loadItems();
  }

  onSearchChange(value: string): void {
    this.search = value;

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.meta.page = 1;
      void this.loadItems();
      this.searchDebounceTimer = null;
    }, this.searchDebounceMs);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.meta.totalPages) {
      return;
    }

    this.meta.page = page;
    void this.loadItems();
  }

  async loadItems(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const params: PoQueryParams = {
        page: this.meta.page,
        limit: this.meta.limit,
        search: this.search.trim() || undefined,
      };

      let result;
      switch (this.activeTab) {
        case 'my_requests':
          result = await this.poMaterialsService.getMyRequests(params);
          break;
        case 'deliveries':
          result = await this.poMaterialsService.getDeliveries(params);
          break;
        case 'approvals':
          result = await this.poMaterialsService.getApprovals(params);
          break;
        case 'master_data':
          result = await this.poMaterialsService.getMasterData(params);
          break;
      }

      this.items = result.items;
      this.meta = result.meta;
    } catch (err) {
      console.error('Failed to load PO materials:', err);
      this.errorMessage = 'Unable to load purchase orders. Please try again.';
      this.items = [];
    } finally {
      this.isLoading = false;
    }
  }

  getStatusClass(status: string): string {
    const statusLower = (status || '').toLowerCase().replace(/[-\s]/g, '_');
    switch (statusLower) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'approved':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'for_approval':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'received':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'in_progress':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
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

  formatStatus(status: string): string {
    if (!status) return '—';
    return status.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  onCreateOrder(): void {
    this.router.navigate(['/users/purchase-order-materials/new']);
  }

  onEditOrder(orderId: number): void {
    this.router.navigate(['/users/purchase-order-materials/edit', orderId]);
  }
}
