# Requirements Document

## Introduction

This feature restructures the Sales Order module to focus on materials-based sales orders and ensures the Purchase Order module properly handles ACM (Aircon Materials) product type. The Sales Order module receives a new tab structure (Draft, Pending, Complete, Voided), a simplified creation form with a smart material search, RBAC-controlled cost visibility, and support for non-inventory items. The Purchase Order module is extended to fully support ACM product type workflows for materials purchasing.

## Glossary

- **Sales_Order_Module**: The Angular frontend module responsible for creating, listing, and managing sales orders focused on materials.
- **Purchase_Order_Module**: The Angular frontend module responsible for creating and managing purchase orders, including ACM product type.
- **Material**: An inventory item of type ACM (Aircon Materials) with properties including product name, item code, product type, brand, unit price, and sell price.
- **Non_Inventory_Item**: A manually-typed product item that does not exist in the materials inventory but can still be added to a sales order (e.g., items ordered from another supplier).
- **Draft_Status**: A sales order state where the order is created but not yet finalized; printing is disabled.
- **Pending_Status**: A sales order state where the draft has been finalized and is awaiting completion; printing is enabled.
- **Complete_Status**: A sales order state indicating the order is fulfilled and included in reports.
- **Voided_Status**: A sales order state indicating the order has been cancelled/voided.
- **Delivery_Date**: The date field (formerly "Schedule Date") indicating when the order should be delivered; defaults to the current date.
- **Admin_User**: A user with role "admin" or "superadmin" as determined by the RbacService.
- **Non_Admin_User**: A user whose role is neither "admin" nor "superadmin".
- **Smart_Search**: A full-width search input that queries materials by product name, item code, product type, and brand.
- **Grand_Total**: The sum of all line item totals (Rate × QTY) in the product items table.
- **Total_QTY**: The sum of all quantities across all line items in the product items table.
- **ACM_Product_Type**: The "Aircon Materials" product type classification used in the Purchase Order module for materials purchasing.
- **RBAC_Service**: The Role-Based Access Control service that determines user permissions and role-based visibility.

## Requirements

### Requirement 1: Sales Order Tab Structure

**User Story:** As a user, I want to navigate sales orders by status tabs (Draft, Pending, Complete, Voided), so that I can quickly find orders based on their lifecycle stage.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL display exactly four tabs in the following order: Draft, Pending, Complete, and Voided.
2. WHEN the Sales_Order_Module is loaded, THE Sales_Order_Module SHALL select the Draft tab by default and display its contents.
3. WHEN the Draft tab is selected, THE Sales_Order_Module SHALL display a paginated list of sales orders with Draft_Status, resetting to page 1.
4. WHEN the Pending tab is selected, THE Sales_Order_Module SHALL display a paginated list of sales orders with Pending_Status, resetting to page 1.
5. WHEN the Complete tab is selected, THE Sales_Order_Module SHALL display a paginated list of sales orders with Complete_Status, resetting to page 1.
6. WHEN the Voided tab is selected, THE Sales_Order_Module SHALL display a paginated list of sales orders with Voided_Status, resetting to page 1.
7. WHILE a sales order has Draft_Status, THE Sales_Order_Module SHALL hide the print button for that order.
8. WHILE a sales order has Pending_Status or Complete_Status, THE Sales_Order_Module SHALL display an enabled print button for that order.
9. WHILE a sales order has Voided_Status, THE Sales_Order_Module SHALL hide the print button for that order.
10. WHILE a sales order has Complete_Status, THE Sales_Order_Module SHALL include that order in report calculations.

### Requirement 2: Delivery Date Field

