import { Injectable } from '@angular/core';
import { apiClient } from './api-client';

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export type SalesOrderStatus = 'draft' | 'pending' | 'complete' | 'voided';

export interface PaymentDetail {
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer' | 'Terms' | 'Terms with DP' | 'Cheque' | 'Credit Card' | 'Installment';
  amount: number;
  terms: string;
  termsDueDate: string;
  referenceNo: string;
  paymentDate: string;
  issuedBy: string;
  ccCharge: string;
  checkNo: string;
  bankName: string;
  bankAccount: string;
  postDated: string;
  downPayment: number;
  status: string;
}

export interface MaterialSearchResult {
  id: number;
  material_name: string;
  material_code: string | null;
  product_type: string;
  brand_name: string | null;
  unit: string;
  unit_price: number;  // cost
  sell_price: number;  // rate
  on_hand_stock: number;  // stock on hand
  reorder_level: number;  // reorder level
}

export interface LineItem {
  id?: number;
  itemNo: number;
  description: string;
  itemCode?: string | null;
  brand?: string | null;
  cost: number;         // unit_price from material
  rate: number;         // sell_price, editable
  discount: number;     // fixed amount discount per item
  qty: number;          // editable, integer 1-99999
  total: number;        // computed: (rate - discount) * qty
  materialId?: number | null;
  isNonInventory: boolean;
  onHandStock?: number;  // stock on hand for validation
  reorderLevel?: number; // reorder level
}

export interface CreateMaterialSalesOrderPayload {
  customer_id?: string | null;
  customer?: { name: string; address?: string; contact_person?: string; contact_number?: string };
  deliveryDate: string;       // ISO date string
  salesType: string;          // always "sales" for new orders
  status: 'draft' | 'pending';
  productItems: Array<{
    materialId?: number | null;
    description: string;
    itemCode?: string | null;
    brand?: string | null;
    cost: number;
    rate: number;
    discount: number;
    qty: number;
    isNonInventory: boolean;
  }>;
  remarks?: string;
  paymentDetails?: PaymentDetail[];
}

