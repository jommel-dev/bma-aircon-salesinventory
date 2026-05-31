# Requirements Document

## Introduction

This feature redesigns the Purchase Order Materials (ACM type) form to follow the same UX pattern as the existing Sales Order Materials module. The current PO ACM form uses per-item brand/material dropdowns in a drawer, which is complex and not user-friendly. The new design replaces this with a dedicated form page featuring a global material search bar, an editable items table (ProductItemsTable pattern), and retains PO-specific features such as vendor selection, payment details, and the approval workflow.

## Glossary

- **PO_Materials_Form**: The Angular form page for creating and editing Purchase Orders of type ACM (Aircon Materials)
- **Material_Search_Bar**: A global search input at the top of the form that queries inventory materials by name, code, product type, or brand
- **PO_Items_Table**: A reusable table component displaying line items with editable Rate, Discount, QTY columns and computed Total, modeled after the SO ProductItemsTable
- **PO_Materials_Service**: The Angular frontend service responsible for communicating with the backend PO materials API endpoints
- **PO_Materials_Backend**: The NestJS backend controller and service handling CRUD operations for Purchase Orders of type ACM
- **Vendor_Selector**: A search/select component allowing users to choose an existing vendor or create a new one for the purchase order
- **Line_Item**: A single material entry in the PO items table containing material reference, rate, discount, quantity, and computed total
- **PO_Number**: An auto-generated unique identifier for each purchase order (format: PO-XXXXXX)
- **Approval_Workflow**: The status progression for purchase orders: in-progress → for_approval → approved → received → completed

## Requirements

### Requirement 1: PO Materials List Page with Status Tabs

**User Story:** As a user, I want a dedicated list page for PO Materials with status-based tabs, so that I can easily find and manage purchase orders by their current state.

#### Acceptance Criteria

1. WHEN the user navigates to the PO Materials route, THE PO_Materials_Form SHALL display a list page with four tabs labeled "My Requests", "Deliveries", "Approvals", and "Master Data", with the first permitted tab selected by default
2. WHEN the user selects a tab, THE PO_Materials_Form SHALL display only purchase orders matching the selected status category filtered to ACM type, resetting the list to page 1
3. WHEN the user enters text in the search field, THE PO_Materials_Form SHALL filter the displayed list by matching the search text against PO number or vendor name within 500 milliseconds of the user stopping input
4. IF the search field text does not match any PO number or vendor name in the current tab, THEN THE PO_Materials_Form SHALL display an empty list with a message indicating no results were found
5. THE PO_Materials_Form SHALL display paginated results with a default of 10 items per page, showing page navigation controls that include the current page number, total pages, and previous/next page buttons
6. IF the data request for the selected tab fails, THEN THE PO_Materials_Form SHALL display an error message indicating the list could not be loaded and show an empty list
7. WHEN the user clicks the "New PO" button, THE PO_Materials_Form SHALL navigate to the PO Materials form page for creating a new purchase order with the PO type preset to ACM

### Requirement 2: Global Material Search Bar

**User Story:** As a user, I want a single search bar at the top of the PO form to find materials, so that I can quickly add items without navigating per-item brand/material dropdowns.

#### Acceptance Criteria

1. WHEN the user types at least 2 characters in the Material_Search_Bar, THE PO_Materials_Form SHALL query the inventory materials search endpoint after a 300ms debounce delay and display up to 50 matching results in a dropdown list
2. THE Material_Search_Bar SHALL search materials by name, code, product type, and brand name using case-insensitive partial matching
3. WHEN the user selects a material from the search results, THE PO_Materials_Form SHALL add a new Line_Item to the PO_Items_Table with the material's name as description, material code as item code, unit_price as rate, unit as the line item unit, and quantity defaulting to 1
4. WHEN the user selects a material whose material_id already exists in the PO_Items_Table, THE PO_Materials_Form SHALL increment the quantity of the existing Line_Item by 1 instead of adding a duplicate row
5. WHEN the search returns no results, THE Material_Search_Bar SHALL display a "No materials found" message in the dropdown area
6. WHEN the Material_Search_Bar input contains fewer than 2 characters, THE PO_Materials_Form SHALL hide the search results dropdown

