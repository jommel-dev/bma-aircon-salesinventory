import { Injectable } from '@angular/core';
import { apiClient } from '../../shared/services/api-client';

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface PoQueryParams {
  page: number;
  limit: number;
  search?: string;
  po_type?: string;
}

export interface PoListItem {
  id: number;
  poNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  totalAmount: number;
  status: string;
  poType: string | null;
  createdAt: string | null;
}

export interface PoListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PoListResult {
  items: PoListItem[];
  meta: PoListMeta;
}

export interface MaterialSearchResult {
  id: number;
  material_name: string;
  material_code: string | null;
  unit: string;
  unit_price: number;
  sell_price: number;
  brand_name: string | null;
  product_type: string | null;
}

export interface VendorOption {
  id: string;
  name: string;
  address?: string;
  contact_person?: string;
  contact_number?: string;
}

export interface CreatePoMaterialsPayload {
  poType: 'ACM';
  vendorId?: string;
  vendor?: {
    name: string;
    address?: string;
    contact_person?: string;
    contact_number?: string;
  };
  productItems: Array<{
    transType: 'purchase';
    materialId?: number | null;
    materialName: string;
    materialCode?: string | null;
    materialUnit?: string;
    unitPrice: number;
    sellPrice?: number;
    discountPrice: number;
    totalSetQty: number;
  }>;
  paymentDetails?: Array<{
    method: string;
    amount?: number;
    terms?: string;
    termsDueDate?: string | null;
    status?: string;
    paymentDate?: string | null;
    bankName?: string;
    referenceNo?: string;
    checkNo?: string;
    chequeDate?: string | null;
    issuedBy?: string;
    downPayment?: number;
  }>;
  remarks?: string;
  status: string;
}

export interface PoPaymentDetail {
  method: string;
  amount: number;
  terms: string;
  termsDueDate: string | null;
  status: string;
  paymentDate: string | null;
  bankName: string;
  referenceNo: string;
  checkNo: string;
  chequeDate: string | null;
  issuedBy: string;
  downPayment: number;
}

export interface PoProductItem {
  id: number;
  transType: string;
  materialId: number | null;
  materialName: string | null;
  materialCode: string | null;
  materialUnit: string | null;
  unitPrice: number;
  sellPrice: number;
  discountPrice: number;
  totalSetQty: number;
  purchaseId: number;
}

export interface PoDetailItem {
  id: number;
  poNumber: string | null;
  poType: 'ACU' | 'ACP' | 'ACM' | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorAddress: string | null;
  vendorContactPerson: string | null;
  vendorContactNumber: string | null;
  totalAmount: number;
  status: string;
  remarks: string | null;
  createdAt: string | null;
  paymentDetails: PoPaymentDetail[];
  productItems: PoProductItem[];
}

// ─── Response Interfaces ────────────────────────────────────────────────────

interface PoListApiResponse {
  success: boolean;
  items: PoListItem[];
  meta: PoListMeta;
}

interface PoDetailApiResponse {
  success: boolean;
  message?: string;
  item?: PoDetailItem;
}

export interface CreatePoResponse {
  success: boolean;
  message?: string;
  data?: {
    purchaseOrderId: number;
    poNumber?: string;
    vendorId?: string;
    computedTotalAmount?: number;
  };
}

export type UpdatePoResponse = CreatePoResponse;

export interface ActionResponse {
  success: boolean;
  message?: string;
  data?: {
    purchaseOrderId: number;
    poNumber?: string;
  };
}

export type PoDetailResponse = PoDetailItem;

interface MaterialSearchApiResponse {
  success: boolean;
  items: MaterialSearchResult[];
}

