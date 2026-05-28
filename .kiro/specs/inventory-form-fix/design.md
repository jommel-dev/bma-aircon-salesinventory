# Inventory Form Fix Bugfix Design

## Overview

This bugfix addresses four usability defects in the Inventory "Create Type or Products" drawer:
1. Item Code fields in the "All In One" tab do not reactively update when the user enters/changes the Prefix — they only generate at submission time.
2. The Product Type field in the "Add Product" tab uses a native HTML `<datalist>` instead of a proper searchable dropdown with filtering feedback.
3. The Brand Name field in the "Add Product" tab also uses a native HTML `<datalist>` instead of a searchable dropdown.
4. The Material Inventory page/module is no longer needed and should be removed entirely.

The fix strategy is: (a) add reactive two-way binding between the Prefix field and Item Code fields using Angular's `ngModelChange`, (b) replace `<datalist>` elements with custom combobox dropdown components following the existing pattern used in purchase-order and quotation pages, and (c) remove the Material Inventory page, route, navigation entry, and associated service references.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger the four defects — entering a prefix without reactive item code update, interacting with Product Type/Brand fields that render as `<datalist>`, or navigating to the Material Inventory page.
- **Property (P)**: The desired behavior — reactive item code generation, searchable dropdown rendering, and absence of Material Inventory page.
- **Preservation**: Existing behaviors that must remain unchanged — manual item code override, form submission logic, type-to-create for brands/product types, folder tree, bulk upload, and all other inventory features.
- **`allInOneProductTypePrefix`**: The `ngModel`-bound property in `inventory.component.ts` that holds the Prefix value in the "All In One" tab.
- **`generateItemCode(prefix, count)`**: The function in `inventory.component.ts` that produces codes like `HVAC0001` from a prefix and sequence number.
- **`<datalist>`**: Native HTML element providing browser-native autocomplete suggestions with limited UX control.
- **Combobox pattern**: The custom dropdown pattern already used in `purchase-order.component.ts` and `quotation.component.ts` with focus/blur handlers, filtered options, and styled dropdown panels.

## Bug Details

### Bug Condition

The bugs manifest in four distinct scenarios within the Inventory "Create Type or Products" drawer and the application navigation:

**Bug 1 — Item Code not reactive**: When a user types or changes the Prefix in the "All In One" tab, the Item Code fields for product items remain empty (showing only "Auto-generated" placeholder) until form submission. The `allInOneProductTypePrefix` value is only consumed at submit time in `submitCreationForm()`.

**Bug 2 — Product Type uses datalist**: When a user interacts with the Product Type field in the "Add Product" tab, the system renders `<input type="text" list="productTypeNames">` with a `<datalist>` element, providing no filtering feedback, no highlighted matches, and inconsistent cross-browser behavior.

**Bug 3 — Brand Name uses datalist**: When a user interacts with the Brand Name field in the "Add Product" tab, the system renders `<input type="text" list="brandNames">` with a `<datalist>` element, with the same UX limitations.

**Bug 4 — Material Inventory exists**: The Material Inventory page is accessible via navigation and route but is no longer needed.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserInteraction
  OUTPUT: boolean
  
  RETURN (input.action == 'PREFIX_CHANGE' 
          AND input.tab == 'all-in-one' 
          AND input.productItems.length > 0
          AND itemCodeFieldsNotUpdated(input.productItems))
         OR (input.action == 'FIELD_FOCUS' 
             AND input.tab == 'product-capacity'
             AND input.fieldName IN ['productType', 'brandName']
             AND rendersAsDatalist(input.fieldElement))
         OR (input.action == 'NAVIGATE' 
             AND input.targetRoute == '/users/material-inventory')
