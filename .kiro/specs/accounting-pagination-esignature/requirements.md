# Requirements Document

## Introduction

This feature adds two capabilities to the Accounting Module of the Bagama HVAC application:

1. **Server-Side Pagination** — All accounting report tables (cheque vouchers, general journals, sales register, 2307 report, disbursement register, weekly sales, daily unit released, low stocks) currently load all matching records at once. This feature introduces server-side pagination with `page` and `pageSize` query parameters to reduce payload size, improve load times, and support large datasets.

2. **E-Signature Support for 2307 Tax Form** — The 2307 PDF generation currently has no signatory section. This feature allows users to upload an e-signature image in the 2307 print settings and renders a BIR-compliant signatory block on the generated PDF, including the signature image, printed name, title/designation, and TIN.

## Glossary

- **Pagination_API**: The backend REST endpoint layer that accepts `page` and `pageSize` query parameters and returns a paginated response envelope containing rows, total count, current page, page size, and total pages.
- **Accounting_Table_Component**: The Angular frontend component responsible for rendering accounting report data in tabular form with pagination controls.
- **E_Signature_Image**: A PNG or JPEG image file representing a user's handwritten signature, uploaded and stored for use in PDF generation.
- **Tax2307_PDF_Generator**: The client-side module using pdf-lib that overlays data onto the BIR 2307 form template to produce a completed PDF.
- **Signatory_Block**: The section at the bottom of the 2307 PDF form displaying the declaration text, e-signature image, printed name, title/designation, and TIN of the payor's authorized representative.
- **Print_Settings_Service**: The backend service managing report print settings stored in `tblaccounting_report_print_settings` as JSONB.
- **Paginated_Response**: A standardized JSON envelope with shape `{ data: T[], meta: { page, pageSize, total, totalPages } }`.

## Requirements

### Requirement 1: Paginated API Endpoints

**User Story:** As an accounting staff member, I want the accounting report endpoints to return paginated results, so that the application loads faster and handles large datasets without browser performance degradation.

#### Acceptance Criteria

1. WHEN a client sends a GET request to any accounting list endpoint with `page` and `pageSize` query parameters, THE Pagination_API SHALL return a Paginated_Response containing only the rows for the requested page, where `page` is an integer greater than or equal to 1 and `pageSize` is an integer between 1 and 200 inclusive.
2. WHEN a client sends a GET request without `page` or `pageSize` parameters, THE Pagination_API SHALL default to page 1 with a pageSize of 25.
3. THE Pagination_API SHALL include a `meta` object in the response containing `page` (current page number), `pageSize` (items per page), `total` (total matching row count), and `totalPages` (calculated ceiling of total divided by pageSize).
4. WHEN `page` exceeds the total number of available pages, THE Pagination_API SHALL return an empty `data` array with the correct `meta.total` count.
5. IF `pageSize` is less than 1 or greater than 200, THEN THE Pagination_API SHALL clamp the value to the nearest boundary (minimum 1, maximum 200).
6. IF `page` or `pageSize` is provided as a non-numeric or non-integer value, THEN THE Pagination_API SHALL treat the invalid parameter as absent and apply the default value (page 1 or pageSize 25 respectively).
7. THE Pagination_API SHALL apply pagination after all existing filters (date range, search text) have been applied, and SHALL return rows in a deterministic order consistent across successive page requests for the same filter criteria.
8. THE Pagination_API SHALL return the total count reflecting all rows matching the current filter criteria and the `data` array containing at most `pageSize` rows offset by (`page` - 1) multiplied by `pageSize`.

### Requirement 2: Paginated Cheque Voucher Listing

**User Story:** As an accounting staff member, I want the cheque voucher list to load one page at a time, so that I can browse large volumes of vouchers without waiting for all records to load.

#### Acceptance Criteria