interface VendorSearchApiResponse {
  success: boolean;
  items?: VendorOption[];
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class PoMaterialsService {
  // ─── List Endpoints (filtered to po_type = ACM) ─────────────────────────────

  /**
   * Get paginated list of user's PO Materials requests.
   */
  async getMyRequests(params: PoQueryParams): Promise<PoListResult> {
    const response = await apiClient.get<PoListApiResponse>('/purchase/my', {
      params: { ...params, po_type: 'ACM' },
    });
    return {
      items: response.data.items ?? [],
      meta: response.data.meta,
    };
  }

  /**
   * Get paginated list of PO Materials deliveries.
   */
  async getDeliveries(params: PoQueryParams): Promise<PoListResult> {
    const response = await apiClient.get<PoListApiResponse>('/purchase/deliveries', {
      params: { ...params, po_type: 'ACM' },
    });
    return {
      items: response.data.items ?? [],
      meta: response.data.meta,
    };
  }

  /**
   * Get paginated list of PO Materials approvals.
   */
  async getApprovals(params: PoQueryParams): Promise<PoListResult> {
    const response = await apiClient.get<PoListApiResponse>('/purchase/approvals', {
      params: { ...params, po_type: 'ACM' },
    });
    return {
      items: response.data.items ?? [],
      meta: response.data.meta,
    };
  }

  /**
   * Get paginated list of all PO Materials (master data).
   */
  async getMasterData(params: PoQueryParams): Promise<PoListResult> {
    const response = await apiClient.get<PoListApiResponse>('/purchase/master-data', {
      params: { ...params, po_type: 'ACM' },
    });
    return {
      items: response.data.items ?? [],
      meta: response.data.meta,
    };
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * Create a new ACM purchase order.
   */
  async createPurchaseOrder(payload: CreatePoMaterialsPayload): Promise<CreatePoResponse> {
    const response = await apiClient.post<CreatePoResponse>('/purchase', payload);
    return response.data;
  }

  /**
   * Update an existing ACM purchase order.
   */
  async updatePurchaseOrder(id: number, payload: CreatePoMaterialsPayload): Promise<UpdatePoResponse> {
    const response = await apiClient.patch<UpdatePoResponse>(`/purchase/${id}`, payload);
    return response.data;
  }

  /**
   * Get a single purchase order by ID with full detail.
   */
  async getPurchaseOrderById(id: number): Promise<PoDetailResponse> {
    const response = await apiClient.get<PoDetailApiResponse>(`/purchase/${id}`);
    if (!response.data.success || !response.data.item) {
      throw new Error(response.data.message || 'Purchase order not found');
    }
    return response.data.item;
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  /**
   * Search materials by name, code, product type, or brand.
   * Returns up to 200 matching results.
   */
  async searchMaterials(query: string, limit: number = 200): Promise<MaterialSearchResult[]> {
    const response = await apiClient.get<MaterialSearchApiResponse>(
      '/purchase/materials/search',
      { params: { query, limit } },
    );
    return response.data.items ?? [];
  }

  /**
   * Search vendors by name.
   * Returns up to 20 matching results.
   */
  async searchVendors(query: string): Promise<VendorOption[]> {
    const response = await apiClient.get<VendorSearchApiResponse>('/purchase/vendors/list', {
      params: { search: query?.trim() || undefined },
    });
    return response.data.items ?? [];
  }

  // ─── Status Transitions ─────────────────────────────────────────────────────

  /**
   * Submit a PO for approval (in-progress → for_approval).
   */
  async submitForApproval(id: number): Promise<ActionResponse> {
    const response = await apiClient.patch<ActionResponse>(`/purchase/${id}`, {
      status: 'for_approval',
    });
    return response.data;
  }

  /**
   * Approve a PO (for_approval → approved).
   */
  async approve(id: number): Promise<ActionResponse> {
    const response = await apiClient.patch<ActionResponse>(`/purchase/${id}/approve`, {});
    return response.data;
  }

  /**
   * Mark a PO as received (approved → received).
   */
  async receive(id: number): Promise<ActionResponse> {
    const response = await apiClient.patch<ActionResponse>(`/purchase/${id}/verify-receive`, {});
    return response.data;
  }

  /**
   * Complete a PO (received → completed).
   */
  async complete(id: number): Promise<ActionResponse> {
    const response = await apiClient.patch<ActionResponse>(`/purchase/${id}/receive-request`, {});
    return response.data;
  }

  /**
   * Revert a PO back to in-progress (for_approval → in-progress).
   */
  async revertToInProgress(id: number): Promise<ActionResponse> {
    const response = await apiClient.patch<ActionResponse>(`/purchase/${id}/revert-in-progress`, {});
    return response.data;
  }
}
