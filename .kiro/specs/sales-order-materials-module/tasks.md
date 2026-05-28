# Implementation Plan: Sales Order Materials Module

## Overview

This implementation restructures the Sales Order Materials page into a tab-based lifecycle module (Draft → Pending → Complete → Voided) with a simplified creation form, smart material search, RBAC-controlled cost visibility, non-inventory item support, and ACM purchase order enhancements. The work is split across backend API endpoints (NestJS with raw SQL via DatabaseService) and frontend Angular 19+ standalone components.

## Tasks

- [x] 1. Backend: Database schema and materials search endpoint
  - [x] 1.1 Create SQL migration for `tblsales_order_items` material columns
    - Add columns: `material_id` (INTEGER NULL FK), `description` (VARCHAR 255), `item_code` (VARCHAR 100 NULL), `brand` (VARCHAR 100 NULL), `cost` (DECIMAL 12,2), `rate` (DECIMAL 12,2), `qty` (INTEGER), `total` (DECIMAL 12,2), `is_non_inventory` (BOOLEAN DEFAULT FALSE)
    - Ensure `material_id` references `tblmaterials(id)` with ON DELETE SET NULL
    - _Requirements: 6.1, 6.5, 9.6_

  - [x] 1.2 Implement material smart search endpoint in `backend/src/inventory/materials/materials.controller.ts`
    - Add `GET /inventory/materials/search` endpoint accepting query params `q` (string, min 1 char) and `limit` (number, max 50, default 50)
    - Query `tblmaterials` joined with brands table, filtering by `material_name ILIKE`, `material_code ILIKE`, `product_type ILIKE`, or `brand_name ILIKE`
    - Return `MaterialSearchResult[]` with fields: id, material_name, material_code, product_type, brand_name, unit, unit_price, sell_price
    - _Requirements: 5.2_

  - [ ]* 1.3 Write property test for smart search endpoint
    - **Property 8: Smart search returns relevant results capped at 50**
    - **Validates: Requirements 5.2**

- [x] 2. Backend: Material sales order CRUD endpoints
  - [x] 2.1 Create `CreateMaterialSalesOrderDto` and `UpdateMaterialSalesOrderDto` in `backend/src/sales/sales-order/dto/`
    - Validate `status` as enum `'draft' | 'pending'`
    - Validate `productItems` array with nested validation for each item (materialId, description, cost, rate, qty, isNonInventory)
    - Validate `deliveryDate` as ISO date string, default to today
    - Validate QTY as integer 1–99999, Rate as numeric 0.01–999999.99
    - _Requirements: 6.6, 6.7, 7.2, 7.3, 9.1, 9.2_

  - [x] 2.2 Implement `GET /sales-order/materials` list endpoint in sales-order controller
    - Accept query params: `status` (SalesOrderStatus), `page`, `limit`, `search`
    - Filter by `sales_type = 'sales'` and the provided `status`
    - Return paginated list with meta (page, limit, total, totalPages)
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 2.3 Implement `POST /sales-order/materials` create endpoint
    - Accept `CreateMaterialSalesOrderDto` body
    - Set `salesType` to `'sales'` for all new orders
    - Allow saving with status `'draft'` without product items
    - Require at least 1 product item when status is `'pending'`
    - Insert into `tblsales_orders` and `tblsales_order_items` within a transaction
    - Compute `total = rate * qty` for each line item server-side
    - _Requirements: 3.2, 3.4, 7.2, 7.3, 7.4_

  - [x] 2.4 Implement `PATCH /sales-order/materials/:id` update endpoint
    - Preserve original `salesType` if it differs from `'sales'`
    - Omit `installer` property from updates
    - Replace existing line items with new set (delete + insert in transaction)
    - _Requirements: 3.3, 4.3, 4.4_

  - [x] 2.5 Implement `GET /sales-order/materials/:id` detail endpoint
    - Return full order with joined line items, customer info, and status
    - _Requirements: 3.5_

  - [ ]* 2.6 Write property tests for sales order creation and update
    - **Property 5: New orders always have salesType "sales"**
    - **Property 6: Editing preserves original salesType**
    - **Property 7: Installer property is never included in payloads**
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4**

  - [ ]* 2.7 Write property tests for line item calculations
    - **Property 11: Line item total calculation**
    - **Property 13: QTY validation bounds**
    - **Property 14: Rate validation bounds**
    - **Validates: Requirements 6.5, 6.6, 6.7**

