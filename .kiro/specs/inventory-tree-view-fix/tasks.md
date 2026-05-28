# Implementation Plan: Inventory Tree View Fix

## Overview

This plan implements the Material Inventory module fix and enhancement in incremental steps. It starts with the database schema migration, then builds backend endpoints, followed by the frontend tree view and material table components, and finally wires everything together with action menus, stock notices, and stock deficit recording.

## Tasks

- [x] 1. Database schema migration and backend setup
  - [x] 1.1 Create SQL migration to add `product_type_id` column to `tblbrands`
    - Add `product_type_id BIGINT NULL` column with FK reference to `tblproducttypes(id)` with `ON UPDATE CASCADE ON DELETE SET NULL`
    - Create index `idx_tblbrands_product_type_id` on the new column
    - Place migration file in `backend/sql/` directory
    - _Requirements: 2.2, 2.3_

  - [x] 1.2 Add `fast-check` dev dependency to backend
    - Install `fast-check` as a devDependency in the backend `package.json`
    - _Requirements: Testing infrastructure_

  - [x] 1.3 Update `BrandsService` to filter by type MAT and include `product_type_id`
    - Modify the existing `BrandsService` to expose a method `getMaterialBrands()` that returns only brands where `type = 'MAT'`
    - Ensure the brand entity/interface includes the `product_type_id` field
    - _Requirements: 1.3, 1.4_

  - [ ]* 1.4 Write property test: MAT-brand filter completeness
    - **Property 1: MAT-brand filter completeness**
    - Test that `getMaterialBrands()` returns only and all brands with `type = 'MAT'`
    - Use fast-check to generate arbitrary brand arrays with mixed types
    - **Validates: Requirements 1.3**

- [x] 2. Implement tree view backend endpoint
  - [x] 2.1 Create `GET /materials/tree` endpoint in `MaterialsController`
    - Query `tblproducttypes` joined with `tblbrands` (type='MAT') grouped by `product_type_id`
    - Include "Uncategorized" node for MAT brands with null `product_type_id`
    - Return `TreeResponse` with `ProductTypeNode[]` containing nested `BrandNode[]`
    - Sort product types alphabetically, brands alphabetically within each type
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

  - [ ]* 2.2 Write property test: Tree structure completeness and ordering
    - **Property 4: Tree structure completeness and ordering**
    - Test that all product types appear as parent nodes in ascending order
    - Test that each product type's children are its MAT brands in ascending order
    - **Validates: Requirements 2.1, 2.2, 2.5, 2.6**

- [x] 3. Implement materials by brand endpoint enhancements
  - [x] 3.1 Enhance `GET /materials` endpoint to support `brandId` and `search` query params
    - Filter materials by `brand_id` when `brandId` param is provided
    - Exclude soft-deleted records (`deleted_at IS NULL`)
    - Sort results by `material_name` ascending
    - Return `MaterialListResponse` with `MaterialRow[]`
    - _Requirements: 3.1_

  - [ ]* 3.2 Write property test: Material table filtering and sorting
    - **Property 6: Material table filtering and sorting**
    - Test that selecting a brand returns exactly the non-deleted materials with that brand_id, sorted alphabetically
    - **Validates: Requirements 3.1**

- [x] 4. Fix material creation persistence
  - [x] 4.1 Fix material creation to persist to `tblmaterials` with MAT-brand validation
    - Ensure `MaterialsService.create()` inserts into `tblmaterials` only
    - Validate that provided `brand_id` references a brand with `type = 'MAT'`
    - Reject with 400 if brand type is ACU
    - Reject with 404 if brand_id does not exist
    - Reject with 400 if material_name already exists (among non-deleted records)
    - Allow null brand_id (no brand association)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 4.2 Write property test: Material persistence target invariant
    - **Property 3: Material persistence target invariant**
    - Test that material creation inserts exactly one row into `tblmaterials` and zero rows into `tblproducts`
    - **Validates: Requirements 1.1, 1.7**

  - [ ]* 4.3 Write property test: Duplicate material name rejection
    - **Property 2: Duplicate material name rejection**
    - Test that creating a material with an existing name is rejected
    - **Validates: Requirements 1.6**

- [x] 5. Checkpoint - Backend core functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement stock adjustment endpoint
  - [x] 6.1 Create `POST /materials/:id/adjust` endpoint
    - Accept `StockAdjustmentDto` with direction, quantity, and optional remarks
    - Validate quantity is between 1 and 999999
    - Validate remarks length <= 500 characters
    - Reject decrease if it would reduce `on_hand_stock` below zero
    - Record a `Stock_Movement` with `movement_type = 'ADJUST'` in `tblmaterial_stock_movement`
    - Update `on_hand_stock` on the material record
    - Return updated material data
    - _Requirements: 4.6, 4.7_

  - [ ]* 6.2 Write property test: Stock adjustment recording
    - **Property 9: Stock adjustment recording**
    - Test that valid adjustments record correct movement and update stock
    - Test that decreases below zero are rejected
    - **Validates: Requirements 4.6, 4.7**

- [x] 7. Implement material history endpoint
  - [x] 7.1 Create `GET /materials/:id/history` endpoint
    - Return price history from `tblmaterial_price_history` ordered by `created_at` DESC, limited to 100
    - Return stock movements from `tblmaterial_stock_movement` ordered by `created_at` DESC, limited to 100
    - _Requirements: 4.8_