1. WHEN a client requests `/accounting/cheque-vouchers` with `page` and `pageSize` query parameters, THE Pagination_API SHALL return cheque vouchers sorted by `voucher_date` descending then `id` descending, limited to the requested page, in a Paginated_Response containing a `data` array (with associated deposits, invoices, and account titles for each voucher) and a `meta` object with `total` (total matching row count), `page` (current page number), `pageSize` (items per page), and `totalPages` (ceiling of total divided by pageSize).
2. THE Pagination_API SHALL accept `page` as an integer with a minimum value of 1 (defaulting to 1 if omitted) and `pageSize` as an integer between 1 and 100 inclusive (defaulting to 20 if omitted), while preserving existing filter parameters (`dateFrom`, `dateTo`, `invoice`, `particulars`, `chequeNo`) alongside the pagination parameters.
3. IF `page` or `pageSize` is provided but is non-numeric or outside its allowed range, THEN THE Pagination_API SHALL return an error response indicating the invalid parameter without processing the query.
4. WHEN filters reduce the result set to zero rows, THE Pagination_API SHALL return `data: []` with `meta.total: 0`, `meta.page: 1`, `meta.pageSize` set to the requested page size, and `meta.totalPages: 0`.

### Requirement 3: Paginated General Journal Listing

**User Story:** As an accounting staff member, I want the general journal list to load one page at a time, so that I can efficiently navigate through journal entries.

#### Acceptance Criteria

1. WHEN a client requests `/accounting/general-journals` with `page` and `pageSize` parameters, THE Pagination_API SHALL return general journals in a Paginated_Response with associated sundry lines for only the current page, ordered by journal date descending then by record ID descending.
2. THE Pagination_API SHALL preserve existing filter parameters (`dateFrom`, `dateTo`) alongside the new pagination parameters, applying date filters before pagination.
3. WHEN no `dateFrom` or `dateTo` filter parameters are provided, THE Pagination_API SHALL default the date range to the first day of the current month through the current date.
4. WHEN filters reduce the result set to zero rows, THE Pagination_API SHALL return an empty `data` array with `meta.total` set to 0 and `meta.totalPages` set to 1.

### Requirement 4: Paginated Sales Register

**User Story:** As an accounting staff member, I want the sales register to load paginated data from the server, so that I do not need to download all remitted sales orders at once.

#### Acceptance Criteria

1. WHEN a client requests sales register data with `page` and `pageSize` parameters, THE Pagination_API SHALL return only the sales orders for the requested page along with a metadata object containing `page` (current page number), `pageSize` (items per page), `total` (total matching record count), and `totalPages` (total number of pages).
2. IF the `page` parameter is less than 1 or non-numeric, THEN THE Pagination_API SHALL default to page 1. IF the `pageSize` parameter is less than 1 or non-numeric, THEN THE Pagination_API SHALL default to 25. THE Pagination_API SHALL cap `pageSize` to a maximum of 200 items per page.
3. IF `dateFrom` and `dateTo` parameters are provided, THEN THE Pagination_API SHALL filter sales orders to only those with a release date within the specified inclusive date range, applied server-side before pagination. IF neither `dateFrom` nor `dateTo` is provided, THEN THE Pagination_API SHALL return results without date filtering.
4. THE Pagination_API SHALL include only sales orders with a status of "remitted" or "completed" and a non-null release date.
5. IF the requested `page` exceeds `totalPages`, THEN THE Pagination_API SHALL return an empty data array with the metadata reflecting the actual total count and total pages.

### Requirement 5: Paginated 2307 Tax Report

**User Story:** As an accounting staff member, I want the 2307 tax report data to load in pages, so that large volumes of withholding tax records do not overwhelm the browser.

#### Acceptance Criteria

1. WHEN a client requests 2307 report data with `page` and `pageSize` parameters, THE Pagination_API SHALL return only the 2307 records for the requested page in a Paginated_Response containing the records array, `total` of all matching records, `totalPages`, current `page`, and current `pageSize`.
2. THE Pagination_API SHALL accept `pageSize` values between 1 and 200, and SHALL default to a `pageSize` of 25 and a `page` of 1 when the parameters are omitted.
3. WHEN a client provides `dateFrom` and `dateTo` parameters in ISO 8601 date format (YYYY-MM-DD), THE Pagination_API SHALL filter 2307 records to only those with a voucher date within the specified inclusive date range, applied server-side before pagination.
4. IF the requested `page` exceeds the available `totalPages`, THEN THE Pagination_API SHALL return an empty records array with the correct `total` and `totalPages` values.
5. THE Pagination_API SHALL derive 2307 data from released cheque vouchers containing account titles with "expanded withholding tax" or "2307" in the description (case-insensitive match).

