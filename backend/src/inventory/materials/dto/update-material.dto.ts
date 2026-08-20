/**
 * =====================================================
 * UPDATE MATERIAL DTO
 * =====================================================
 * Purpose: Defines the structure for updating an existing material
 * 
 * All fields are optional since we might only want to update specific fields
 * =====================================================
 */

export class UpdateMaterialDto {
  brand_id?: number;
  material_name?: string;
  material_code?: string;
  description?: string;
  unit?: string;
  unit_price?: number;
  sell_price?: number;
  on_hand_stock?: number;
  reorder_level?: number;
  /** Password of the currently logged-in user, required when cost, sell price, or on-hand stock change. */
  authorizationPassword?: string;
}
