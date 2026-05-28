# Bugfix Requirements Document

## Introduction

The Inventory "Create Type or Products" drawer has four defects affecting usability: (1) Item Code auto-generation does not reactively update when the user enters a Prefix in the "All In One" tab — codes only generate at submission time, (2) the Product Type field in the "Add Product" tab uses a basic HTML `<datalist>` instead of a proper searchable/filterable dropdown, (3) the Brand Name field in the "Add Product" tab also uses a basic `<datalist>` instead of a smart searchable dropdown, and (4) the Material Inventory section/page should be removed entirely.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user enters a Prefix (e.g., "HVAC") in the Product Type section of the "All In One" tab AND product items exist below THEN the system does not reactively update the Item Code fields — they remain empty with only an "Auto-generated" placeholder until form submission

1.2 WHEN a user adds multiple product items in the "All In One" tab THEN the Item Code fields show no preview of the generated code pattern (e.g., HVAC0001, HVAC0002) while the user is filling out the form

1.3 WHEN a user interacts with the Product Type field in the "Add Product" tab THEN the system renders a plain text input with a native HTML `<datalist>` that provides no filtering feedback, no highlighted matches, and limited usability on most browsers

1.4 WHEN a user interacts with the Brand Name field in the "Add Product" tab THEN the system renders a plain text input with a native HTML `<datalist>` that provides no real-time filtering, no highlighted matches, and inconsistent behavior across browsers

1.5 WHEN a user navigates to the Material Inventory section THEN the system displays a separate page/module that is no longer needed and should be removed

### Expected Behavior (Correct)

2.1 WHEN a user enters or changes the Prefix in the Product Type section of the "All In One" tab THEN the system SHALL reactively auto-generate and display Item Code values (following the pattern `<PREFIX>0001`, `<PREFIX>0002`, etc.) in each product item's Item Code field in real-time

2.2 WHEN a user adds a new product item in the "All In One" tab AND a Prefix is already entered THEN the system SHALL immediately populate the new item's Item Code field with the next sequential code (e.g., HVAC0003 for the third item)

2.3 WHEN a user interacts with the Product Type field in the "Add Product" tab THEN the system SHALL display a smart searchable dropdown component that filters existing product types as the user types, showing matching results in a styled dropdown panel

2.4 WHEN a user interacts with the Brand Name field in the "Add Product" tab THEN the system SHALL display a smart searchable dropdown component that filters existing brands as the user types, showing matching results in a styled dropdown panel

2.5 WHEN the fix is applied THEN the system SHALL remove the Material Inventory page, its route, and its navigation entry entirely

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user manually types a custom Item Code in the "All In One" tab THEN the system SHALL CONTINUE TO preserve the manually entered value and not overwrite it with auto-generated codes

3.2 WHEN a user submits the "All In One" form with a valid Prefix and product items THEN the system SHALL CONTINUE TO create products with correctly formatted item codes on the backend

3.3 WHEN a user types a brand name that does not exist in the "Add Product" tab THEN the system SHALL CONTINUE TO allow creating a new brand with that name (type-to-create behavior)

3.4 WHEN a user types a product type that does not exist in the "Add Product" tab THEN the system SHALL CONTINUE TO allow entering a new product type name

3.5 WHEN a user uses the "Product Type" tab to create a standalone product type THEN the system SHALL CONTINUE TO function as before

3.6 WHEN a user uses the Bulk Upload CSV feature THEN the system SHALL CONTINUE TO function as before

3.7 WHEN a user interacts with the folder tree, product details, capacity management, or serial number features THEN the system SHALL CONTINUE TO function as before
