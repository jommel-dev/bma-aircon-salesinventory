# Implementation Plan: Accounting Pagination & E-Signature

## Overview

This plan implements two enhancements to the Accounting Module: (1) server-side pagination for all accounting report list endpoints with a standardized response envelope, and (2) e-signature upload, storage, and rendering on the BIR 2307 tax form PDF. Tasks are ordered to build shared infrastructure first, then apply pagination to each endpoint, then implement the e-signature feature, and finally wire everything together in the frontend.

## Tasks

- [x] 1. Set up shared pagination types and backend helper methods
  - [x] 1.1 Create shared pagination types file
    - Create `backend/src/shared/pagination.types.ts` with `PaginationParams`, `PaginationMeta`, and `PaginatedResponse<T>` interfaces
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Add pagination helper methods to AccountingService
    - Implement `parsePaginationParams(pageInput, pageSizeInput, defaults)` method that parses, validates, and clamps page/pageSize values
    - Implement `buildPaginationMeta(total, page, pageSize)` method that calculates totalPages
    - _Requirements: 1.2, 1.5, 1.6_

  - [ ]* 1.3 Write property tests for pagination helpers
    - **Property 2: Pagination Metadata Correctness** — verify totalPages = Math.ceil(T/S) when T > 0, 0 when T = 0
    - **Property 3: PageSize Clamping** — verify effective pageSize = Math.max(1, Math.min(maxPageSize, V))
    - **Validates: Requirements 1.3, 1.4, 1.5, 7.5**

- [x] 2. Implement paginated cheque voucher listing
  - [x] 2.1 Refactor AccountingService.listChequeVouchers to support pagination
    - Add `page` and `pageSize` parameters to the method signature
    - Execute COUNT(*) query for total matching vouchers before applying LIMIT/OFFSET
    - Apply LIMIT/OFFSET to parent voucher query, fetch child records (deposits, invoices, account titles) for paginated parent IDs only
    - Return `PaginatedResponse` envelope with data and meta
    - Use maxPageSize of 100 and default pageSize of 20 for this endpoint
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 2.2 Update AccountingController.listChequeVouchers endpoint
    - Add `@Query('page')` and `@Query('pageSize')` parameters
    - Validate page/pageSize: return 400 error for non-numeric or out-of-range values (per Requirement 2.3)
    - Pass pagination params to service and return standardized response
    - _Requirements: 2.2, 2.3_

  - [ ]* 2.3 Write property test for cheque voucher pagination slice
    - **Property 1: Pagination Slice Correctness** — verify returned data corresponds to correct offset/limit in deterministic order
    - **Property 4: Deterministic Sort Order Across Pages** — verify last item on page P precedes first item on page P+1
    - **Validates: Requirements 1.1, 1.7, 1.8, 2.1**

- [x] 3. Implement paginated general journal listing
  - [x] 3.1 Refactor AccountingService.listGeneralJournals to support pagination
    - Add `page` and `pageSize` parameters
    - Execute COUNT(*) for total, apply LIMIT/OFFSET to parent journals query
    - Fetch sundry lines for paginated journal IDs only
    - Return `PaginatedResponse` envelope
    - Default date range to current month when no date params provided
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Update AccountingController.listGeneralJournals endpoint
    - Add `@Query('page')` and `@Query('pageSize')` parameters
    - Pass pagination params to service, return standardized response
    - _Requirements: 3.1_

  - [ ]* 3.3 Write property test for general journal pagination
    - **Property 5: Date Filter Applied Before Pagination** — verify all returned records have dates within the filter range
    - **Validates: Requirements 3.2**

