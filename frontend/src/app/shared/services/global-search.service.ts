import { Injectable } from '@angular/core';
import { apiClient } from './api-client';

export type GlobalSearchType =
  | 'sales-order'
  | 'purchase-order'
  | 'material'
  | 'customer'
  | 'product-item';

export interface GlobalSearchItem {
  type: GlobalSearchType;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  status?: string;
}

interface GlobalSearchApiResponse {
  success: boolean;
  items?: GlobalSearchItem[];
}

export const GLOBAL_SEARCH_GROUPS: Array<{ type: GlobalSearchType; label: string }> = [
  { type: 'sales-order', label: 'Sales Order' },
  { type: 'purchase-order', label: 'Purchase Order' },
  { type: 'material', label: 'Material Code' },
  { type: 'customer', label: 'Customer' },
  { type: 'product-item', label: 'Product Item' },
];

@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  async search(query: string): Promise<GlobalSearchItem[]> {
    const q = String(query ?? '').trim();
    if (q.length < 2) {
      return [];
    }
    const response = await apiClient.get<GlobalSearchApiResponse>('/search', { params: { q } });
    return response.data?.items ?? [];
  }
}
