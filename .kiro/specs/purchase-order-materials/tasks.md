# Implementation Plan: Purchase Order Materials (ACM)

## Overview

This plan implements the redesigned Purchase Order Materials (ACM type) module following the Sales Order Materials UX pattern. The implementation spans backend DTO validation and service enhancements (NestJS), frontend Angular components (list page, form page, items table, material search, vendor selector, payment details), and property-based tests using fast-check.

## Tasks

- [x] 1. Backend DTO validation and ACM-specific logic
  - [x] 1.1 Enhance CreatePurchaseDto with ACM validation rules
    - Add conditional validation in `backend/src/inventory/purchase/dto/create-purchase.dto.ts` for `poType === 'ACM'`
    - Validate `productItems` is a non-empty array
    - Each item: `unitPrice` in [0.01, 999999.99], `discountPrice` in [0, 999999.99], `totalSetQty` integer in [1, 999999]
    - Each ACM item must have `materialId` or non-empty `materialName`
    - Require `vendorId` or `vendor.name` (non-empty)
    - Error responses include field path of first invalid item (e.g., `productItems[0].unitPrice`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 1.2 Enhance UpdatePurchaseDto with ACM validation and status guard
    - Apply same ACM validation rules as create DTO
    - Add status check: reject update if PO status is not `in-progress`
    - _Requirements: 7.4, 7.5, 10.1–10.8_

  - [ ]* 1.3 Write property tests for backend DTO validation (Property 17)
    - **Property 17: Backend DTO validation rejects invalid field values with field path**
    - Use fast-check to generate invalid payloads (out-of-range unitPrice, non-integer qty, missing material identification)
    - Verify rejection with correct field path in error response
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8**

- [x] 2. Backend service enhancements for ACM PO operations
  - [x] 2.1 Add material search endpoint to PurchaseController
    - Add `GET /purchase/materials/search?query=` endpoint in `purchase.controller.ts`
    - Query `tblmaterials` joined with `tblbrands` and product types
    - Case-insensitive partial match on material_name, material_code, brand name, product_type
    - Return max 50 results with fields: id, material_name, material_code, unit, unit_price, sell_price, brand_name, product_type
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Enhance PO create logic for ACM type
    - In `purchase.service.ts`, add ACM-specific creation logic within existing `create` method
    - Auto-generate `po_number` as `'PO-' + id.toString().padStart(6, '0')`
    - Set `po_type = 'ACM'`, initial status to `for_approval`
    - Insert line items into `tbltransaction_material_items` with `trans_type = 'purchase'`
    - Compute `total_amount` as sum of `(discount_price > 0 ? discount_price : unit_price) * quantity`
    - Associate `branch_id` from authenticated user session
    - Wrap in database transaction
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 6.8_

  - [x] 2.3 Enhance PO update logic for ACM type
    - In `purchase.service.ts`, add ACM-specific update logic
    - Guard: reject if status is not `in-progress`
    - Replace all existing line items with new set (delete old, insert new)
    - Recompute `total_amount`
    - _Requirements: 7.4, 7.5_

  - [x] 2.4 Ensure status transition logic handles all ACM transitions
    - Verify existing status transition endpoints enforce the linear sequence: `in-progress → for_approval → approved → received → completed`
    - Verify revert endpoint transitions `for_approval → in-progress`
    - Reject invalid transitions with descriptive error message
    - Return 404 if PO not found
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]* 2.5 Write property tests for status transition state machine (Property 14)
    - **Property 14: Status transition state machine**
    - Use fast-check to generate arbitrary (status, action) pairs
    - Verify only valid transitions succeed, invalid ones are rejected without modifying status
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

  - [ ]* 2.6 Write property tests for total amount computation (Property 12)
    - **Property 12: Total amount computation on PO creation/update**
    - Use fast-check to generate arrays of line items with varying prices and quantities
    - Verify stored total_amount equals sum of `(discountPrice > 0 ? discountPrice : unitPrice) * qty`
    - **Validates: Requirements 6.7, 7.4**