- [x] 4. Implement paginated sales register
  - [x] 4.1 Create AccountingService.getSalesRegister method with pagination
    - Query sales orders with status "remitted" or "completed" and non-null release date
    - Apply date range filter on release_date when dateFrom/dateTo provided
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Add AccountingController.getSalesRegister endpoint
    - Create `@Get('sales-register')` endpoint with page, pageSize, dateFrom, dateTo query params
    - Parse and pass pagination params to service
    - _Requirements: 4.1, 4.2_

  - [ ]* 4.3 Write property test for sales register status invariant
    - **Property 6: Sales Register Status Invariant** — verify every record has status "remitted" or "completed" and non-null release date
    - **Validates: Requirements 4.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement paginated 2307 tax report
  - [x] 6.1 Create AccountingService.getTax2307Report method with pagination
    - Derive 2307 data from released cheque vouchers with account titles containing "expanded withholding tax" or "2307" (case-insensitive)
    - Apply date range filter on voucher_date when dateFrom/dateTo provided
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.2 Add AccountingController.getTax2307Report endpoint
    - Create `@Get('tax-2307-report')` endpoint with page, pageSize, dateFrom, dateTo query params
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.3 Write property test for 2307 data derivation
    - **Property 7: 2307 Data Derivation** — verify each record corresponds to a released cheque voucher with matching account title description
    - **Validates: Requirements 5.5**

- [x] 7. Implement paginated disbursement register
  - [x] 7.1 Create AccountingService.getDisbursementRegister method with pagination
    - Query released cheque vouchers sorted by voucher_date descending
    - Default date range to current month when no date params provided
    - Apply date range filter before pagination
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.2 Add AccountingController.getDisbursementRegister endpoint
    - Create `@Get('disbursement-register')` endpoint with page, pageSize, dateFrom, dateTo query params
    - _Requirements: 6.1_

- [x] 8. Implement paginated weekly sales, daily unit released, and low stocks
  - [x] 8.1 Create AccountingService.getWeeklySales method with pagination
    - Aggregate weekly sales from remitted/completed sales orders
    - Apply date range filter when dateFrom/dateTo provided
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [x] 8.2 Create AccountingService.getDailyUnitReleased method with pagination
    - Aggregate daily unit released from remitted/completed sales orders
    - Apply date range filter when dateFrom/dateTo provided
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 7.2, 7.4, 7.5, 7.6_

  - [x] 8.3 Create AccountingService.getLowStocks method with pagination
    - Query materials where on_hand_stock <= reorder_level
    - No date filtering for this endpoint
    - Execute COUNT(*) for total, apply LIMIT/OFFSET
    - Return `PaginatedResponse` envelope
    - _Requirements: 7.3, 7.4, 7.5, 7.7_

  - [x] 8.4 Add AccountingController endpoints for weekly sales, daily unit released, and low stocks
    - Create `@Get('weekly-sales')`, `@Get('daily-unit-released')`, `@Get('low-stocks')` endpoints
    - Each accepts page, pageSize query params; weekly-sales and daily-unit-released also accept dateFrom, dateTo
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 9. Checkpoint - Ensure all backend pagination tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement frontend pagination controls
  - [x] 10.1 Add pagination state and UI controls to AccountingComponent
    - Define `PaginationState` interface with page, pageSize, total, totalPages
    - Add per-report pagination state properties (chequeVoucherPagination, generalJournalPagination, etc.)
    - Add `pageSizeOptions = [10, 25, 50, 100]` array
    - Implement `onPageChange(report, page)` and `onPageSizeChange(report, pageSize)` methods
    - Reset page to 1 when filters change
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 10.2 Update frontend API calls to include pagination params
    - Modify all accounting report fetch methods to send `page` and `pageSize` query params
    - Parse `PaginatedResponse` envelope from API responses and update pagination state
    - Show loading indicator during requests with 30-second timeout
    - On failure or timeout, display error message and retain previous data
    - _Requirements: 8.3, 8.4_

  - [x] 10.3 Add pagination controls to accounting report HTML template
    - Add pagination navigation (first, previous, next, last buttons) below each report table
    - Add page size selector dropdown
    - Disable first/previous when on page 1; disable next/last when on last page
    - Hide pagination controls and show empty-state message when total is 0
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

  - [ ]* 10.4 Write unit tests for frontend pagination button state logic
    - **Property 8: Frontend Pagination Button State** — verify button disabled states based on page and totalPages
    - **Validates: Requirements 8.5, 8.6**

