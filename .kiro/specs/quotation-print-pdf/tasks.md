# Implementation Plan: Quotation Print PDF

## Overview

This plan implements a dedicated `QuotationPdfService` in the Angular frontend that programmatically generates a quotation PDF for Material Sales Orders in "Draft" status. The service uses `pdf-lib` (already installed) to compose A4 documents with a business header, customer details, itemized materials table, remarks section, disclaimer footer, and "QUOTATION ONLY" watermark. The existing `SalesOrderMaterialsComponent` will be updated to route quotation prints through the new service instead of the template-based `PrintSalesOrderService`.

## Tasks

- [x] 1. Create QuotationPdfService with validation and utility functions
  - [x] 1.1 Create the QuotationPdfService file with validation logic and helper utilities
    - Create `frontend/src/app/shared/services/quotation-pdf.service.ts`
    - Implement `@Injectable({ providedIn: 'root' })` service class
    - Implement `validateOrder(order)` that throws if status is not 'draft' or productItems is empty
    - Implement `formatMoney(value: number): string` using `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
    - Implement `formatDate(date: Date): string` producing "MMMM DD, YYYY" format
    - Implement `calculateLineTotal(rate, discount, qty): number` as `Math.max(0, rate - discount) * qty`
    - Implement `calculateGrandTotal(items): number` as sum of all line totals
    - Implement `wrapText(font, text, maxWidth, fontSize): string[]` ensuring no line exceeds maxWidth
    - Implement `scaleLogo(originalWidth, originalHeight, maxHeight): { width, height }` preserving aspect ratio
    - Implement `buildItemDescription(description, brand, itemCode): string` that appends brand/itemCode only when present
    - Define `QuotationPdfConfig` constants (A4 dimensions, margins, font sizes, watermark settings)
    - _Requirements: 1.1, 1.2, 1.3, 4.3, 4.4, 4.5, 3.6, 3.7, 2.1, 4.7_

  - [ ]* 1.2 Write property tests for validation and utility functions
    - **Property 1: Validation gate — only draft orders with items produce success**
    - **Property 2: Line total calculation correctness**
    - **Property 3: Grand total is sum of line totals**
    - **Property 4: Monetary formatting — 2 decimal places with thousands separators**
    - **Property 5: Date formatting produces "MMMM DD, YYYY" pattern**
    - **Property 9: Logo scaling preserves aspect ratio within height constraint**
    - **Property 11: Brand/item code conditional display**
    - **Validates: Requirements 1.1, 1.2, 1.3, 4.3, 4.4, 4.5, 3.6, 3.7, 2.1, 4.7**

- [x] 2. Implement PDF page composition (header, customer section, title, watermark)
  - [x] 2.1 Implement business header and customer section rendering
    - Implement `drawBusinessHeader(page, fonts, businessProfile, config)` that renders logo (if available) on the left and business name/address/contact/email on the right
    - Implement logo fetching and embedding with error handling (skip logo on failure)
    - Implement `drawCustomerSection(page, fonts, order, config)` that renders customer name, address, contact person, contact number, SO number, quotation date, and delivery date
    - Omit any field that is null/empty without leaving blank labels
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.2 Implement document title and watermark rendering
    - Implement `drawTitle(page, fonts, config)` that draws "QUOTATION" title below the business header
    - Implement `drawWatermark(page, fonts, config)` that draws diagonal "QUOTATION ONLY" text centered on page at ~45° rotation with 0.08 opacity in gray
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.3 Write property test for null/empty field omission
    - **Property 6: Null/empty field omission**
    - **Validates: Requirements 2.7, 3.8**

- [x] 3. Implement items table with pagination
  - [x] 3.1 Implement items table rendering with multi-page support
    - Implement `drawItemsTable(pdfDoc, pages, fonts, order, config)` that renders column headers (Item #, Description, Qty, Rate, Discount, Total) and each line item row
    - Use `buildItemDescription` to format description with brand/itemCode
    - Calculate line totals using `calculateLineTotal`
    - Format all monetary values using `formatMoney`
    - Preserve input array order for rows
    - Implement pagination: when items exceed available page space, create new page and repeat column headers
    - Draw grand total row at bottom of last page using `calculateGrandTotal`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 3.2 Write property tests for table rendering logic
    - **Property 10: Item order preservation**
    - **Property 8: Text wrapping — lines never exceed content width**
    - **Validates: Requirements 4.2, 7.3**

- [x] 4. Implement remarks section and disclaimer footer
  - [x] 4.1 Implement remarks section and disclaimer footer rendering
    - Implement `drawRemarks(page, fonts, order, yPosition, config)` that renders "Remarks:" label and wrapped remarks text only if remarks has non-whitespace content
    - Implement `drawDisclaimer(page, fonts, config)` that renders the exact disclaimer text: "Note: This is not an official transaction slip and this will be not a valid for any cases like Refunds, Confirmation of Order"
    - Render disclaimer in red (RGB 255, 0, 0), italic (HelveticaOblique), positioned at fixed bottom margin area on every page
    - Ensure minimum 10 points spacing from page bottom edge
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3_

  - [ ]* 4.2 Write property test for remarks conditional display
    - **Property 7: Remarks conditional display**
    - **Validates: Requirements 7.1, 7.2**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Compose the main generateQuotationPdf method and integrate with component
  - [x] 6.1 Implement the main `generateQuotationPdf` orchestration method
    - Wire together all rendering functions in the correct order: validate → create PDFDocument → embed fonts → for each page: draw header, customer section, title, items table, remarks, disclaimer, watermark
    - Return base64 data URI string (`data:application/pdf;base64,...`)
    - Handle errors gracefully (logo fetch failure, unsupported image format)
    - _Requirements: 1.1, 1.4_

  - [x] 6.2 Update SalesOrderMaterialsComponent to use QuotationPdfService
    - Inject `QuotationPdfService` into the component constructor
    - Inject `BusinessSettingsService` into the component constructor (if not already)
    - Modify `onPrintQuotation()` method to:
      1. Fetch full order detail via `getMaterialSalesOrderById()`
      2. Fetch business profile via `getBusinessProfile()`
      3. Call `quotationPdfService.generateQuotationPdf(order, businessProfile)`
      4. Display the returned data URI in the print modal iframe
    - Remove the current delegation to `generatePrintPreview()` with watermark option for quotation flow
    - _Requirements: 1.1, 1.4_

  - [ ]* 6.3 Write unit tests for QuotationPdfService integration
    - Test that generateQuotationPdf throws error for non-draft order
    - Test that generateQuotationPdf throws error for empty items
    - Test that generateQuotationPdf succeeds for a valid draft order with items and returns a data URI string starting with "data:application/pdf;base64,"
    - Test that null business profile still generates PDF successfully (no header section)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `pdf-lib` and `fast-check` libraries are already installed in the project
- All code is TypeScript (Angular) in the `frontend/` directory
- The existing `PrintSalesOrderService` is NOT modified — the new service is separate

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3"] }
  ]
}
```