END FUNCTION
```

### Examples

- User types "HVAC" in Prefix field with 3 product items → Item Code fields remain empty showing "Auto-generated" placeholder (expected: "HVAC0001", "HVAC0002", "HVAC0003")
- User changes Prefix from "HVAC" to "ELEC" with 2 items → Item Code fields still show nothing (expected: "ELEC0001", "ELEC0002")
- User adds a 4th product item after entering Prefix "HVAC" → new item's Item Code is empty (expected: "HVAC0004")
- User clicks Product Type field in "Add Product" tab → native browser datalist appears with no filtering highlight (expected: styled dropdown with real-time filtering)
- User types "HV" in Brand Name field → datalist shows all options without highlighting matches (expected: filtered dropdown showing only brands containing "HV")
- User navigates to Material Inventory → page loads (expected: page/route should not exist)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Manual item code entry in the "All In One" tab must continue to be preserved (not overwritten by auto-generation)
- Form submission logic for creating product types and products must continue to work correctly
- Type-to-create behavior for Brand Name (entering a new brand that doesn't exist) must continue to work
- Type-to-create behavior for Product Type (entering a new type that doesn't exist) must continue to work
- The "Product Type" standalone tab must continue to function as before
- Bulk Upload CSV feature must continue to function as before
- Folder tree, product details, capacity management, serial numbers, and land costing features must remain unchanged
- The `generateItemCode()` function logic must remain unchanged

**Scope:**
All inputs that do NOT involve: (a) the Prefix field in "All In One" tab with product items present, (b) the Product Type/Brand Name fields in "Add Product" tab, or (c) navigation to Material Inventory should be completely unaffected by this fix. This includes:
- Mouse clicks on other form fields
- Product Type standalone tab interactions
- Bulk upload operations
- Folder tree navigation and product selection
- Serial number management
- Land costing report interactions

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing reactive binding for Item Code (Bug 1)**: The `allInOneProductTypePrefix` field uses `[(ngModel)]` but there is no `(ngModelChange)` handler that propagates prefix changes to the `allInOneProductItems[].itemCode` fields. The `generateItemCode()` function is only called at submission time in `submitCreationForm()`, not reactively when the prefix changes.

2. **Native datalist for Product Type (Bug 2)**: The "Add Product" tab template uses `<input type="text" list="productTypeNames">` with a `<datalist id="productTypeNames">` element. This relies on browser-native autocomplete which provides no filtering feedback, no match highlighting, and inconsistent behavior across browsers.

3. **Native datalist for Brand Name (Bug 3)**: Similarly, the Brand Name field uses `<input type="text" list="brandNames">` with a `<datalist id="brandNames">` element, suffering from the same UX limitations.

4. **Material Inventory page still exists (Bug 4)**: The route definition in `app.routes.ts`, the navigation entry in `app-sidebar.component.ts`, the component files in `pages/material-inventory/`, and the service file `material-inventory.service.ts` all still exist despite the feature being deprecated.

## Correctness Properties

Property 1: Bug Condition - Reactive Item Code Generation

_For any_ input where the user enters or changes the Prefix in the "All In One" tab AND product items exist, the fixed component SHALL reactively compute and display the auto-generated Item Code (pattern `<PREFIX>0001`, `<PREFIX>0002`, etc.) in each product item's Item Code field immediately, without requiring form submission.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - Searchable Dropdown for Product Type and Brand

_For any_ input where the user focuses or types in the Product Type or Brand Name field in the "Add Product" tab, the fixed component SHALL render a styled searchable dropdown panel that filters options in real-time as the user types, replacing the native `<datalist>` element.

**Validates: Requirements 2.3, 2.4**

Property 3: Bug Condition - Material Inventory Removal

_For any_ navigation attempt to the Material Inventory route, the fixed application SHALL NOT render the Material Inventory page, and the route and navigation entry SHALL NOT exist.

**Validates: Requirements 2.5**

Property 4: Preservation - Manual Item Code Override

_For any_ product item where the user has manually typed a custom Item Code in the "All In One" tab, the fixed component SHALL preserve that manually entered value and NOT overwrite it with auto-generated codes when the Prefix changes.

**Validates: Requirements 3.1, 3.2**

Property 5: Preservation - Type-to-Create Behavior

_For any_ input where the user types a brand name or product type that does not exist in the options list, the fixed component SHALL continue to allow entering that new value (type-to-create behavior preserved).

**Validates: Requirements 3.3, 3.4**

Property 6: Preservation - Unrelated Features Unchanged

_For any_ interaction with the folder tree, product details, capacity management, serial numbers, bulk upload, or the standalone "Product Type" tab, the fixed code SHALL produce exactly the same behavior as the original code.

**Validates: Requirements 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/app/pages/inventory/inventory.component.ts`

**Function**: Prefix change handler + form template bindings

**Specific Changes**:

1. **Add reactive prefix change handler (Bug 1)**:
   - Add an `onAllInOnePrefixChange()` method that iterates over `allInOneProductItems` and sets `item.itemCode` to `generateItemCode(prefix, index + 1)` for each item where `item.itemCode` is empty or was previously auto-generated.
   - Track which item codes are "auto-generated" vs "manually entered" using a flag or by comparing against the expected generated pattern.
   - Bind `(ngModelChange)="onAllInOnePrefixChange()"` to the Prefix input field in the template.

2. **Update `addAllInOneProductItem()` to pre-fill item code (Bug 1)**:
   - When adding a new product item, if `allInOneProductTypePrefix` is non-empty, immediately set the new item's `itemCode` to `generateItemCode(prefix, items.length + 1)`.

3. **Replace Product Type datalist with combobox (Bug 2)**:
   - In the "Add Product" (`product-capacity`) section of the template, replace `<input type="text" list="productTypeNames">` with a custom combobox pattern.
   - Add `productTypeSearch` string, `isProductTypeDropdownOpen` boolean, and `filteredProductTypeOptions` computed array to the component.
   - Add `onProductTypeComboboxFocus()`, `onProductTypeComboboxBlur()`, and `onProductTypeSearchChange()` methods.
   - Render a positioned dropdown panel below the input showing filtered results.

4. **Replace Brand Name datalist with combobox (Bug 3)**:
   - In each product item row of the "Add Product" section, replace `<input type="text" list="brandNames">` with a custom combobox pattern.
   - Add `brandSearchByItem` object, `isBrandDropdownOpenByItem` object, and `filteredBrandOptionsByItem` computed arrays.
   - Add `onBrandComboboxFocus(index)`, `onBrandComboboxBlur(index)`, and `onBrandSearchChange(index)` methods.
   - Render a positioned dropdown panel below each brand input showing filtered results.

