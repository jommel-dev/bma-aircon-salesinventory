/**
 * =====================================================
 * MATERIAL INVENTORY SERVICE
 * =====================================================
 * Purpose: Handle API calls for material inventory management
 *
 * This service communicates with backend /inventory/materials endpoints
 * =====================================================
 */

import { Injectable } from '@angular/core';
import { apiClient } from './api-client';

// Material interface matching backend entity
export interface Material {
  id: number;
  brand_id: number | null;
  product_type_id?: number | null;
  material_name: string;
  material_code: string | null;
  description: string | null;
  unit: string;
  unit_price: number;
  sell_price: number;
  on_hand_stock: number;
  reorder_level: number;
  brand_name?: string;
  created_at: string;
  updated_at: string | null;
}

// Brand interface for material brands (type='MAT')
export interface MaterialBrand {
  id: number;
  brandName: string;
  prefix: string;
  product_type_id?: number | null;
}

// History interfaces
export interface PriceHistoryRecord {
  id: number;
  unit_price: number;
  sell_price: number;
  created_by: number | null;
  created_at: string;
}

export interface StockMovementRecord {
  id: number;
  movement_type: string;
  qty: number;
  source_type: string;
  source_id: number;
  source_line_key: string;
  remarks: string | null;
  created_by: number | null;
  created_at: string;
}

export interface MaterialHistoryResponse {
  success: boolean;
  priceHistory: PriceHistoryRecord[];
  stockMovements: StockMovementRecord[];
}

// Tree view interfaces
export interface BrandNode {
  id: number;
  name: string;
  type: 'brand';
  prefix: string;
}

export interface ProductTypeNode {
  id: number | null;       // null for "Uncategorized"
  name: string;
  type: 'product-type';
  materialCount: number;
  children: BrandNode[];
}

@Injectable({
  providedIn: 'root'
})
export class MaterialInventoryService {
  private baseUrl = '/inventory/materials';

  /**
   * Get tree structure (Product Types → Brands)
   */
  async getTree(): Promise<ProductTypeNode[]> {
    const response = await apiClient.get(`${this.baseUrl}/tree`);
    return response.data.tree ?? response.data;
  }

  /**
   * Get all materials with optional filters
   */
  async getMaterials(search?: string, brandId?: number, productTypeId?: number): Promise<Material[]> {
    const params: any = {};
    if (search) params.search = search;
    const parsedBrandId = Number(brandId);
    if (parsedBrandId && !isNaN(parsedBrandId)) {
      params.brandId = parsedBrandId;
    }
    const parsedProductTypeId = Number(productTypeId);
    if (parsedProductTypeId && !isNaN(parsedProductTypeId)) {
      params.productTypeId = parsedProductTypeId;
    }

    const response = await apiClient.get(this.baseUrl, { params });
    const data = response.data;
    // Backend returns { success, items } wrapper
    return data.items ?? data ?? [];
  }