### Requirement 3: Editable PO Items Table

**User Story:** As a user, I want an editable items table showing all added materials with rate, discount, and quantity fields, so that I can adjust pricing and quantities inline.

#### Acceptance Criteria

1. THE PO_Items_Table SHALL display columns: Item No, Description, Cost (admin only), Rate, Discount, QTY, Total, and Action
2. WHEN the user edits the Rate field of a Line_Item, THE PO_Items_Table SHALL accept numeric values between 0.01 and 999999.99 with a maximum of 2 decimal places
3. WHEN the user edits the Discount field of a Line_Item, THE PO_Items_Table SHALL accept numeric values between 0 and 999999.99 with a maximum of 2 decimal places
4. WHEN the user edits the QTY field of a Line_Item, THE PO_Items_Table SHALL accept integer values between 1 and 99999
5. WHEN Rate, Discount, or QTY changes on a Line_Item, THE PO_Items_Table SHALL recompute the Total as max((Rate minus Discount), 0) multiplied by QTY, rounded to 2 decimal places
6. THE PO_Items_Table SHALL display a footer row showing the sum of all QTY values and the grand total (sum of all Line_Item totals), displaying 0 for both when the table contains no items
7. WHEN the user clicks the remove action on a Line_Item, THE PO_Items_Table SHALL remove that item from the table and recalculate both the footer QTY sum and the grand total
8. WHILE the user has admin or superadmin role, THE PO_Items_Table SHALL display the Cost column showing the material unit_price
9. IF the user enters a value outside the valid range or in an invalid format for Rate, Discount, or QTY, THEN THE PO_Items_Table SHALL reject the input and retain the field's previous valid value

### Requirement 4: Vendor Selection

**User Story:** As a user, I want to search and select a vendor for the purchase order, so that I can associate the PO with the correct supplier.

#### Acceptance Criteria

1. WHEN the user types in the Vendor_Selector, THE PO_Materials_Form SHALL search existing vendors by name after a 300ms debounce period and display up to 20 matching results in a dropdown list
2. IF the user types in the Vendor_Selector and no vendors match the search text, THEN THE PO_Materials_Form SHALL display a "no results" indication in the dropdown
3. WHEN the user selects an existing vendor from the dropdown, THE PO_Materials_Form SHALL populate the vendor details (name, address, contact person, contact number) from the selected record
4. WHEN the user chooses to create a new vendor, THE PO_Materials_Form SHALL allow entering vendor name (required, maximum 200 characters), address, contact person, and contact number inline
5. IF the user attempts to submit the purchase order without selecting an existing vendor or providing a new vendor name, THEN THE PO_Materials_Form SHALL prevent submission and display a validation error indicating that a vendor is required

### Requirement 5: Payment Details Section

**User Story:** As a user, I want to enter payment details for the purchase order, so that payment terms and method are recorded with the PO.

#### Acceptance Criteria