5. **Remove Material Inventory (Bug 4)**:
   - Remove the route entry from `app.routes.ts` (`path: 'material-inventory'`).
   - Remove the navigation entry from `app-sidebar.component.ts` (the "Material Inventory" menu item).
   - Remove the `material-inventory` key from `rbac.service.ts` route-to-permission mapping.
   - Remove the signin redirect entry for `material_inventory` from `signin-form.component.ts`.
   - Delete the component files: `pages/material-inventory/material-inventory.component.ts` and `.html`.
   - Evaluate whether `material-inventory.service.ts` is still needed by `sales-order-materials` (it is — keep the service but remove the page).

**File**: `frontend/src/app/pages/inventory/inventory.component.html`

**Specific Changes**:
- Add `(ngModelChange)="onAllInOnePrefixChange()"` to the Prefix input in the "All In One" section.
- Replace `<datalist>` + `list` attribute pattern for Product Type with custom dropdown markup.
- Replace `<datalist>` + `list` attribute pattern for Brand Name with custom dropdown markup.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write component tests that simulate user interactions with the Prefix field, Product Type field, and Brand Name field. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Prefix Change Test**: Set `allInOneProductTypePrefix` to "HVAC" and verify `allInOneProductItems[0].itemCode` updates (will fail on unfixed code)
2. **Prefix Change with Multiple Items**: Set prefix and verify all items get sequential codes (will fail on unfixed code)
3. **Product Type Dropdown Test**: Focus the Product Type field and verify a styled dropdown panel appears (will fail on unfixed code — datalist renders instead)
4. **Brand Name Dropdown Test**: Focus the Brand Name field and verify a styled dropdown panel appears (will fail on unfixed code — datalist renders instead)
5. **Material Inventory Route Test**: Navigate to `/users/material-inventory` and verify it does not load (will fail on unfixed code — page loads)

**Expected Counterexamples**:
- Item Code fields remain empty after prefix change because no reactive handler exists
- Product Type and Brand fields render native `<datalist>` elements instead of custom dropdowns
- Material Inventory page loads successfully when it should not exist

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.action == 'PREFIX_CHANGE' THEN
    result := onAllInOnePrefixChange(input.prefix)
    ASSERT allItemCodesMatchPattern(result.items, input.prefix)
  ELSE IF input.action == 'FIELD_FOCUS' AND input.fieldName == 'productType' THEN
    result := renderProductTypeField()
    ASSERT result.hasStyledDropdown AND result.filtersOnType
  ELSE IF input.action == 'FIELD_FOCUS' AND input.fieldName == 'brandName' THEN
    result := renderBrandNameField()
    ASSERT result.hasStyledDropdown AND result.filtersOnType
  ELSE IF input.action == 'NAVIGATE' AND input.targetRoute == '/users/material-inventory' THEN
    ASSERT routeNotFound(input.targetRoute)
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for manual item code entry, form submission, type-to-create, and other features, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Manual Item Code Preservation**: Verify that manually entered item codes are NOT overwritten when prefix changes
2. **Form Submission Preservation**: Verify that submitting the "All In One" form still creates products with correct item codes on the backend
3. **Type-to-Create Preservation**: Verify that entering a non-existing brand/product type in the new combobox still allows creating new entries
4. **Folder Tree Preservation**: Verify that folder tree navigation and product selection continue to work
5. **Bulk Upload Preservation**: Verify that CSV bulk upload continues to function

### Unit Tests

- Test `onAllInOnePrefixChange()` generates correct codes for various prefix values and item counts
- Test that manually entered item codes are not overwritten by the reactive handler
- Test that adding a new item when prefix exists pre-fills the item code
- Test that clearing the prefix clears auto-generated codes but preserves manual ones
- Test combobox filtering logic for Product Type (case-insensitive, partial match)
- Test combobox filtering logic for Brand Name (case-insensitive, partial match)
- Test that type-to-create still works with the new combobox (value not in options list is accepted)

### Property-Based Tests

- Generate random prefix strings and item counts, verify all auto-generated codes follow `<PREFIX><4-digit-sequence>` pattern
- Generate random sequences of prefix changes and manual edits, verify manual edits are never overwritten
- Generate random search strings for Product Type combobox, verify filtered results are a subset of all options and contain the search string
- Generate random search strings for Brand Name combobox, verify filtered results are correct
- Generate random form states and verify submission payload matches expected structure

### Integration Tests

- Test full "All In One" flow: enter prefix → add items → verify codes appear → change prefix → verify codes update → manually edit one → change prefix again → verify manual edit preserved
- Test full "Add Product" flow: focus Product Type → type partial text → select from dropdown → verify value set
- Test full "Add Product" flow: focus Brand Name → type partial text → select from dropdown → verify value set
- Test that Material Inventory route returns 404 or redirects after removal
- Test that sidebar navigation no longer shows Material Inventory link