- [x] 8. Implement stock deficit recording
  - [x] 8.1 Add stock deficit recording logic to sales order processing
    - When a sales order line item's `ordered_qty > on_hand_stock`, record a `Stock_Movement` with `movement_type = 'OUT'`, `qty = ordered_qty - on_hand_stock`, `source_type = 'SO'`, `source_id = sales_order_id`, `source_line_key = line_item_key`
    - Add remarks indicating deficit quantity and sourcing from another supplier
    - Ensure `on_hand_stock` is NOT reduced below zero
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 8.2 Write property test: Stock deficit recording with non-negative balance
    - **Property 10: Stock deficit recording with non-negative balance**
    - Test that deficit records correct movement and does not reduce stock below zero
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 9. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement frontend tree view component
  - [x] 10.1 Create `MaterialInventoryComponent` with split-panel layout
    - Create the component in the existing `material-inventory` page directory
    - Implement 30/70 split layout using Tailwind CSS (tree left, table right)
    - Add route configuration for the material inventory page
    - _Requirements: 2.1_

  - [x] 10.2 Implement tree panel with expandable/collapsible nodes
    - Build custom tree component using Tailwind CSS (no PrimeNG)
    - Display Product Type nodes as expandable parents with folder icons
    - Display Brand nodes as children under their Product Type
    - Display "Uncategorized" node for brands without product_type_id
    - Sort product types alphabetically, brands alphabetically within each type
    - Call `GET /materials/tree` on component init
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

  - [x] 10.3 Implement tree search with debounced filtering
    - Add search input at the top of the tree panel
    - Implement debounced (300ms) case-insensitive substring filtering
    - Auto-expand parent nodes that contain matching children
    - Restore full tree with collapsed state when search is cleared
    - _Requirements: 2.4, 2.8_

  - [ ]* 10.4 Write property test: Tree search filter correctness
    - **Property 5: Tree search filter correctness**
    - Test that filtered tree contains only matching nodes plus parent nodes of matching children
    - Use fast-check to generate arbitrary tree structures and search terms
    - **Validates: Requirements 2.4**

- [x] 11. Implement frontend material table
  - [x] 11.1 Implement material table with data columns and computed values
    - Display columns: Item Code, Product Name, Stock Notice, Cost, Price (PHP), Margin, Inventory Stock, Overall Cost, Overall Price, Overall Margin
    - Implement computed columns: margin, overallCost, overallPrice, overallMargin (all to 2 decimal places)
    - Call `GET /materials?brandId=X` when a brand node is clicked in the tree
    - Display empty state message when no materials exist for selected brand
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 11.2 Write property test: Material computed columns correctness
    - **Property 7: Material computed columns correctness**
    - Test that margin, overallCost, overallPrice, overallMargin are computed correctly for arbitrary numeric inputs
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6**

  - [x] 11.3 Implement stock notice badges
    - Display green "Normal" badge when `on_hand_stock > reorder_level`
    - Display orange "Low Stock" badge when `0 < on_hand_stock <= reorder_level`
    - Display red "Out of Stock" badge when `on_hand_stock <= 0`
    - Use Tailwind CSS classes for badge styling
    - _Requirements: 3.8, 3.9, 3.10, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 11.4 Write property test: Stock notice classification
    - **Property 8: Stock notice classification**
    - Test that stock status is correctly classified for arbitrary on_hand_stock and reorder_level values
    - **Validates: Requirements 3.8, 3.9, 3.10, 5.1, 5.2, 5.3, 5.4**

- [x] 12. Implement action menu and forms
  - [x] 12.1 Implement three-dot action menu on each table row
    - Add three-dot button in the last column of each row
    - Display context menu with options: Edit, Delete, Adjustment, History (in that order)
    - Close menu when clicking outside
    - _Requirements: 4.1, 4.2, 4.9_

  - [x] 12.2 Implement Edit action with pre-populated form
    - Open edit form pre-populated with material's current values (material_name, material_code, description, unit, unit_price, sell_price, on_hand_stock, reorder_level)
    - Submit changes via `PUT /materials/:id`
    - Refresh table data on successful save
    - _Requirements: 4.3_

  - [x] 12.3 Implement Delete action with confirmation dialog
    - Display confirmation dialog showing material name
    - On confirm: perform soft delete via `DELETE /materials/:id` (sets `deleted_at`)
    - On cancel: close dialog, leave material unchanged
    - Refresh table data on successful delete
    - _Requirements: 4.4, 4.5_

  - [x] 12.4 Implement Adjustment action with stock adjustment form
    - Open form with direction selector (increase/decrease), quantity input (1-999999), and optional remarks (max 500 chars)
    - Submit via `POST /materials/:id/adjust`
    - Display error if insufficient stock for decrease
    - Refresh table data on successful adjustment
    - _Requirements: 4.6, 4.7_

  - [x] 12.5 Implement History action with price and stock movement display
    - Call `GET /materials/:id/history`
    - Display price history and stock movements ordered by `created_at` DESC
    - Show deficit records with remarks indicating deficit context
    - Limit display to 100 records per category
    - _Requirements: 4.8, 6.4_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses NestJS with TypeScript and Supabase/PostgreSQL
- The frontend uses Angular with Tailwind CSS (no PrimeNG)
- `fast-check` is already installed in the frontend; needs to be added to backend devDependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["1.4", "2.2", "3.2", "4.2", "4.3"] },
    { "id": 3, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["6.2", "8.2"] },
    { "id": 5, "tasks": ["10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] },
    { "id": 7, "tasks": ["10.4", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3"] },
    { "id": 9, "tasks": ["11.4", "12.1"] },
    { "id": 10, "tasks": ["12.2", "12.3", "12.4", "12.5"] }
  ]
}
```