**User Story:** As a user, I want the schedule date field renamed to "Delivery Date" with role-based editability, so that delivery dates are consistent and only authorized users can modify them.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL display the field label as "Delivery Date" instead of "Schedule Date".
2. THE Sales_Order_Module SHALL default the Delivery_Date value to the current date (based on the user's local timezone) when creating a new sales order.
3. WHILE a Non_Admin_User is creating or editing a sales order, THE Sales_Order_Module SHALL render the Delivery_Date field as non-editable (disabled input).
4. WHILE an Admin_User is creating or editing a sales order, THE Sales_Order_Module SHALL render the Delivery_Date field as editable.
5. WHEN a Non_Admin_User opens the sales order form, THE Sales_Order_Module SHALL reset the Delivery_Date to the current date regardless of any previously stored value.

### Requirement 3: Sales Type Field Removal

**User Story:** As a user, I want the Sales Type field removed from the form, so that the interface is simplified while maintaining the default "sales" value in the backend.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL NOT render the Sales Type label, dropdown, or any associated input element on the create and edit sales order forms.
2. WHEN a sales order is created without an explicit salesType value in the request, THE Sales_Order_Module SHALL set the salesType field to the string value "sales" in the request payload submitted to the backend.
3. WHEN a sales order is edited and the existing record has a salesType value other than "sales", THE Sales_Order_Module SHALL preserve the original salesType value in the request payload rather than overwriting it with "sales".
4. THE Sales_Order_Module SHALL persist the salesType value of "sales" in the database for all new orders created through this module.
5. IF a sales order record is retrieved that contains a salesType value (including values other than "sales" from previously created orders), THEN THE Sales_Order_Module SHALL display the stored salesType value in read-only views such as the order list table and order detail panel.

### Requirement 4: Installer Field Removal

**User Story:** As a user, I want the Installer field removed from the sales order form, so that the form is streamlined for materials-focused orders.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL exclude the Installer field from the create sales order form.
2. THE Sales_Order_Module SHALL exclude the Installer field from the edit sales order form.
3. WHEN a sales order is created through this module, THE Sales_Order_Module SHALL omit the installer property from the request payload.
4. WHEN a sales order is updated through this module, THE Sales_Order_Module SHALL not send or modify the installer property in the request payload.

### Requirement 5: Material Smart Search

**User Story:** As a user, I want a full-width smart search input to find materials quickly, so that I can efficiently add items to a sales order.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL display a full-width search input above the product items table.
2. WHEN a user types at least 1 character in the Smart_Search input, THE Sales_Order_Module SHALL query materials matching by product name, item code, product type, or brand, and display up to 50 matching results in a dropdown list.
3. WHEN a user selects a Material from the search results, THE Sales_Order_Module SHALL add a new row in the product items table pre-populated with the material's description, item code, brand, cost (unit_price), rate (sell_price), and a default QTY of 1.
4. IF the Smart_Search query returns zero matching materials, THEN THE Sales_Order_Module SHALL display an indication of no results and allow the user to add the typed value as a Non_Inventory_Item.
5. WHEN a user selects a Material that already exists as a line item in the product items table, THE Sales_Order_Module SHALL add it as a separate new row rather than modifying the existing row.

### Requirement 6: Product Items Table

**User Story:** As a user, I want a structured table displaying selected materials with relevant columns, so that I can review and manage order line items.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL display the product items table with columns: ITEM No., Description, Cost, Rate, QTY, Total, and Action.
2. WHILE an Admin_User is viewing the product items table, THE Sales_Order_Module SHALL display the Cost column with values visible.
3. WHILE a Non_Admin_User is viewing the product items table, THE Sales_Order_Module SHALL hide the Cost column so that it is not rendered in the table.
4. THE Sales_Order_Module SHALL allow the user to edit the Rate and QTY values for each line item directly within the product items table.
5. THE Sales_Order_Module SHALL calculate the Total column value as Rate multiplied by QTY for each line item, rounded to 2 decimal places.
6. THE Sales_Order_Module SHALL accept QTY values as whole numbers with a minimum value of 1 and a maximum value of 99999.
7. THE Sales_Order_Module SHALL accept Rate values as numeric with up to 2 decimal places, with a minimum value of 0.01 and a maximum value of 999999.99.
8. THE Sales_Order_Module SHALL display the Grand_Total at the bottom of the product items table as the sum of all line item Total values, rounded to 2 decimal places.
9. THE Sales_Order_Module SHALL display the Total_QTY at the bottom of the product items table as the sum of all line item QTY values.
10. WHEN a user clicks the remove action in the Action column, THE Sales_Order_Module SHALL remove that line item from the product items table and recalculate the Grand_Total and Total_QTY immediately.

### Requirement 7: Form Action Buttons

**User Story:** As a user, I want "Create Order" and "Save as Draft" buttons, so that I can either finalize or save an in-progress sales order.

#### Acceptance Criteria

1. THE Sales_Order_Module SHALL display two action buttons on the create sales order form: "Create Order" and "Save as Draft".
2. WHEN the user clicks "Save as Draft", THE Sales_Order_Module SHALL save the sales order with Draft_Status without requiring product items in the table.
3. WHEN the user clicks "Create Order", THE Sales_Order_Module SHALL save the sales order with Pending_Status.
4. IF the user clicks "Create Order" and the product items table contains zero line items, THEN THE Sales_Order_Module SHALL prevent submission and display a validation message indicating that at least one product item is required.
5. IF a save operation fails due to a server or network error, THEN THE Sales_Order_Module SHALL display an error message indicating the failure reason and SHALL retain all user-entered form data.
6. WHEN a sales order is successfully saved with either Draft_Status or Pending_Status, THE Sales_Order_Module SHALL display a success confirmation message within 1 second of receiving the server response.
7. WHILE a save operation is in progress, THE Sales_Order_Module SHALL disable both action buttons to prevent duplicate submissions.

### Requirement 8: Purchase Order ACM Support

**User Story:** As a user, I want the Purchase Order module to fully support ACM (Aircon Materials) product type, so that I can create purchase orders specifically for materials procurement.

#### Acceptance Criteria

1. THE Purchase_Order_Module SHALL include ACM_Product_Type as a selectable product type when creating a purchase order.
2. WHEN ACM_Product_Type is selected, THE Purchase_Order_Module SHALL display material-specific fields: material brand, material name, material code, material unit, and quantity, where quantity accepts numeric values from 1 to 999,999.
3. WHEN an ACM purchase order is saved, THE Purchase_Order_Module SHALL store the material brand, material name, material code, material unit, and quantity in the purchase order record, and SHALL reject submission with an error indication if material name or quantity is not provided.
4. WHEN an ACM purchase order reaches completed status, THE Purchase_Order_Module SHALL record an inbound stock movement of type IN for each material line item, increasing the material on_hand_stock by the quantity specified in the purchase order line.
5. WHEN a user adds an ACM item to a purchase order, THE Purchase_Order_Module SHALL allow searching existing materials by name or code and display matching results.
6. IF a material specified in an ACM purchase order does not exist in the materials catalog, THEN THE Purchase_Order_Module SHALL create the material record using the provided material brand, material name, material code, and material unit before saving the purchase order line item.

### Requirement 9: Non-Inventory Item Handling

**User Story:** As a user, I want to add items that are not in the inventory system to a sales order, so that I can handle scenarios where materials are ordered from external suppliers.

#### Acceptance Criteria

1. WHEN a user types a value in the Smart_Search input and no existing Material matches the entered text, THE Sales_Order_Module SHALL allow the user to add the entered text as a Non_Inventory_Item description with a maximum length of 255 characters.
2. THE Sales_Order_Module SHALL allow the user to manually enter Rate (between 0.01 and 999,999,999.99) and QTY (integer between 1 and 99,999) for a Non_Inventory_Item.
3. IF the user attempts to add a Non_Inventory_Item with a Rate of zero or an empty QTY, THEN THE Sales_Order_Module SHALL prevent the item from being added and display a validation message indicating the required fields.
4. THE Sales_Order_Module SHALL calculate the Total for a Non_Inventory_Item using the same formula (Rate × QTY) as inventory items.
5. THE Sales_Order_Module SHALL include Non_Inventory_Item line items in the Grand_Total and Total_QTY calculations.
6. WHEN a sales order containing Non_Inventory_Item entries is saved (via either "Create Order" or "Save as Draft"), THE Sales_Order_Module SHALL persist those items with a flag indicating they are non-inventory.