- [x] 3. Checkpoint - Backend API verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend: Core interfaces, service, and tab navigation
  - [x] 4.1 Create TypeScript interfaces and types in `frontend/src/app/shared/services/sales-order-material.service.ts`
    - Define `SalesOrderStatus`, `MaterialSearchResult`, `LineItem`, `CreateMaterialSalesOrderPayload`, `MaterialSalesOrderListParams`
    - Add service methods: `getMaterialSalesOrders(params)`, `createMaterialSalesOrder(payload)`, `updateMaterialSalesOrder(id, payload)`, `getMaterialSalesOrderById(id)`, `searchMaterials(q, limit)`
    - Use existing `apiClient` for HTTP calls
    - _Requirements: 5.2, 5.3, 7.2, 7.3_

  - [x] 4.2 Implement tab navigation in `SalesOrderMaterialsComponent`
    - Render exactly 4 tabs: Draft, Pending, Complete, Voided
    - Default to Draft tab on load
    - On tab change, fetch orders filtered by selected status, reset to page 1
    - Display paginated order list per tab with search support
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.3 Implement print button visibility logic in the order list
    - Show enabled print button only for orders with status `'pending'` or `'complete'`
    - Hide print button for `'draft'` and `'voided'` orders
    - _Requirements: 1.7, 1.8, 1.9_

  - [ ]* 4.4 Write property tests for tab filtering and print visibility
    - **Property 1: Tab filtering shows only matching status orders**
    - **Property 2: Print button visibility follows status rules**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**

- [x] 5. Frontend: Sales order material form component
  - [x] 5.1 Create `SalesOrderMaterialFormComponent` standalone component
    - Include delivery date field labeled "Delivery Date", defaulting to today's date
    - Use `RbacService.isAdminOrSuperAdmin()` to control delivery date editability
    - Non-admin users: date field disabled, always reset to today
    - Admin users: date field editable
    - Include customer selection (reuse existing customer search pattern)
    - Exclude Sales Type field from form UI (set `salesType = 'sales'` in payload)
    - Exclude Installer field from form UI (omit from payload)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.2, 4.3_

  - [x] 5.2 Implement smart material search in the form
    - Full-width search input above product items table
    - On typing ≥1 character, query `GET /inventory/materials/search?q=...&limit=50`
    - Display dropdown with matching results (name, code, brand, type)
    - On selection: add new row with description, item_code, brand, cost (unit_price), rate (sell_price), qty=1
    - If material already exists as line item, add as separate new row (no merging)
    - If no results: show "No materials found" with option to add as non-inventory item
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.3 Write property tests for material selection and search
    - **Property 9: Material selection populates row correctly**
    - **Property 10: Selecting an existing material creates a new row**
    - **Validates: Requirements 5.3, 5.5**

- [x] 6. Frontend: Product items table and calculations
  - [x] 6.1 Create `ProductItemsTableComponent` standalone component
    - Display columns: ITEM No., Description, Cost, Rate, QTY, Total, Action
    - Show Cost column only when `RbacService.isAdminOrSuperAdmin()` returns true
    - Hide Cost column for non-admin users
    - Allow inline editing of Rate and QTY fields
    - Validate QTY: integer 1–99999; Rate: numeric 0.01–999999.99 with max 2 decimals
    - Calculate Total = Rate × QTY (rounded to 2 decimal places) per row
    - Display Grand Total (sum of all Totals) and Total QTY (sum of all QTYs) at bottom
    - Recalculate Grand Total and Total QTY on item add/remove/edit
    - Include remove action button per row
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ]* 6.2 Write property tests for table calculations
    - **Property 12: Table totals invariant**
    - **Validates: Requirements 6.8, 6.9, 6.10**