- [x] 11. Implement e-signature settings backend extension
  - [x] 11.1 Extend normalizeReportPrintSettings for signatory fields
    - Add handling for `signatoryName` (max 200 chars), `signatoryTitle` (max 200 chars), `signatoryTin` (max 20 chars), `signatoryImage` (max 500000 chars, valid base64 or empty string)
    - Trim whitespace from text fields, truncate to max lengths
    - Default missing fields to empty strings
    - Validate signatoryImage is valid base64 or default to empty string
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 11.2 Write property tests for signatory settings normalization
    - **Property 10: Signatory Settings Round-Trip** — verify save/load returns trimmed and truncated values
    - **Property 14: Settings Normalization** — verify whitespace trimming, truncation, and base64 validation
    - **Validates: Requirements 9.2, 9.3, 12.1, 12.2, 12.3, 12.4**

- [x] 12. Implement e-signature upload UI in 2307 print settings
  - [x] 12.1 Add signatory configuration section to 2307 print settings dialog
    - Add input fields for printed name (max 120 chars), title/designation (max 80 chars), TIN (max 17 chars, XXX-XXX-XXX-XXX format)
    - Add image upload area accepting PNG/JPEG, max 2 MB, dimensions 100×50 to 600×300 pixels
    - Display image preview on successful upload
    - Show validation error messages for invalid files (wrong format, too large, wrong dimensions)
    - Add remove button to clear uploaded signature
    - _Requirements: 9.1, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 12.2 Wire signatory settings save/load with Print_Settings_Service
    - On save, include signatory fields (signatoryName, signatoryTitle, signatoryTin, signatoryImage as base64) in settings payload
    - On load, populate signatory fields from stored settings
    - Fall back to localStorage when API is unreachable
    - Display confirmation notice on save success or fallback notice
    - _Requirements: 9.2, 9.4, 10.6, 10.7_

  - [ ]* 12.3 Write unit tests for file validation logic
    - **Property 9: E-Signature File Validation** — verify acceptance/rejection based on content type, file size, and dimensions
    - **Validates: Requirements 9.1, 9.5, 9.6, 9.7**

- [ ] 13. Implement signatory block rendering on 2307 PDF
  - [x] 13.1 Implement renderSignatoryBlock method in Tax2307 PDF generator
    - Check if any signatory field is non-empty; if all empty, omit the block
    - Render declaration text: "I declare, under the penalties of perjury..."
    - If signatoryImage is valid base64 PNG/JPEG, embed image scaled to fit within 150×60 pixels preserving aspect ratio
    - Render printed name below signature image area
    - Render label "Signature over Printed Name of Payor/Payor's Authorized Representative/Tax Agent"
    - Render title/designation and TIN on next line
    - Render subtitle "(Indicate Title/Designation and TIN)"
    - Use font size 8-10pt consistent with form overlay text
    - If image is invalid, render block without image
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11_

  - [ ]* 13.2 Write property tests for signatory block rendering
    - **Property 11: Signatory Block Rendering Presence** — verify block renders when at least one field is non-empty
    - **Property 12: Signatory Block Omission** — verify block is omitted when all fields are empty
    - **Property 13: Signature Image Aspect-Ratio Scaling** — verify scaled dimensions fit within 150×60 preserving aspect ratio
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6, 11.8**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses TypeScript (NestJS) and the frontend uses Angular (TypeScript)
- pdf-lib is used for client-side PDF generation
- Pagination applies to parent records only; child records are fetched for paginated parent IDs

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.1", "4.1", "6.1", "7.1", "8.1", "8.2", "8.3", "11.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "4.2", "6.2", "7.2", "8.4", "11.2"] },
    { "id": 4, "tasks": ["2.3", "3.3", "4.3", "6.3", "10.1", "12.1"] },
    { "id": 5, "tasks": ["10.2", "10.3", "12.2"] },
    { "id": 6, "tasks": ["10.4", "12.3", "13.1"] },
    { "id": 7, "tasks": ["13.2"] }
  ]
}
```