1. THE PO_Materials_Form SHALL provide a payment details section with fields for: method, amount, terms (in days), terms due date, status, payment date, bank name, reference number, check number, cheque date, issued by, and down payment
2. WHEN the user selects a payment method, THE PO_Materials_Form SHALL display only the fields relevant to that payment method as follows: Cash displays amount and payment date; Bank Transfer displays amount, bank name, and reference number; Terms displays amount, terms, and terms due date; Terms with DP displays amount, terms, terms due date, and down payment; Cheque displays amount, bank name, check number, cheque date, and issued by; Credit Card displays amount and payment date; Installment displays amount, terms, terms due date, and down payment
3. WHEN the user selects Cash or Bank Transfer as the payment method, THE PO_Materials_Form SHALL automatically set the payment status to "paid"
4. WHEN the user selects Terms, Terms with DP, Cheque, or Installment as the payment method, THE PO_Materials_Form SHALL set the payment status to "unpaid" and update it to "overdue" if the terms due date (for Terms or Terms with DP) or cheque date (for Cheque) is earlier than the current date
5. THE PO_Materials_Form SHALL accept payment status values of: unpaid, paid, or overdue
6. THE PO_Materials_Form SHALL accept a payment amount as a numeric value with up to 2 decimal places and a maximum of 12 total digits
7. THE PO_Materials_Form SHALL allow adding multiple payment entries for a single purchase order

### Requirement 6: PO Creation and Submission

**User Story:** As a user, I want to create a purchase order with all materials and details, so that it enters the approval workflow.

#### Acceptance Criteria

1. WHEN the user submits the PO form, THE PO_Materials_Backend SHALL auto-generate a unique PO_Number in the format "PO-" followed by the record ID zero-padded to 6 digits (e.g., "PO-000042") for the new purchase order
2. WHEN the user submits the PO form, THE PO_Materials_Backend SHALL set the po_type to "ACM" and initial status to "for_approval"
3. WHEN the user submits the PO form with at least one Line_Item containing a valid material name and a whole-number quantity between 1 and 999,999, and a selected vendor (by vendor ID or vendor name), THE PO_Materials_Backend SHALL create the purchase order record and associated material line items within the same database transaction
4. IF the user submits the PO form without any Line_Items, THEN THE PO_Materials_Form SHALL display a validation error indicating that at least one product item is required and prevent submission
5. IF the user submits the PO form with an ACM Line_Item that has no material name and no material ID, THEN THE PO_Materials_Backend SHALL reject the submission with an error indicating the material name is required
6. IF the user submits the PO form with an ACM Line_Item whose quantity is less than 1, greater than 999,999, or not a whole number, THEN THE PO_Materials_Backend SHALL reject the submission with an error indicating the quantity must be a whole number between 1 and 999,999
7. WHEN the purchase order is created successfully, THE PO_Materials_Backend SHALL compute and store the total_amount as the sum of each Line_Item's effective unit price (discount_price if greater than zero, otherwise unit_price) multiplied by its quantity, stored as NUMERIC(12,2)
8. WHEN the purchase order is created successfully, THE PO_Materials_Backend SHALL associate the purchase order with the branch_id derived from the authenticated user's session token

### Requirement 7: PO Edit and Update

**User Story:** As a user, I want to edit an existing PO Materials order, so that I can correct or update materials, quantities, and vendor details before approval.

#### Acceptance Criteria

1. WHEN the user opens an existing PO for editing, THE PO_Materials_Form SHALL load and display all saved data including vendor, line items, payment details, and remarks within 3 seconds
2. WHILE the purchase order status is "in-progress", THE PO_Materials_Form SHALL allow full editing of all fields including vendor selection, line item addition and removal, payment details, and remarks
3. WHILE the purchase order status is "for_approval", "approved", "received", or "completed", THE PO_Materials_Form SHALL display the order in read-only mode with all input fields and action buttons disabled
4. WHEN the user saves changes to an existing PO that has status "in-progress", THE PO_Materials_Backend SHALL update the purchase order record, replace all existing line items with the new set, and recompute total_amount as the sum of each Line_Item total ((Rate minus Discount) multiplied by QTY)
5. IF the user attempts to save changes to a PO that does not have status "in-progress", THEN THE PO_Materials_Backend SHALL reject the request and return an error message indicating the order cannot be edited in its current status
6. IF the user saves changes to a PO with an empty line items list, THEN THE PO_Materials_Form SHALL display a validation error indicating at least one Line_Item is required and prevent submission

### Requirement 8: Approval Workflow Status Transitions