- [x] 3. Checkpoint - Backend validation and service logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend PO Materials Service
  - [x] 4.1 Create PO Materials Angular service
    - Create `frontend/src/app/pages/purchase-order-materials/po-materials.service.ts`
    - Implement methods: `getMyRequests`, `getDeliveries`, `getApprovals`, `getMasterData` (with po_type=ACM filter)
    - Implement `createPurchaseOrder`, `updatePurchaseOrder`, `getPurchaseOrderById`
    - Implement `searchMaterials(query)` and `searchVendors(query)`
    - Implement status transition methods: `submitForApproval`, `approve`, `receive`, `complete`, `revertToInProgress`
    - _Requirements: 1.1, 1.2, 2.1, 4.1, 6.3, 7.1, 8.1–8.6_

- [x] 5. Frontend PO Items Table Component
  - [x] 5.1 Create PO Items Table component
    - Create `frontend/src/app/pages/purchase-order-materials/po-items-table/po-items-table.component.ts` and template
    - Implement columns: Item No, Description, Cost (admin only), Rate, Discount, QTY, Total, Action
    - Rate validation: 0.01–999999.99 (2 decimal places)
    - Discount validation: 0–999999.99 (2 decimal places)
    - QTY validation: integer 1–99999
    - Total computation: `Math.round(Math.max(rate - discount, 0) * qty * 100) / 100`
    - Footer row: sum of QTY, grand total (sum of all line totals), display 0 when empty
    - Remove action button per row
    - Read-only mode support via `@Input() isReadOnly`
    - Admin cost column visibility via `@Input() isAdmin`
    - Reject invalid input and retain previous valid value
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 5.2 Write property tests for line item total computation (Property 8)
    - **Property 8: Line item total computation**
    - Use fast-check to generate valid rate, discount, qty values
    - Verify total equals `round(max(rate - discount, 0) * qty, 2)`
    - **Validates: Requirements 3.5**

  - [ ]* 5.3 Write property tests for footer computation (Property 9)
    - **Property 9: Footer computation is the sum of line items**
    - Use fast-check to generate arrays of line items
    - Verify footer QTY = sum of quantities, grand total = sum of totals
    - Verify after removal, footer recomputes correctly
    - **Validates: Requirements 3.6, 3.7**

  - [ ]* 5.4 Write property tests for field validation (Property 7)
    - **Property 7: Line item field validation accepts valid inputs and rejects invalid inputs**
    - Use fast-check to generate boundary and out-of-range values for Rate, Discount, QTY
    - Verify valid values are accepted, invalid values are rejected
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.9**

- [x] 6. Frontend PO Materials List Page
  - [x] 6.1 Create PO Materials List page component
    - Create `frontend/src/app/pages/purchase-order-materials/po-materials-list/po-materials-list.component.ts` and template
    - Implement four tabs: "My Requests", "Deliveries", "Approvals", "Master Data"
    - Default to first permitted tab
    - Tab selection resets list to page 1 and fetches filtered data
    - Debounced search (500ms) filtering by PO number or vendor name
    - Display "no results" message when search yields empty
    - Pagination: 10 items/page with page navigation (current page, total pages, prev/next)
    - Error state: display error message and empty list on API failure
    - "New PO" button navigates to form page with ACM type preset
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 6.2 Write unit tests for PO Materials List page
    - Test tab rendering and selection behavior
    - Test search debounce and filtering
    - Test pagination controls
    - Test error state display
    - Test "New PO" navigation
    - _Requirements: 1.1–1.7_