### Requirement 6: Paginated Disbursement Register

**User Story:** As an accounting staff member, I want the disbursement register to load paginated data from the server, so that monthly reports with many entries remain performant.

#### Acceptance Criteria

1. WHEN a client requests disbursement register data with `page` (minimum 1) and `pageSize` (1 to 200, default 25) parameters, THE Pagination_API SHALL return only the disbursement records for the requested page in a Paginated_Response containing the records array, the current `page` number, the `pageSize`, `total` of records matching the applied filters, and `totalPages`.
2. WHEN a client provides `dateFrom` and `dateTo` parameters in ISO 8601 date format (YYYY-MM-DD), THE Pagination_API SHALL filter disbursement records to only those with a voucher date within the inclusive date range before applying pagination, and SHALL sort results by voucher date in descending order.
3. IF the client provides a `page` value that exceeds the available pages for the current result set, THEN THE Pagination_API SHALL return an empty records array with the correct `total` reflecting the filtered data.
4. IF the client omits both `dateFrom` and `dateTo` parameters, THEN THE Pagination_API SHALL default the date range to the first and last day of the current month before applying pagination.

### Requirement 7: Paginated Weekly Sales, Daily Unit Released, and Low Stocks Reports

**User Story:** As an accounting staff member, I want the weekly sales, daily unit released, and low stocks reports to load paginated data, so that all accounting tables have consistent pagination behavior.

#### Acceptance Criteria

1. WHEN a client requests weekly sales data with `page` and `pageSize` parameters, THE Pagination_API SHALL return a Paginated_Response containing a `data` array of weekly sales rows and a `meta` object with `page`, `pageSize`, `total`, and `totalPages` fields.
2. WHEN a client requests daily unit released data with `page` and `pageSize` parameters, THE Pagination_API SHALL return a Paginated_Response containing a `data` array of daily unit released rows and a `meta` object with `page`, `pageSize`, `total`, and `totalPages` fields.
3. WHEN a client requests low stocks report data with `page` and `pageSize` parameters, THE Pagination_API SHALL return a Paginated_Response containing a `data` array of low stock rows and a `meta` object with `page`, `pageSize`, `total`, and `totalPages` fields.
4. IF the `page` or `pageSize` parameter is missing from the request, THEN THE Pagination_API SHALL default `page` to 1 and `pageSize` to 25.
5. IF the `page` parameter is less than 1 or the `pageSize` parameter is outside the range of 1 to 200, THEN THE Pagination_API SHALL clamp the value to the nearest boundary.
6. WHEN a client requests weekly sales or daily unit released data with `dateFrom` and `dateTo` parameters, THE Pagination_API SHALL filter results to include only records within the specified date range before applying pagination.
7. THE Pagination_API SHALL NOT apply date range filtering to the low stocks report, as it reflects current inventory state.

### Requirement 8: Frontend Pagination Controls

**User Story:** As an accounting staff member, I want pagination controls (page navigation, page size selector) on all accounting tables, so that I can navigate between pages and choose how many rows to display.

#### Acceptance Criteria