**User Story:** As a user, I want the PO to follow the approval workflow, so that purchase orders are properly reviewed and tracked through completion.

#### Acceptance Criteria

1. WHEN the user submits a PO for approval, THE PO_Materials_Backend SHALL transition the status from "in-progress" to "for_approval" and persist the updated status
2. WHEN a user with approval permission approves the PO, THE PO_Materials_Backend SHALL transition the status from "for_approval" to "approved" and record the approving user's identity
3. WHEN a user with receive permission marks the PO as received, THE PO_Materials_Backend SHALL transition the status from "approved" to "received"
4. WHEN a user with complete permission completes the PO, THE PO_Materials_Backend SHALL transition the status from "received" to "completed"
5. IF a user attempts a status transition where the current status does not match the required source status for the requested action, THEN THE PO_Materials_Backend SHALL reject the request and return an error message indicating the transition is not allowed from the current status, without modifying the PO status
6. WHEN a user with revert permission reverts a PO that is currently in "for_approval" status, THE PO_Materials_Backend SHALL transition the status back to "in-progress"
7. THE PO_Materials_Backend SHALL enforce the following linear status sequence: "in-progress" → "for_approval" → "approved" → "received" → "completed", rejecting any transition that does not follow this sequence
8. IF the PO does not exist when a status transition is requested, THEN THE PO_Materials_Backend SHALL return an error message indicating the purchase order was not found

### Requirement 9: Remarks Field

**User Story:** As a user, I want to add remarks to a purchase order, so that I can include additional notes or instructions for the order.

#### Acceptance Criteria

1. THE PO_Materials_Form SHALL provide an optional remarks text field that accepts between 0 and 1000 characters
2. WHEN the user enters text exceeding 1000 characters into the remarks field, THE PO_Materials_Form SHALL prevent input beyond the 1000-character limit and display the current character count
3. WHEN the user saves the PO with a remarks value, THE PO_Materials_Backend SHALL persist the trimmed remarks value with the purchase order record, storing an empty value if the field contains only whitespace
4. WHEN the user opens an existing PO, THE PO_Materials_Form SHALL display the previously saved remarks in the remarks text field

### Requirement 10: Backend DTO Validation for PO Materials

**User Story:** As a developer, I want strict DTO validation on the backend, so that invalid data is rejected before reaching the database.

#### Acceptance Criteria

1. WHEN the backend receives a create PO Materials request, THE PO_Materials_Backend SHALL validate that productItems is a non-empty array and reject the request with a validation error indicating that at least one product item is required if the array is empty or missing
2. WHEN the backend receives a Line_Item with unitPrice less than 0.01 or greater than 999,999.99, THE PO_Materials_Backend SHALL reject the request with a validation error indicating the accepted range for the affected item index
3. WHEN the backend receives a Line_Item with qty less than 1 or greater than 999,999, THE PO_Materials_Backend SHALL reject the request with a validation error indicating the accepted range for the affected item index
4. WHEN the backend receives a Line_Item with qty that is not an integer, THE PO_Materials_Backend SHALL reject the request with a validation error indicating that quantity must be a whole number
5. WHEN the backend receives a request without a vendorId field and without a vendor object containing a non-empty name, THE PO_Materials_Backend SHALL reject the request with a validation error indicating that vendor identification is required
6. WHEN the backend receives a Line_Item with discountPrice less than 0 or greater than 999,999.99, THE PO_Materials_Backend SHALL reject the request with a validation error indicating the accepted range for the affected item index
7. IF the PO_Materials_Backend rejects a request due to any validation error, THEN THE PO_Materials_Backend SHALL not persist any data to the database and include the field path of the first invalid item in the error response
8. WHEN the backend receives a PO Materials request with poType ACM and a Line_Item that has no materialId and no non-empty materialName, THE PO_Materials_Backend SHALL reject the request with a validation error indicating that material identification is required for the affected item index