- [x] 7. Frontend PO Materials Form Page
  - [x] 7.1 Create PO Materials Form page component with Material Search Bar
    - Create `frontend/src/app/pages/purchase-order-materials/po-materials-form/po-materials-form.component.ts` and template
    - Implement Material Search Bar: debounced (300ms), min 2 chars, max 50 results
    - Search by name, code, product type, brand (case-insensitive partial match)
    - On material select: add line item with description=material_name, itemCode=material_code, rate=unit_price, unit=unit, qty=1
    - On duplicate material select: increment existing line item qty by 1
    - Display "No materials found" when search returns empty
    - Hide dropdown when input < 2 chars
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.2 Implement Vendor Selector in form page
    - Add vendor search with 300ms debounce, max 20 results
    - Display "no results" when no vendors match
    - On vendor select: populate name, address, contact_person, contact_number
    - Support "new vendor" mode: name (required, max 200 chars), address, contact_person, contact_number
    - Validation: prevent submission without vendor selection or new vendor name
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.3 Implement Payment Details section in form page
    - Add payment details section with all fields: method, amount, terms, termsDueDate, status, paymentDate, bankName, referenceNo, checkNo, chequeDate, issuedBy, downPayment
    - Implement conditional field visibility based on payment method
    - Auto-set status to "paid" for Cash/Bank Transfer
    - Auto-set status to "unpaid" for Terms/Terms with DP/Cheque/Installment, "overdue" if due date < today
    - Support multiple payment entries per PO
    - Amount: numeric, 2 decimal places, max 12 digits
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.4 Implement Remarks field and form submission logic
    - Add remarks textarea: optional, max 1000 chars, show character count
    - Prevent input beyond 1000 chars
    - On submit: validate at least one line item exists, vendor is selected/provided
    - Call `createPurchaseOrder` or `updatePurchaseOrder` based on mode
    - Handle success (navigate to list) and error (display validation messages)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.5 Implement edit mode and read-only state
    - Load existing PO data on edit (vendor, line items, payments, remarks)
    - If status is `in-progress`: allow full editing
    - If status is `for_approval`, `approved`, `received`, or `completed`: read-only mode (all inputs disabled)
    - On save: replace line items, recompute total
    - Prevent save if line items list is empty
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 7.6 Write property tests for payment method field visibility (Property 10)
    - **Property 10: Payment method determines visible fields**
    - Use fast-check to generate all payment method values
    - Verify visible fields match the defined mapping exactly
    - **Validates: Requirements 5.2**

  - [ ]* 7.7 Write property tests for payment status derivation (Property 11)
    - **Property 11: Payment status derived from method and due date**
    - Use fast-check to generate payment methods and due dates relative to today
    - Verify status is "paid" for Cash/Bank Transfer, "overdue" if due date < today, "unpaid" otherwise
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 7.8 Write property tests for remarks trimming (Property 16)
    - **Property 16: Remarks trimming**
    - Use fast-check to generate strings with leading/trailing whitespace
    - Verify persisted value equals trimmed input, whitespace-only becomes empty string
    - **Validates: Requirements 9.3**

- [x] 8. Checkpoint - Frontend components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Routing, integration, and wiring
  - [x] 9.1 Set up Angular routing for PO Materials pages
    - Add route configuration for `purchase-order-materials` path
    - List page as default route
    - Form page routes: `/purchase-order-materials/new` and `/purchase-order-materials/edit/:id`
    - Lazy-load the module
    - Add navigation menu entry
    - _Requirements: 1.1, 1.7_

  - [x] 9.2 Wire form page components together
    - Integrate PoItemsTableComponent, Material Search Bar, Vendor Selector, Payment Details, and Remarks into the form page
    - Connect service calls for create/update/load
    - Wire status transition actions (submit, approve, receive, complete, revert) with appropriate permission checks
    - Handle loading states and error display
    - _Requirements: 6.3, 7.1, 8.1–8.6_

  - [ ]* 9.3 Write integration tests for PO creation and update flow
    - Test full create flow: fill form → submit → verify API call payload
    - Test full update flow: load PO → edit → save → verify updated payload
    - Test status transition sequence
    - Test read-only mode enforcement
    - _Requirements: 6.3, 7.1, 7.3, 8.1–8.7_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation follows the existing Sales Order Materials pattern (`frontend/src/app/pages/sales-order-materials/`)
- Backend extends the existing `PurchaseController` and `PurchaseService` rather than creating new modules
- All frontend components are standalone Angular components
- fast-check is used for property-based testing with minimum 100 iterations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "4.1"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "5.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "5.2", "5.3", "5.4", "6.1"] },
    { "id": 3, "tasks": ["2.5", "2.6", "6.2", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "7.5"] },
    { "id": 6, "tasks": ["7.6", "7.7", "7.8", "9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["9.3"] }
  ]
}
```