1. THE Accounting_Table_Component SHALL display pagination controls below each accounting report table showing current page, total pages, total record count, and navigation buttons (first, previous, next, last).
2. THE Accounting_Table_Component SHALL provide a page size selector with options 10, 25, 50, and 100, defaulting to 25 on initial load.
3. WHEN the user changes the page or page size, THE Accounting_Table_Component SHALL send a new request to the Pagination_API with the updated parameters and display a loading indicator until the response arrives or until 30 seconds have elapsed, whichever comes first.
4. IF the Pagination_API request fails or the 30-second timeout elapses, THEN THE Accounting_Table_Component SHALL hide the loading indicator, display an error message indicating the data could not be loaded, and retain the previously displayed page data unchanged.
5. WHEN the user applies or changes a filter, THE Accounting_Table_Component SHALL reset the current page to 1 and fetch the first page of filtered results.
6. WHILE the current page is the first page, THE Accounting_Table_Component SHALL disable the first and previous navigation buttons; WHILE the current page is the last page, THE Accounting_Table_Component SHALL disable the next and last navigation buttons.
7. IF the Paginated_Response returns a total record count of 0, THEN THE Accounting_Table_Component SHALL hide the pagination controls and display an empty-state message indicating no records match the current filters.

### Requirement 9: E-Signature Upload in 2307 Print Settings

**User Story:** As an accounting staff member, I want to upload an e-signature image in the 2307 print settings, so that the signature can be rendered on generated 2307 PDF forms.

#### Acceptance Criteria

1. THE Print_Settings_Service SHALL accept an E_Signature_Image upload (PNG or JPEG, maximum 2 MB, minimum dimensions 100×50 pixels, maximum dimensions 600×300 pixels) as part of the 2307 print settings configuration.
2. WHEN a user uploads an E_Signature_Image, THE Print_Settings_Service SHALL store the image as a base64-encoded string within the `settings_json` JSONB field of the `tblaccounting_report_print_settings` table for the `tax-2307-report` report key.
3. THE Print_Settings_Service SHALL store signatory metadata alongside the E_Signature_Image in the settings JSON, consisting of: printed name (maximum 120 characters), title/designation (maximum 120 characters), and TIN (maximum 20 characters).
4. WHEN a user removes the E_Signature_Image, THE Print_Settings_Service SHALL clear the stored image data and the Signatory_Block SHALL not render on subsequent PDF generations.
5. IF the uploaded file is not a valid PNG or JPEG image (determined by file content-type header and file magic bytes), THEN THE Print_Settings_Service SHALL reject the upload with an error message indicating the accepted formats are PNG and JPEG only.
6. IF the uploaded file exceeds 2 MB, THEN THE Print_Settings_Service SHALL reject the upload with an error message indicating the maximum allowed file size is 2 MB.
7. IF the uploaded image dimensions are below 100×50 pixels or exceed 600×300 pixels, THEN THE Print_Settings_Service SHALL reject the upload with an error message indicating the allowed dimension range.

### Requirement 10: 2307 Print Settings UI for Signatory Configuration

**User Story:** As an accounting staff member, I want a signatory configuration section in the 2307 print settings dialog, so that I can enter the printed name, title/designation, TIN, and upload the e-signature image.

#### Acceptance Criteria

1. THE Accounting_Table_Component SHALL display a "Signatory" section within the 2307 print settings dialog containing input fields for printed name (maximum 120 characters), title/designation (maximum 80 characters), and TIN (maximum 17 characters in XXX-XXX-XXX-XXX format).
2. THE Accounting_Table_Component SHALL display an image upload area in the signatory section that accepts PNG or JPEG files with a maximum file size of 2 MB and minimum image dimensions of 50×50 pixels.
3. WHEN an E_Signature_Image file is uploaded that meets the accepted format (PNG or JPEG) and size constraints (at most 2 MB), THE Accounting_Table_Component SHALL display a preview of the uploaded signature image within the signatory section.
4. IF the user uploads a file that is not PNG or JPEG, or exceeds 2 MB, THEN THE Accounting_Table_Component SHALL reject the file without modifying the current E_Signature_Image and display an error message indicating the validation failure reason (unsupported format or file too large).
5. WHEN the user activates the remove button for the currently uploaded E_Signature_Image, THE Accounting_Table_Component SHALL clear the signature image preview and remove the stored E_Signature_Image value from the signatory configuration.
6. WHEN the user saves the 2307 print settings, THE Accounting_Table_Component SHALL persist the signatory configuration (printed name, title/designation, TIN, and E_Signature_Image) via the Print_Settings_Service and display a confirmation notice indicating whether the save succeeded to the database or fell back to local browser storage.
7. IF the Print_Settings_Service is unreachable when the user saves the 2307 print settings, THEN THE Accounting_Table_Component SHALL persist the signatory configuration to local browser storage as a fallback and display a notice indicating the fallback was used.

