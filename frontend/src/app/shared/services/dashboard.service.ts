import { Injectable } from '@angular/core';
import { apiClient } from './api-client';
import { BranchService } from './branch.service';

export type DashboardTrend = 'up' | 'down';
export type DashboardSalesDetailMode = 'sales' | 'unpaid' | 'overdues' | 'cheques';
export type DashboardOperationDetailMode = 'purchase-orders' | 'credit-terms' | 'paid-purchases' | 'stock-alerts';
export type DashboardSettlementMode = 'partial' | 'full' | 'cheque' | 'split';
export type DashboardReceivableVerificationMode = 'cheque' | 'credit-card';

export interface DashboardKpiCard {
  label: string;
  value: string;
  change: string;
  trend: DashboardTrend;
}

export interface DashboardOpsItem {
  label: string;
  value: string;
  hint: string;
  level: 'normal' | 'warning' | 'critical';
}

export interface DashboardActivityItem {
  time: string;
  text: string;
  status: 'received' | 'dispatch' | 'install' | 'payment';
}

export interface DashboardOverview {
  generatedAt: string;
  topKpis: DashboardKpiCard[];
  operations: DashboardOpsItem[];
  salesSummary: DashboardKpiCard[];
  topCustomers: Array<{ rank: number; name: string; totalAmount: number; orderCount: number }>;
  topSuppliers: Array<{ rank: number; name: string; totalAmount: number; poCount: number }>;
  topEmployees: Array<{ rank: number; name: string; totalSales: number; orderCount: number }>;
  netoData: { gross: number; discounts: number; returns: number; neto: number; outstanding: number };
  activityFeed: DashboardActivityItem[];
  todayFocus: string;
}

interface DashboardOverviewResponse {
  success: boolean;
  message?: string;
  item?: DashboardOverview;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private readonly branchService: BranchService) {}

  async getOverview(): Promise<DashboardOverview> {
    const branchId = this.branchService.getActiveBranchId();
    const response = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview', {
      params: branchId ? { branchId } : undefined,
    });

    if (!response.data.success || !response.data.item) {
      throw new Error(response.data.message ?? 'Unable to load dashboard overview');
    }

    return response.data.item;
  }

  async getSalesDetail(
    mode: DashboardSalesDetailMode,
    options?: { page?: number; pageSize?: number; search?: string },
  ): Promise<{
    items: Array<{ id?: string | number; [key: string]: unknown }>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const branchId = this.branchService.getActiveBranchId();
    const response = await apiClient.get<{
      success: boolean;
      message?: string;
      items: Array<{ id?: string | number; [key: string]: unknown }>;
      meta?: { page: number; pageSize: number; total: number; totalPages: number };
    }>('/dashboard/sales-detail', {
      params: {
        mode,
        page: String(options?.page ?? 1),
        pageSize: String(options?.pageSize ?? 25),
        ...(options?.search ? { search: options.search } : {}),
        ...(branchId ? { branchId } : {}),
      },
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Unable to load sales detail');
    }

    const page = Number(options?.page ?? 1) || 1;
    const pageSize = Number(options?.pageSize ?? 25) || 25;
    const items = response.data.items ?? [];
    const meta = response.data.meta ?? {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize) || 1),
    };

    return { items, meta };
  }

  async getOperationsDetail(
    mode: DashboardOperationDetailMode,
  ): Promise<Array<{ id?: string | number; [key: string]: unknown }>> {
    const branchId = this.branchService.getActiveBranchId();
    const response = await apiClient.get<{
      success: boolean;
      items: Array<{ id?: string | number; [key: string]: unknown }>;
    }>('/dashboard/operations-detail', {
      params: { mode, ...(branchId ? { branchId } : {}) },
    });

    if (!response.data.success) {
      throw new Error('Unable to load operations detail');
    }

    return response.data.items ?? [];
  }

  async settleSalesOrder(payload: {
    salesOrderId: number;
    mode: DashboardSettlementMode;
    amount?: number;
    bankAmount?: number;
    chequeAmount?: number;
    bankName?: string | null;
    checkNo?: string | null;
    postDated?: string | null;
  }): Promise<void> {
    const response = await apiClient.post<{ success: boolean; message?: string }>('/dashboard/settle-sales-order', payload);

    if (!response.data.success) {
      throw new Error(response.data.message ?? 'Unable to settle sales order');
    }
  }

  async settlePurchaseOrder(payload: {
    purchaseOrderId: number;
    paymentId?: string;
  }): Promise<void> {
    const response = await apiClient.post<{ success: boolean; message?: string }>(
      '/dashboard/settle-purchase-order',
      payload,
    );

    if (!response.data.success) {
      throw new Error(response.data.message ?? 'Unable to settle purchase order');
    }
  }

  async verifyReceivable(payload: {
    paymentId: number;
    method?: DashboardReceivableVerificationMode;
  }): Promise<void> {
    const response = await apiClient.post<{ success: boolean; message?: string }>('/dashboard/verify-receivable', payload);

    if (!response.data.success) {
      throw new Error(response.data.message ?? 'Unable to verify receivable');
    }
  }
}
