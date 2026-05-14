# Requirements Document

## Introduction

This feature adds search and filter capabilities to the existing Accounting Cheque Voucher listing endpoint. Currently, cheque vouchers can only be filtered by date range. This enhancement allows users to search/filter cheque vouchers by invoice number, particulars text, and cheque number, enabling faster lookup of specific vouchers without manually scrolling through results.

## Glossary

- **Search_Filter_API**: The enhanced `GET /accounting/cheque-vouchers` endpoint that accepts additional query parameters for filtering cheque vouchers by invoice number, particulars, and cheque number.
- **Cheque_Voucher**: A financial document record stored in `tblcheque_vouchers` representing a payment disbursement with associated deposits, invoices, and account titles.
- **Invoice_Filter**: A text-based search parameter that matches against the `invoice_no` field in the `tblcheque_voucher_invoices` child table.
- **Particulars_Filter**: A text-based search parameter that matches against the `particulars` field in the `tblcheque_vouchers` table.
- **Cheque_No_Filter**: A text-based search parameter that matches against the `cheque_no` field in the `tblcheque_voucher_deposits` child table.

## Requirements

### Requirement 1: Filter Cheque Vouchers by Invoice Number

**User Story:** As an accountant, I want to filter cheque vouchers by invoice number, so that I can quickly find the voucher associated with a specific invoice.

#### Acceptance Criteria

1. WHEN an `invoice` query parameter is provided with one or more non-whitespace characters, THE Search_Filter_API SHALL return only Cheque_Voucher records that have at least one associated invoice with an `invoice_no` containing the provided text (case-insensitive partial match), applying the filter in combination with any other active filters (e.g., `dateFrom`, `dateTo`).
2. WHEN an `invoice` query parameter is provided as an empty string or a string containing only whitespace characters, THE Search_Filter_API SHALL treat the parameter as not provided and return all vouchers matching other active filters.
3. WHEN an `invoice` query parameter is provided and no Cheque_Voucher records match, THE Search_Filter_API SHALL return an empty array in the data field with a success response.
4. IF the `invoice` query parameter exceeds 100 characters in length, THEN THE Search_Filter_API SHALL ignore characters beyond the 100-character limit and apply the filter using only the first 100 characters.

### Requirement 2: Filter Cheque Vouchers by Particulars

**User Story:** As an accountant, I want to filter cheque vouchers by particulars text, so that I can locate vouchers based on their description or notes.

#### Acceptance Criteria

1. WHEN a `particulars` query parameter is provided with at least one non-whitespace character, THE Search_Filter_API SHALL return only Cheque_Voucher records where the `particulars` field contains the provided text as a case-insensitive substring match, excluding records where the `particulars` field is NULL.
2. WHEN a `particulars` query parameter is provided as an empty string or contains only whitespace characters, THE Search_Filter_API SHALL treat the parameter as not provided and return all vouchers matching other active filters.
3. WHEN a `particulars` query parameter is provided and no Cheque_Voucher records match, THE Search_Filter_API SHALL return an empty array with a success response.
4. WHEN a `particulars` query parameter is provided alongside `dateFrom` and/or `dateTo` filters, THE Search_Filter_API SHALL apply all provided filters together using AND logic, returning only records that satisfy every active filter.
5. IF a `particulars` query parameter exceeds 500 characters in length, THEN THE Search_Filter_API SHALL reject the request with an error response indicating the parameter exceeds the maximum allowed length.

### Requirement 3: Filter Cheque Vouchers by Cheque Number

**User Story:** As an accountant, I want to filter cheque vouchers by cheque number, so that I can trace a specific cheque back to its voucher record.

#### Acceptance Criteria

1. WHEN a `chequeNo` query parameter is provided with one or more non-whitespace characters, THE Search_Filter_API SHALL return only Cheque_Voucher records that have at least one associated deposit with a `cheque_no` containing the provided text as a case-insensitive substring match.
2. WHEN a `chequeNo` query parameter is provided as an empty string or a string containing only whitespace characters, THE Search_Filter_API SHALL treat the parameter as not provided and return all vouchers matching other active filters.
3. WHEN a `chequeNo` query parameter is provided and no Cheque_Voucher records match, THE Search_Filter_API SHALL return an empty array within a success response object.
4. WHEN a `chequeNo` query parameter is provided alongside `dateFrom` and/or `dateTo` query parameters, THE Search_Filter_API SHALL apply all provided filters in combination (logical AND), returning only records that satisfy every active filter simultaneously.
5. IF a `chequeNo` query parameter exceeds 50 characters in length, THEN THE Search_Filter_API SHALL reject the request with an error response indicating the cheque number filter value is too long.

### Requirement 4: Combine Multiple Search Filters

**User Story:** As an accountant, I want to use multiple search filters simultaneously, so that I can narrow down results more precisely.

#### Acceptance Criteria

1. WHEN any combination of two or more filter parameters (`invoice`, `particulars`, `chequeNo`) are provided with non-empty values, THE Search_Filter_API SHALL return only Cheque_Voucher records that satisfy ALL provided non-empty filters simultaneously (AND logic), treating any empty-string parameter as not provided.
2. WHEN one or more text filter parameters are provided along with `dateFrom` and/or `dateTo` parameters, THE Search_Filter_API SHALL apply the date range filter in conjunction with the text search filters (AND logic), using the default date range (first day of current month to today) for any date boundary not explicitly provided.
3. WHEN all filter parameters are provided and no Cheque_Voucher records satisfy all conditions, THE Search_Filter_API SHALL return an empty array with a success response.
4. WHEN a request includes multiple filter parameters where some have non-empty values and others are empty strings, THE Search_Filter_API SHALL apply only the filters with non-empty values and ignore the empty-string parameters.

### Requirement 5: Maintain Existing Response Structure

**User Story:** As a frontend developer, I want the filtered results to maintain the same response structure as the existing endpoint, so that no frontend changes are needed beyond adding filter inputs.

#### Acceptance Criteria

1. THE Search_Filter_API SHALL return each matching Cheque_Voucher with all of its associated deposits, invoices, and account titles regardless of which filter caused the voucher to match, preserving sub-array ordering by record insertion order (id ASC) for deposits, invoices, and account titles within each voucher.
2. THE Search_Filter_API SHALL maintain the existing sort order (voucher_date DESC, id DESC) for filtered results.
3. IF no `dateFrom` and no `dateTo` parameters are provided, THEN THE Search_Filter_API SHALL apply the default date range (first day of current month to today) to the results, even when search filter parameters are active. IF only `dateFrom` is provided without `dateTo`, THEN THE Search_Filter_API SHALL leave the end date unbounded (no upper date limit). IF only `dateTo` is provided without `dateFrom`, THEN THE Search_Filter_API SHALL leave the start date unbounded (no lower date limit).
4. THE Search_Filter_API SHALL wrap filtered results in the same response envelope as the existing endpoint: an object containing a `success` boolean field and a `data` field holding the array of Cheque_Voucher objects, returning an empty array in `data` when no vouchers match the applied filters.
5. THE Search_Filter_API SHALL return each Cheque_Voucher object with the identical set of fields as the existing endpoint (cvNo, voucherType, payee, voucherDate, tinNumber, address, zipCode, particulars, releasedAt, preparedBy, deposits, invoices, accountTitles) using the same field names and data types.