### Requirement 11: Signatory Block Rendering on 2307 PDF

**User Story:** As an accounting staff member, I want the generated 2307 PDF to display the signatory information at the bottom of the form, so that the printed form complies with BIR requirements for authorized representative identification.

#### Acceptance Criteria

1. WHEN a 2307 PDF is generated and at least one signatory field (printed name, title/designation, or TIN) contains a non-empty value in the signatory settings, THE Tax2307_PDF_Generator SHALL render a Signatory_Block positioned below the last tax computation row area on the form template.
2. THE Tax2307_PDF_Generator SHALL render the declaration text "I declare, under the penalties of perjury, that this certificate has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof." within the Signatory_Block.
3. WHEN an E_Signature_Image is configured in the signatory settings, THE Tax2307_PDF_Generator SHALL overlay the signature image above the printed name line within the Signatory_Block, scaled to fit within a maximum area of 150 pixels wide by 60 pixels tall while preserving aspect ratio.
4. THE Tax2307_PDF_Generator SHALL render the printed name of the signatory (maximum 120 characters, sourced from the signatory settings) below the signature image area.
5. THE Tax2307_PDF_Generator SHALL render the label "Signature over Printed Name of Payor/Payor's Authorized Representative/Tax Agent" below the printed name.
6. THE Tax2307_PDF_Generator SHALL render the title/designation (maximum 120 characters) and TIN (formatted as XXX-XXX-XXX-XXX) on a line below the label, separated by a space.
7. THE Tax2307_PDF_Generator SHALL render the subtitle "(Indicate Title/Designation and TIN)" below the title/designation and TIN values.
8. WHEN no signatory fields (printed name, title/designation, and TIN) contain a non-empty value and no E_Signature_Image is configured, THE Tax2307_PDF_Generator SHALL omit the Signatory_Block from the generated PDF.
9. WHEN signatory settings contain at least one non-empty text field but no E_Signature_Image is uploaded, THE Tax2307_PDF_Generator SHALL render the Signatory_Block with the printed name, title/designation, and TIN but leave the signature image area blank.
10. THE Tax2307_PDF_Generator SHALL render all Signatory_Block text elements in a font size between 8pt and 10pt, consistent with the rest of the form overlay text.
11. IF the E_Signature_Image file is not a valid image format (PNG or JPEG) or exceeds 2 MB in size, THEN THE Tax2307_PDF_Generator SHALL render the Signatory_Block without the signature image and leave the signature image area blank.

### Requirement 12: Tax2307 Print Settings Interface Extension

**User Story:** As a developer, I want the Tax2307PrintSettings interface to include signatory fields, so that the configuration is type-safe and consistent across frontend and backend.

#### Acceptance Criteria

1. THE Print_Settings_Service SHALL extend the Tax2307PrintSettings data structure to include `signatoryName` (string, maximum 200 characters), `signatoryTitle` (string, maximum 200 characters), `signatoryTin` (string, maximum 20 characters), and `signatoryImage` (base64-encoded string or empty string, maximum 500,000 characters).
2. WHEN the settings are saved with signatory fields absent, null, or undefined in the payload, THE Print_Settings_Service SHALL default `signatoryName`, `signatoryTitle`, and `signatoryTin` to empty strings and `signatoryImage` to an empty string.
3. WHEN the settings are loaded or saved with signatory field values present, THE Print_Settings_Service SHALL trim whitespace from `signatoryName`, `signatoryTitle`, and `signatoryTin`, and truncate each to its maximum character length.
4. IF `signatoryImage` contains a non-empty value that is not a valid base64-encoded string, THEN THE Print_Settings_Service SHALL default `signatoryImage` to an empty string.
