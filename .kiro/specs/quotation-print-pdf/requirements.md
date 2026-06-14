# Requirements Document

## Introduction

This feature adds a "Print Quotation PDF" capability to the Material Sales Order module. When a Material Sales Order is in "Draft" status, users can generate a PDF document formatted as a quotation. The PDF clearly distinguishes itself from official transaction documents through a prominent disclaimer footer, preventing customers from misusing the quotation printout as a valid transaction slip for refunds or order confirmations.

## Glossary

- **PDF_Generator**: The frontend service responsible for composing and rendering the quotation PDF document using the pdf-lib library
- **Material_Sales_Order**: A sales order record in the system that tracks material/product line items, customer details, and order status
- **Business_Profile**: The system settings record containing business name, address, contact information, logo, and print configuration
- **Quotation_PDF**: The generated PDF document representing a draft material sales order in quotation format
- **Line_Item**: A single material or non-inventory product entry within a Material Sales Order, containing description, quantity, rate, discount, and total
- **Disclaimer_Footer**: The red italic note at the bottom of the Quotation PDF that communicates the document is not an official transaction slip

## Requirements

### Requirement 1: Quotation PDF Generation Trigger

**User Story:** As a sales staff member, I want to generate a quotation PDF from a Material Sales Order in Draft status, so that I can provide customers with a price estimate before the order is confirmed.

#### Acceptance Criteria

1. WHEN the user requests a quotation print for a Material Sales Order, THE PDF_Generator SHALL verify the order status is "Draft" and that the order contains at least one product item before generating the document
2. IF the Material Sales Order status is not "Draft", THEN THE PDF_Generator SHALL prevent PDF generation and display an error message indicating that quotation prints are only available for Draft orders
3. IF the Material Sales Order contains no product items, THEN THE PDF_Generator SHALL prevent PDF generation and display an error message indicating that at least one product item is required
4. WHEN the user triggers the print action on a Draft Material Sales Order that contains at least one product item, THE PDF_Generator SHALL produce a downloadable PDF document that includes a visible "QUOTATION ONLY" watermark on every page to distinguish it from confirmed order documents

### Requirement 2: Business Header Section

**User Story:** As a business owner, I want the quotation PDF to display my business header, so that the document looks professional and identifies my company.

#### Acceptance Criteria

1. THE Quotation_PDF SHALL display the business logo from the Business_Profile settings in the header area, scaled to fit within a maximum height of 60 pixels while maintaining the original aspect ratio
2. THE Quotation_PDF SHALL display the business name from the Business_Profile settings in the header area
3. THE Quotation_PDF SHALL display the business address from the Business_Profile settings in the header area
4. THE Quotation_PDF SHALL display the business contact number from the Business_Profile settings in the header area
5. THE Quotation_PDF SHALL display the business email from the Business_Profile settings in the header area
6. IF the Business_Profile logo is not configured, THEN THE PDF_Generator SHALL render the header without a logo while still displaying the text-based business information
7. IF any Business_Profile text field (business name, address, contact number, or email) is empty or null, THEN THE PDF_Generator SHALL omit that field from the header without leaving blank space or labels
8. THE Quotation_PDF SHALL arrange the header with the business logo on the left and the text-based business information (name, address, contact number, email) displayed in that order on the right side of the header area

### Requirement 3: Customer and Order Details Section

**User Story:** As a sales staff member, I want the quotation PDF to show the customer information and order reference details, so that the recipient can identify which quotation belongs to them.

#### Acceptance Criteria

1. THE Quotation_PDF SHALL display the customer name from the Material_Sales_Order record
2. THE Quotation_PDF SHALL display the customer address from the Material_Sales_Order record
3. THE Quotation_PDF SHALL display the customer contact person from the Material_Sales_Order record
4. THE Quotation_PDF SHALL display the customer contact number from the Material_Sales_Order record
5. THE Quotation_PDF SHALL display the Sales Order number (SO number) as a reference identifier
6. THE Quotation_PDF SHALL display the delivery date from the Material_Sales_Order record formatted as "MMMM DD, YYYY" (e.g., "June 14, 2026")
7. THE Quotation_PDF SHALL display the document generation date as the quotation date formatted as "MMMM DD, YYYY"
8. IF any customer field value (name, address, contact person, or contact number) is empty or null, THEN THE PDF_Generator SHALL omit that field from the rendered output without leaving blank labels

