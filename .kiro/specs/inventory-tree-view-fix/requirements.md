# Requirements Document

## Introduction

This feature addresses a bug fix and UI enhancement for the Material Inventory module in the 3BMA HVAC Management System. Currently, inventory items are incorrectly saving with brand type ACU and persisting to `tblproducts` instead of `tblmaterials`. This spec covers: (1) fixing the data persistence to correctly save materials to `tblmaterials`, (2) implementing a File Tree View with Product Type as parent nodes and Brands as child nodes, and (3) adding a table list with action menus when a brand is selected.

## Glossary

- **Inventory_Module**: The frontend Angular page and backend NestJS services responsible for managing material inventory items (pipes, wires, accessories, etc.)
- **Material**: An inventory item stored in `tblmaterials` with fields including material_name, material_code, unit, unit_price, sell_price, on_hand_stock, and reorder_level
- **Product_Type**: A category classification stored in `tblproducttypes` (e.g., "Breaker", "Wire", "Pipe") that serves as the parent node in the tree view. Brands are associated with a Product Type.
- **Brand**: A manufacturer or supplier brand stored in `tblbrands` with type='MAT' that is associated with a Product_Type and serves as a child node under its Product Type in the tree view
- **Stock_Deficit**: A negative stock situation where customer orders exceed on_hand_stock (e.g., 5 on hand but 10 ordered means a deficit of 5). This is sourced from another supplier internally and recorded as history for reference.
- **Tree_View**: The left-side navigation panel displaying a hierarchical folder structure of Product Type → Brand
- **Material_Table**: The right-side data table displaying material items filtered by the selected brand, showing columns for item details, pricing, and stock
- **Action_Menu**: A three-dot context menu on each table row providing Edit, Delete, Adjustment, and History operations
- **Stock_Notice**: A visual indicator showing the stock status of a material (e.g., low stock, out of stock, normal)
- **Material_Creation_Form**: The form used to create new material inventory items, which must persist data to `tblmaterials` with brand type MAT
- **Stock_Movement**: A record in `tblmaterial_stock_movement` tracking stock changes (IN, OUT, ADJUST, RESERVE, RELEASE) with source references and timestamps

## Requirements

### Requirement 1: Correct Material Data Persistence

**User Story:** As an inventory manager, I want materials to save correctly to the materials table, so that inventory data is stored in the proper location and associated with MAT-type brands.

#### Acceptance Criteria

1. WHEN a new material item is created through the Inventory_Module with a brand_id provided, THE Material_Creation_Form SHALL persist the record to `tblmaterials` with the brand_id referencing a brand in `tblbrands` where type='MAT'
2. WHEN a new material item is created through the Inventory_Module without a brand_id, THE Material_Creation_Form SHALL persist the record to `tblmaterials` with brand_id set to null
3. WHEN a brand is selected during material creation, THE Inventory_Module SHALL only display brands where the type column equals 'MAT'
4. IF a material creation request references a brand with type='ACU', THEN THE Inventory_Module SHALL reject the request and display an error message indicating that only MAT-type brands are valid for materials
5. IF a material creation request references a brand_id that does not exist in `tblbrands`, THEN THE Inventory_Module SHALL reject the request and display an error message indicating the brand was not found
6. IF a material creation request specifies a material_name that already exists in `tblmaterials` (among non-deleted records), THEN THE Inventory_Module SHALL reject the request and display an error message indicating the material name is a duplicate
7. THE Inventory_Module SHALL NOT persist material inventory items to `tblproducts`

### Requirement 2: Tree View with Product Type Parent Nodes

**User Story:** As an inventory manager, I want to see Product Types as parent nodes in the tree view, so that I can navigate materials organized by their category.

#### Acceptance Criteria

1. WHEN the Inventory_Module loads, THE Tree_View SHALL display all Product Types from `tblproducttypes` as expandable parent nodes, each showing the Product Type name as the node label
2. WHEN a Product Type node is expanded, THE Tree_View SHALL display all MAT-type Brands associated with that Product Type as child nodes, where association is determined by a `product_type_id` foreign key on `tblbrands` referencing `tblproducttypes.id`
3. THE Inventory_Module SHALL associate each Brand with a Product_Type via a `product_type_id` column on `tblbrands` so that brands appear under their correct category in the Tree_View
4. WHEN the user types at least 1 character in the tree search input, THE Tree_View SHALL filter the visible nodes to show only Product Type nodes and Brand child nodes whose names contain the search term (case-insensitive substring match), and SHALL automatically expand parent nodes that contain matching child nodes
5. THE Tree_View SHALL display Product Type nodes in ascending alphabetical order by name
6. THE Tree_View SHALL display Brand child nodes in ascending alphabetical order by brand name within each Product Type
7. IF a MAT-type Brand has no associated product_type_id (null value), THEN THE Tree_View SHALL display that Brand under an "Uncategorized" parent node positioned after all alphabetically sorted Product Type nodes
8. IF the tree search input is cleared (empty string), THEN THE Tree_View SHALL restore the full unfiltered tree with all nodes in their default collapsed state

### Requirement 3: Material Table Display on Brand Selection

**User Story:** As an inventory manager, I want to see a table of materials when I click a brand in the tree view, so that I can view and manage all inventory items for that brand.

#### Acceptance Criteria