export interface MaterialSalesOrderListParams {
  status: SalesOrderStatus;
  page: number;
  limit: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Response Interfaces ────────────────────────────────────────────────────

export interface MaterialSalesOrderListItem {
  id: number;
  soNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  totalAmount: number;
  status: string;
  salesType: string;
  scheduleDate: string | null;
  deliveryDate: string | null;
  createdAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  paymentMethod: string;
  paymentStatus: string;
  payments: Array<{ method: string; status: string; amount: number; terms: string; bankAccount?: string }>;
}

export interface MaterialSalesOrderListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface MaterialSalesOrderListApiResponse {
  success: boolean;
  items: MaterialSalesOrderListItem[];
  meta: MaterialSalesOrderListMeta;
}

export interface MaterialSalesOrderDetail {
  id: number;
  soNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerContactPerson: string | null;
  customerContactNumber: string | null;
  totalAmount: number;
  status: string;
  salesType: string;
  scheduleDate: string | null;
  deliveryDate?: string | null;
  remarks: string | null;
  createdAt: string | null;
  productItems: Array<{
    id: number;
    materialId: number | null;
    description: string;
    itemCode: string | null;
    brand: string | null;
    cost: number;
    rate: number;
    discount: number;
    qty: number;
    total: number;
    isNonInventory: boolean;
    onHandStock?: number;
    reorderLevel?: number;
  }>;
  paymentDetails: PaymentDetail[];
}

interface MaterialSalesOrderDetailApiResponse {
  success: boolean;
  message?: string;
  item?: MaterialSalesOrderDetail;
}

interface MaterialSalesOrderMutationApiResponse {
  success: boolean;
  message?: string;
  data?: {
    salesOrderId?: number;
  };
}

interface MaterialSearchApiResponse {
  success: boolean;
  items: MaterialSearchResult[];
}

// ─── Legacy Interfaces (kept for backward compatibility) ────────────────────

export interface MaterialTransactionItem {
  id: number;
  trans_type: 'purchase' | 'sales';
  material_id: number;
  material_name?: string;
  material_code?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  sell_price: number;
  discount_price: number;
  purchase_id?: number;
  sales_id?: number;
  created_at: string;
}

export interface AddMaterialItemDto {
  material_id: number;
  quantity: number;
  unit_price?: number;
  sell_price?: number;
  discount_price?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class SalesOrderMaterialService {
  // ─── Material Sales Order CRUD ──────────────────────────────────────────────

  /**
   * Get paginated list of material sales orders filtered by status.
   */
  async getMaterialSalesOrders(
    params: MaterialSalesOrderListParams,
  ): Promise<{ items: MaterialSalesOrderListItem[]; meta: MaterialSalesOrderListMeta }> {
    const response = await apiClient.get<MaterialSalesOrderListApiResponse>(
      '/sales-order/materials',
      { params },
    );
    return {
      items: response.data.items ?? [],
      meta: response.data.meta,
    };
  }

  /**
   * Create a new material sales order.
   */
  async createMaterialSalesOrder(
    payload: CreateMaterialSalesOrderPayload,
  ): Promise<MaterialSalesOrderMutationApiResponse> {
    const response = await apiClient.post<MaterialSalesOrderMutationApiResponse>(
      '/sales-order/materials',
      payload,
    );
    return response.data;
  }

  /**
   * Update an existing material sales order.
   */
  async updateMaterialSalesOrder(
    id: number,
    payload: Partial<CreateMaterialSalesOrderPayload>,
  ): Promise<MaterialSalesOrderMutationApiResponse> {
    const response = await apiClient.patch<MaterialSalesOrderMutationApiResponse>(
      `/sales-order/materials/${id}`,
      payload,
    );
    return response.data;
  }

  /**
   * Get a single material sales order by ID with full detail.
   */
  async getMaterialSalesOrderById(id: number): Promise<MaterialSalesOrderDetail> {
    const response = await apiClient.get<MaterialSalesOrderDetailApiResponse>(
      `/sales-order/materials/${id}`,
    );
    if (!response.data.success || !response.data.item) {
      throw new Error(response.data.message || 'Sales order not found');
    }
    return response.data.item;
  }

  /**
   * Get the next SO number that will be assigned.
   */
  async getNextSoNumber(): Promise<string> {
    const response = await apiClient.get('/sales-order/materials/next-number');
    return response.data?.soNumber ?? '';
  }

  /**
   * Smart search materials by name, code, product type, or brand.
   */
  async searchMaterials(q: string, limit: number = 50): Promise<MaterialSearchResult[]> {
    const response = await apiClient.get<MaterialSearchApiResponse>(
      '/inventory/materials/search',
      { params: { q, limit } },
    );
    const data = response.data;
    // Backend may return a flat array or { items: [...] }
    return data.items ?? (Array.isArray(data) ? data : []);
  }

  /**
   * Migrate material sales orders from CSV data.
   */
  async migrateSalesOrders(rows: any[], targetStatus?: string): Promise<any> {
    const response = await apiClient.post('/sales-order/materials/migrate', { rows, targetStatus });
    return response.data;
  }

  // ─── Legacy Methods (kept for backward compatibility) ───────────────────────

  /**
   * Add material item to sales order (legacy).
   */
  async addMaterialItem(
    salesOrderId: number,
    dto: AddMaterialItemDto,
  ): Promise<MaterialTransactionItem> {
    const response = await apiClient.post<MaterialTransactionItem>(
      `/sales-order/${salesOrderId}/materials`,
      dto,
    );
    return response.data;
  }

  /**
   * Add multiple material items to sales order (legacy).
   */
  async addMaterialItems(
    salesOrderId: number,
    dtos: AddMaterialItemDto[],
  ): Promise<MaterialTransactionItem[]> {
    const response = await apiClient.post<MaterialTransactionItem[]>(
      `/sales-order/${salesOrderId}/materials`,
      dtos,
    );
    return response.data;
  }

  /**
   * Get all material items for a sales order (legacy).
   */
  async getMaterialItems(salesOrderId: number): Promise<MaterialTransactionItem[]> {
    const response = await apiClient.get<MaterialTransactionItem[]>(
      `/sales-order/${salesOrderId}/materials`,
    );
    return response.data;
  }

  /**
   * Remove material item from sales order (legacy).
   */
  async removeMaterialItem(salesOrderId: number, materialItemId: number): Promise<any> {
    const response = await apiClient.delete(
      `/sales-order/${salesOrderId}/materials/${materialItemId}`,
    );
    return response.data;
  }

  // ─── Bulk Void & Unvoid ─────────────────────────────────────────────────────

  /**
   * Void multiple material sales orders with a reason.
   */
  async bulkVoidOrders(ids: number[], reason: string): Promise<{ success: boolean; message: string; voided: number; skipped: number }> {
    const response = await apiClient.post<{ success: boolean; message: string; voided: number; skipped: number }>(
      '/sales-order/materials/bulk-void',
      { ids, reason },
    );
    return response.data;
  }

  /**
   * Unvoid a voided material sales order (restore to complete, re-deduct stock).
   */
  async unvoidOrder(id: number): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/sales-order/materials/${id}/unvoid`,
    );
    return response.data;
  }
}