### Requirement 4: Materials/Items Table

**User Story:** As a sales staff member, I want the quotation PDF to list all materials and items with their pricing, so that the customer can review what they are being quoted for.

#### Acceptance Criteria

1. THE Quotation_PDF SHALL display a table with columns for item number, description, quantity, unit rate, discount, and line total
2. WHEN the Material Sales Order contains line items, THE PDF_Generator SHALL render each Line_Item as a row in the items table in the same order as the line items appear in the Material Sales Order
3. THE Quotation_PDF SHALL calculate and display the line total for each item as (rate minus discount) multiplied by quantity, treating the result as zero when discount exceeds rate
4. THE Quotation_PDF SHALL display all monetary values (unit rate, discount, line total, grand total) formatted to exactly 2 decimal places with thousands separators
5. THE Quotation_PDF SHALL display a grand total row at the bottom of the items table representing the sum of all line totals
6. WHEN the items table exceeds one page, THE PDF_Generator SHALL paginate the table across multiple pages while maintaining the table column headers on each page
7. IF a Line_Item has a non-null and non-empty brand or item code value, THEN THE Quotation_PDF SHALL display the brand and item code alongside the description for that item
8. IF the Material Sales Order contains zero line items, THEN THE PDF_Generator SHALL render the items table with column headers and an empty body with no data rows

### Requirement 5: Disclaimer Footer Note

**User Story:** As a business owner, I want a prominent disclaimer note on the quotation PDF, so that customers cannot misuse the quotation printout as a valid transaction slip for refunds or order confirmation.

#### Acceptance Criteria

1. THE Quotation_PDF SHALL display the following exact text at the bottom of the document: "Note: This is not an official transaction slip and this will be not a valid for any cases like Refunds, Confirmation of Order"
2. THE PDF_Generator SHALL render the disclaimer footer text in red color using RGB value (255, 0, 0)
3. THE PDF_Generator SHALL render the disclaimer footer text in italic font style
4. THE Quotation_PDF SHALL display the disclaimer footer on every page of the generated document at a fixed position within the bottom margin area
5. THE PDF_Generator SHALL position the disclaimer footer below the items table content and above the page bottom edge with a minimum vertical spacing of 10 points from the bottom edge

### Requirement 6: Document Title and Watermark

**User Story:** As a business owner, I want the quotation PDF to clearly indicate it is a quotation document, so that there is no confusion with official invoices or delivery receipts.

#### Acceptance Criteria

1. THE Quotation_PDF SHALL display "QUOTATION" as the document title in the header section below the business header
2. THE PDF_Generator SHALL render a diagonal "QUOTATION" watermark on each page of the document rotated at approximately 45 degrees from the horizontal axis
3. THE PDF_Generator SHALL render the watermark with an opacity between 0.05 and 0.15 so that it does not obscure the document content
4. THE PDF_Generator SHALL render the watermark text in gray color and centered on the page

### Requirement 7: Remarks Section

**User Story:** As a sales staff member, I want the quotation PDF to include any remarks attached to the order, so that additional notes or special conditions are communicated to the customer.

#### Acceptance Criteria

1. WHEN the Material_Sales_Order has a remarks field containing at least one non-whitespace character, THE Quotation_PDF SHALL display a remarks section below the items table consisting of a "Remarks" label followed by the remarks text content
2. IF the remarks field is empty, null, or contains only whitespace characters, THEN THE PDF_Generator SHALL omit the remarks section entirely
3. WHEN the remarks text exceeds the available width of the content area, THE PDF_Generator SHALL wrap the text to subsequent lines within the remarks section