  /**
   * Get single material by ID
   */
  async getMaterial(id: number): Promise<Material> {
    const response = await apiClient.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Get material brands (type='MAT')
   */
  async getMaterialBrands(): Promise<MaterialBrand[]> {
    const response = await apiClient.get(`${this.baseUrl}/brands`);
    const data = response.data;
    // Backend returns { success, items } or a flat array
    const items = data.items ?? data;
    return Array.isArray(items) ? items.map((b: any) => ({
      id: b.id,
      brandName: b.brandName ?? b.name ?? b.brand_name ?? '',
      prefix: b.prefix ?? '',
      product_type_id: b.product_type_id ?? null,
    })) : [];
  }

  async getNextMaterialCode(brandId: number): Promise<{ material_code: string; next_sequence: number }> {
    const response = await apiClient.get(`${this.baseUrl}/next-code`, {
      params: { brandId },
    });
    return response.data;
  }

  /**
   * Get next material code by prefix (scans DB for existing codes with that prefix)
   */
  async getNextMaterialCodeByPrefix(prefix: string): Promise<{ material_code: string; next_sequence: number }> {
    const response = await apiClient.get(`${this.baseUrl}/next-code-by-prefix`, {
      params: { prefix },
    });
    return response.data;
  }

  /**
   * Get low stock materials
   */
  async getLowStockMaterials(): Promise<Material[]> {
    const response = await apiClient.get(`${this.baseUrl}/low-stock`);
    return response.data;
  }

  /**
   * Create new material
   */
  async createMaterial(data: Partial<Material>): Promise<Material> {
    const response = await apiClient.post(this.baseUrl, data);
    return response.data;
  }

  /**
   * Update material
   */
  async updateMaterial(
    id: number,
    data: Partial<Material> & { authorizationPassword?: string },
  ): Promise<Material> {
    const response = await apiClient.patch(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  /**
   * Soft delete a material (sets deleted_at)
   */
  async deleteMaterial(id: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
  }

  /**
   * Get material history (price history + stock movements)
   * Returns up to 100 records per category, ordered by created_at DESC
   */
  async getHistory(materialId: number): Promise<MaterialHistoryResponse> {
    const response = await apiClient.get(`${this.baseUrl}/${materialId}/history`);
    return response.data;
  }

  /**
   * Adjust stock for a material (increase or decrease)
   */
  async adjustStock(materialId: number, data: StockAdjustmentDto): Promise<StockAdjustmentResponse> {
    const response = await apiClient.post(`${this.baseUrl}/${materialId}/adjust`, data);
    return response.data;
  }

  /**
   * Create new brand — returns the created brand's ID.
   * If the brand already exists, returns the existing brand's ID.
   */
  async createBrand(name: string, prefix?: string, productTypeId?: number | null): Promise<number | null> {
    const response = await apiClient.post('/brands', { name, prefix, type: 'MAT', product_type_id: productTypeId ?? null });
    const data = response.data;

    // Brand created successfully
    if (data?.success && data?.item?.id) {
      return data.item.id;
    }

    // Brand already exists — find its ID from the brands list
    if (!data?.success && data?.message?.includes('already exists')) {
      const brands = await this.getMaterialBrands();
      const existing = brands.find(b => b.brandName.toLowerCase() === name.trim().toLowerCase());
      return existing?.id ?? null;
    }

    return null;
  }

  /**
   * Get all product types
   */
  async getProductTypes(): Promise<{ id: number; name: string; prefix: string }[]> {
    const response = await apiClient.get('/product-types');
    return response.data.items ?? response.data;
  }

  /**
   * Create new product type
   */
  async createProductType(name: string, prefix?: string): Promise<void> {
    await apiClient.post('/product-types', { name, prefix });
  }

  /**
   * Update product type (name and/or prefix).
   * If prefix changes, all material codes under this type will be resequenced.
   */
  async updateProductType(id: number, data: { name?: string; prefix?: string }): Promise<void> {
    await apiClient.patch(`/product-types/${id}`, data);
  }

  /**
   * Resequence material codes for a product type (closes gaps after deletion).
   */
  async resequenceMaterialCodes(productTypeId: number): Promise<void> {
    await apiClient.post(`/product-types/${productTypeId}/resequence`);
  }

  /**
   * Bulk upload materials from CSV/Excel
   */
  async bulkUploadMaterials(rows: any[]): Promise<{ success: boolean; summary: { total: number; created: number; skipped: number; failed: number }; results: any[] }> {
    const response = await apiClient.post(`${this.baseUrl}/bulk-upload`, { rows });
    return response.data;
  }

  async migrateStock(rows: any[]): Promise<{ success: boolean; summary: { total: number; updated: number; failed: number }; results: any[] }> {
    const response = await apiClient.post(`${this.baseUrl}/migrate-stock`, { rows });
    return response.data;
  }
}

// Stock Adjustment DTO
export interface StockAdjustmentDto {
  direction: 'increase' | 'decrease';
  quantity: number;       // 1 to 999999
  remarks?: string;       // max 500 chars
  authorizationPassword?: string;
}

// Stock Adjustment Response
export interface StockAdjustmentResponse {
  success: boolean;
  message: string;
  material: Material;
}
