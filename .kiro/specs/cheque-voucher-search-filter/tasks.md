# Implementation Plan: Cheque Voucher Search Filter

## Overview

This plan implements text-based search filters (invoice number, particulars, cheque number) on the existing `GET /accounting/cheque-vouchers` endpoint. The approach modifies the controller to accept new query parameters, adds input validation/normalization in the service, and enhances the SQL query with conditional `ILIKE` and `EXISTS` subquery clauses. The existing response structure and date-range behavior are preserved.

## Tasks

- [x] 1. Add filter parameters to controller and service interface
  - [x] 1.1 Extend `listChequeVouchers` in `AccountingController` to accept `invoice`, `particulars`, and `chequeNo` query parameters and pass them to the service
    - Add `@Query('invoice') invoice?: string`, `@Query('particulars') particulars?: string`, `@Query('chequeNo') chequeNo?: string` parameters
    - Pass all parameters to `this.accountingService.listChequeVouchers({ dateFrom, dateTo, invoice, particulars, chequeNo })`
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 1.2 Update `AccountingService.listChequeVouchers` method signature to accept the new filter parameters
    - Change `filters` parameter type to include `invoice?: string`, `particulars?: string`, `chequeNo?: string`
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Implement input validation and normalization
  - [x] 2.1 Create a private `normalizeTextFilter` helper method in `AccountingService`
    - Accepts `value: unknown` and `maxLength: number` and `mode: 'truncate' | 'reject'`
    - Trims whitespace; returns `null` if result is empty
    - In `truncate` mode: returns first `maxLength` characters if input exceeds limit
    - In `reject` mode: throws `BadRequestException` if trimmed length exceeds `maxLength`
    - _Requirements: 1.2, 1.4, 2.2, 2.5, 3.2, 3.5_

  - [x] 2.2 Add validation calls at the start of `listChequeVouchers` for each filter parameter
    - `invoice`: normalize with `maxLength=100`, mode `truncate`
    - `particulars`: normalize with `maxLength=500`, mode `reject` (error message: "Particulars filter exceeds maximum length of 500 characters")
    - `chequeNo`: normalize with `maxLength=50`, mode `reject` (error message: "Cheque number filter exceeds maximum length of 50 characters")
    - _Requirements: 1.4, 2.5, 3.5, 4.4_

  - [ ]* 2.3 Write unit tests for `normalizeTextFilter` helper
    - Test empty string returns null
    - Test whitespace-only returns null
    - Test truncation mode trims to maxLength
    - Test reject mode throws BadRequestException when exceeding limit
    - Test normal values pass through trimmed
    - _Requirements: 1.2, 1.4, 2.2, 2.5, 3.2, 3.5_

- [x] 3. Implement dynamic SQL query with filter conditions
  - [x] 3.1 Create a private `buildChequeVoucherFilterQuery` method that constructs the parameterized SQL
    - Accept normalized filter values (null means filter not active)
    - Build base SELECT with existing date range conditions
    - Append `ILIKE` condition on `particulars` column when particulars filter is active
    - Append `EXISTS` subquery on `tblcheque_voucher_invoices` when invoice filter is active
    - Append `EXISTS` subquery on `tblcheque_voucher_deposits` when chequeNo filter is active
    - Use parameterized queries with `$N::text IS NULL OR ...` pattern for short-circuit evaluation
    - Maintain `ORDER BY voucher_date DESC, id DESC`
    - _Requirements: 1.1, 2.1, 2.4, 3.1, 3.4, 4.1, 4.2, 5.2_

  - [x] 3.2 Replace the existing static SQL query in `listChequeVouchers` with the dynamic query builder call
    - Pass normalized filter values to `buildChequeVoucherFilterQuery`
    - Use returned `{ text, params }` in `this.db.query()`
    - Preserve existing child-record fetching logic (deposits, invoices, accountTitles) unchanged
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [x] 4. Checkpoint - Verify core implementation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Property-based and integration tests
  - [ ]* 5.1 Write property test for text filter correctness (Property 1)
    - **Property 1: Text filter correctness**
    - Generate arbitrary voucher data with associated invoices and deposits
    - For each filter type, verify every returned voucher satisfies the filter condition (case-insensitive partial match)
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.1, 2.1, 3.1**

  - [ ]* 5.2 Write property test for whitespace normalization (Property 2)
    - **Property 2: Whitespace normalization**
    - Generate whitespace-only filter values (spaces, tabs, newlines)
    - Verify result set is identical to when filter is absent
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.2, 2.2, 3.2, 4.4**

  - [ ]* 5.3 Write property test for combined AND logic (Property 3)
    - **Property 3: Combined AND logic**
    - Generate multiple active filters simultaneously
    - Verify result set equals intersection of individual filter results
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 4.1, 4.2, 2.4, 3.4**

  - [ ]* 5.4 Write property test for input length enforcement (Property 4)
    - **Property 4: Input length enforcement**
    - Generate strings exceeding max lengths for each filter
    - Verify `particulars` > 500 chars throws BadRequestException
    - Verify `chequeNo` > 50 chars throws BadRequestException
    - Verify `invoice` > 100 chars uses only first 100 characters
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.4, 2.5, 3.5**

  - [ ]* 5.5 Write property test for sort order preservation (Property 6)
    - **Property 6: Sort order preservation**
    - Generate filtered result sets with multiple vouchers
    - Verify ordering is by voucherDate DESC, then id DESC
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 5.2**

  - [ ]* 5.6 Write unit tests for the endpoint integration
    - Test combined filters with date range return correct results
    - Test empty result returns `{ success: true, data: [] }`
    - Test response envelope structure is preserved
    - Test default date range is applied when no dates provided with search filters active
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation modifies only `accounting.controller.ts` and `accounting.service.ts` — no new modules or database migrations required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] }
  ]
}
```
