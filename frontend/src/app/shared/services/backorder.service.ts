import { Injectable } from '@angular/core';
import { apiClient } from './api-client';

export type BackorderListStatus =
  | 'open'
  | 'pending'
  | 'partial_fulfilled'
  | 'fulfilled'
  | 'cancelled'
  | 'all';

export interface BackorderListItem {
  id: number;
  salesOrderId: number;
  soNumber: string;
  customerName: string;
  materialId: number;
  materialName: string;
  materialCode: string;
  orderedQty: number;
  onHandQty: number;
  backorderQty: number;
  fulfilledQty: number;
  remainingQty: number;
  status: string;
  createdAt: string | null;
}

export interface BackorderListCounts {
  pending: number;
  partialFulfilled: number;
  fulfilled: number;
  cancelled: number;
  open: number;
  all: number;
  openRemainingQty: number;
}

export interface BackorderListResponse {
  data: BackorderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: BackorderListCounts;
}

@Injectable({
  providedIn: 'root',
})
export class BackorderService {
  async getRecording(): Promise<{ enabled: boolean }> {
    const response = await apiClient.get<{ enabled: boolean }>('/backorders/recording');
    return { enabled: response.data?.enabled !== false };
  }

  async manualFulfill(payload: {
    ids: number[];
    remarks: string;
    password: string;
  }): Promise<{ fulfilledCount: number }> {
    const response = await apiClient.post<{ fulfilledCount: number }>('/backorders/manual-fulfill', payload);
    return { fulfilledCount: Number(response.data?.fulfilledCount ?? 0) };
  }

  async setRecording(enabled: boolean): Promise<{ enabled: boolean }> {
    const response = await apiClient.patch<{ enabled: boolean }>('/backorders/recording', { enabled });
    return { enabled: response.data?.enabled === true };
  }

  async list(params: {
    status: BackorderListStatus;
    page: number;
    limit: number;
    search?: string;
  }): Promise<BackorderListResponse> {
    const response = await apiClient.get<BackorderListResponse>('/backorders', {
      params: {
        status: params.status,
        page: params.page,
        limit: params.limit,
        search: params.search?.trim() || undefined,
      },
    });
    return response.data;
  }
}