1. WHEN a Brand child node is clicked in the Tree_View, THE Material_Table SHALL display all materials from `tblmaterials` filtered by the selected brand_id, sorted by material_name in ascending alphabetical order
2. THE Material_Table SHALL display the following columns: Item Code, Product Name, Stock Notice, Cost, Price (PHP), Margin, Inventory Stock, Overall Cost, Overall Price, Overall Margin
3. THE Material_Table SHALL calculate Margin as the difference between Price and Cost for each row, displayed to 2 decimal places
4. THE Material_Table SHALL calculate Overall Cost as Cost multiplied by Inventory Stock for each row, displayed to 2 decimal places
5. THE Material_Table SHALL calculate Overall Price as Price multiplied by Inventory Stock for each row, displayed to 2 decimal places
6. THE Material_Table SHALL calculate Overall Margin as Overall Price minus Overall Cost for each row, displayed to 2 decimal places
7. WHEN the selected brand has no materials, THE Material_Table SHALL display an empty state message indicating no materials exist for the selected brand
8. IF on_hand_stock is equal to 0, THEN THE Material_Table SHALL display the Stock Notice column with a visual indicator representing out-of-stock status
9. IF on_hand_stock is greater than 0 and less than or equal to reorder_level, THEN THE Material_Table SHALL display the Stock Notice column with a visual indicator representing low-stock status
10. IF on_hand_stock is greater than reorder_level, THEN THE Material_Table SHALL display the Stock Notice column with a visual indicator representing in-stock status

### Requirement 4: Row Action Menu

**User Story:** As an inventory manager, I want a context menu on each material row, so that I can perform Edit, Delete, Adjustment, and History actions on individual items.

#### Acceptance Criteria

1. THE Material_Table SHALL display a three-dot action button in the last column of each material row
2. WHEN the three-dot button is clicked, THE Action_Menu SHALL display a context menu with four options in this order: Edit, Delete, Adjustment, History
3. WHEN the Edit option is selected, THE Inventory_Module SHALL open an edit form pre-populated with the selected material's current values for material_name, material_code, description, unit, unit_price, sell_price, on_hand_stock, and reorder_level
4. WHEN the Delete option is selected, THE Inventory_Module SHALL display a confirmation dialog stating the material name and requiring the user to confirm or cancel before performing a soft delete by setting deleted_at on the material record
5. IF the user cancels the delete confirmation dialog, THEN THE Inventory_Module SHALL close the dialog and leave the material record unchanged
6. WHEN the Adjustment option is selected, THE Inventory_Module SHALL open a stock adjustment form allowing the user to select a direction (increase or decrease), enter a quantity between 1 and 999,999 inclusive, and provide an optional remarks field (maximum 500 characters), then record the change as a Stock_Movement in `tblmaterial_stock_movement` with movement_type 'ADJUST'
7. IF a stock adjustment would reduce on_hand_stock below zero, THEN THE Inventory_Module SHALL reject the adjustment and display an error message indicating insufficient stock
8. WHEN the History option is selected, THE Inventory_Module SHALL display the price history from `tblmaterial_price_history` and stock movement records from `tblmaterial_stock_movement` for the selected material, ordered by created_at descending, limited to the most recent 100 records per category
9. WHEN a click occurs outside the Action_Menu, THE Action_Menu SHALL close

### Requirement 5: Stock Notice Indicator

**User Story:** As an inventory manager, I want a visual stock notice on each material row, so that I can quickly identify items that need reordering.

#### Acceptance Criteria

1. WHILE on_hand_stock is greater than reorder_level, THE Stock_Notice SHALL display a green "Normal" badge in the Stock Notice column of the Material_Table
2. WHILE on_hand_stock is less than or equal to reorder_level and greater than zero, THE Stock_Notice SHALL display an orange "Low Stock" badge in the Stock Notice column of the Material_Table
3. WHILE on_hand_stock equals zero, THE Stock_Notice SHALL display a red "Out of Stock" badge in the Stock Notice column of the Material_Table
4. IF on_hand_stock is less than zero, THEN THE Stock_Notice SHALL display a red "Out of Stock" badge in the Stock Notice column of the Material_Table
5. WHEN the Material_Table is loaded or refreshed, THE Stock_Notice SHALL evaluate each material row's on_hand_stock against its reorder_level and display the corresponding indicator within 1 second of data retrieval

### Requirement 6: Stock Deficit Recording

**User Story:** As an inventory manager, I want stock deficits to be recorded as history, so that I can track when customer orders exceeded available stock and required sourcing from another supplier.

#### Acceptance Criteria

1. WHEN a customer order quantity exceeds the on_hand_stock for a material, THE Inventory_Module SHALL record a Stock_Movement with movement_type 'OUT', where the qty equals the difference between the ordered quantity and the on_hand_stock (ordered_qty minus on_hand_stock), source_type set to 'SO', and a remark indicating the deficit quantity and that the material was sourced from another supplier
2. WHEN a stock deficit is recorded, THE Inventory_Module SHALL store the source order reference (source_type as 'SO', source_id as the sales order ID, source_line_key as the sales order line item identifier) in the Stock_Movement record for traceability
3. WHEN a stock deficit is recorded, THE Inventory_Module SHALL NOT reduce the on_hand_stock below zero in the material stock balance
4. WHEN the History option is selected from the Action_Menu, THE Inventory_Module SHALL display stock deficit records alongside other Stock_Movement records, with the remarks column indicating the deficit context to distinguish them from standard OUT movements