- [x] 7. Frontend: Non-inventory items and form actions
  - [x] 7.1 Implement non-inventory item handling
    - When user adds non-inventory item from search "no results" state, create row with typed description (max 255 chars)
    - Set `isNonInventory = true` on the line item
    - Allow manual entry of Rate and QTY with same validation rules
    - Prevent adding if Rate = 0 or QTY is empty (show validation message)
    - Include non-inventory items in Grand Total and Total QTY calculations
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.2 Implement form action buttons ("Create Order" and "Save as Draft")
    - "Save as Draft": save with status `'draft'`, no product items required
    - "Create Order": save with status `'pending'`, require ≥1 product item (show validation message if empty)
    - Disable both buttons during save operation (prevent duplicate submissions)
    - On success: display success toast message
    - On error: display error message, retain all form data
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 7.3 Write property tests for form actions and non-inventory
    - **Property 15: Draft save succeeds without product items**
    - **Property 16: Create Order saves with pending status**
    - **Property 17: Form data retention on server error**
    - **Property 21: Non-inventory item description length**
    - **Property 22: Non-inventory items persist with flag**
    - **Validates: Requirements 7.2, 7.3, 7.5, 9.1, 9.6**

- [x] 8. Checkpoint - Frontend sales order module verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Backend: Purchase Order ACM support
  - [x] 9.1 Extend purchase order service for ACM product type
    - When `poType = 'ACM'`, validate material name (required) and quantity (1–999999)
    - Store material brand, name, code, unit, and quantity in purchase order items
    - Allow searching existing materials by name or code for ACM items
    - If material does not exist in catalog, auto-create it with provided brand, name, code, and unit before saving
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x] 9.2 Implement ACM stock movement on purchase order completion
    - When ACM purchase order transitions to completed status, record inbound stock movement (type IN)
    - Increase `on_hand_stock` by the quantity specified in each ACM line item
    - Use existing `MaterialStockService` and `MaterialTransactionsService` patterns
    - _Requirements: 8.4_

  - [ ]* 9.3 Write property tests for ACM purchase order logic
    - **Property 18: ACM PO requires material name and quantity**
    - **Property 19: ACM completion increases stock**
    - **Property 20: ACM auto-creates non-existent materials**
    - **Validates: Requirements 8.3, 8.4, 8.6**

- [x] 10. Frontend: Purchase Order ACM UI support
  - [x] 10.1 Extend purchase order form for ACM product type
    - Add ACM as selectable product type option
    - When ACM selected, display material-specific fields: brand, name, code, unit, quantity
    - Implement material search within PO form (search by name or code)
    - Validate material name (required) and quantity (1–999999) before submission
    - Show error indication if required fields missing
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 11. Frontend: RBAC delivery date and report inclusion
  - [x] 11.1 Implement delivery date RBAC behavior and report logic
    - Wire `RbacService.isAdminOrSuperAdmin()` check for delivery date editability
    - Non-admin: reset delivery date to today on form open, disable field
    - Admin: allow editing delivery date
    - Ensure only `'complete'` status orders are included in report calculations
    - _Requirements: 2.3, 2.4, 2.5, 1.10_

  - [ ]* 11.2 Write property tests for delivery date RBAC and reports
    - **Property 3: Only complete orders are included in reports**
    - **Property 4: Delivery date editability follows RBAC**
    - **Validates: Requirements 1.10, 2.3, 2.4**

- [x] 12. Integration wiring and final verification
  - [x] 12.1 Wire all components together and configure routing
    - Register `SalesOrderMaterialFormComponent` route for create/edit
    - Connect tab navigation to list endpoint with status filtering
    - Wire form submission to create/update endpoints
    - Ensure edit mode loads existing order data and preserves salesType
    - Connect print button to existing print functionality for pending/complete orders
    - _Requirements: 1.1, 1.2, 3.3, 3.5, 7.1_

  - [x] 12.2 Register backend module and update app module
    - Add new material sales order endpoints to `sales-order.controller.ts`
    - Register material search endpoint in materials module
    - Ensure JWT auth guard and permission decorators are applied to new endpoints
    - _Requirements: All_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `SalesOrderMaterialsComponent` and `SalesOrderMaterialService` will be significantly refactored rather than replaced
- All new components use Angular 19+ standalone component pattern
- Backend uses raw SQL via `DatabaseService` (pg PoolClient) — no ORM

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6", "2.7", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["4.4", "5.2", "6.1"] },
    { "id": 6, "tasks": ["5.3", "6.2", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1", "12.2"] }
  ]
}
```
