# Implementation Plan

## Overview

This task list implements the bugfix for four inventory form defects using the exploratory bugfix workflow: (1) write exploration tests to confirm bugs exist, (2) write preservation tests to capture baseline behavior, (3) implement the fix, (4) validate all tests pass.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Inventory Form Defects (Reactive Item Code, Datalist Fields, Material Inventory Route)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the four bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug:
    - Bug 1: Set `allInOneProductTypePrefix` to any non-empty string (e.g., "HVAC") with product items present → assert `allInOneProductItems[i].itemCode` equals `generateItemCode(prefix, i+1)` immediately (without form submission)
    - Bug 2: Focus the Product Type field in "Add Product" tab → assert a styled dropdown panel element is rendered (not a native `<datalist>`)
    - Bug 3: Focus the Brand Name field in "Add Product" tab → assert a styled dropdown panel element is rendered (not a native `<datalist>`)
    - Bug 4: Check route configuration → assert no route exists for path `material-inventory`
  - From Bug Condition in design: `isBugCondition(input)` returns true when `input.action == 'PREFIX_CHANGE' AND input.tab == 'all-in-one' AND input.productItems.length > 0 AND itemCodeFieldsNotUpdated(input.productItems)` OR `input.action == 'FIELD_FOCUS' AND input.fieldName IN ['productType', 'brandName'] AND rendersAsDatalist(input.fieldElement)` OR `input.action == 'NAVIGATE' AND input.targetRoute == '/users/material-inventory'`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - Item Code fields remain empty after prefix change (no reactive handler)
    - Product Type renders `<datalist>` instead of styled dropdown
    - Brand Name renders `<datalist>` instead of styled dropdown
    - Material Inventory route resolves successfully
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Manual Item Code Override, Type-to-Create, and Unrelated Features
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: Manually entering an item code in "All In One" tab preserves the value across form interactions
    - Observe: Typing a non-existing brand name in "Add Product" tab allows the value to be submitted (type-to-create)
    - Observe: Typing a non-existing product type in "Add Product" tab allows the value to be submitted (type-to-create)
    - Observe: Form submission with valid prefix and items creates products with correct item codes
    - Observe: "Product Type" standalone tab continues to function independently
    - Observe: Bulk Upload CSV feature continues to function
    - Observe: Folder tree, product details, capacity management, serial numbers remain unchanged
  - Write property-based tests capturing observed behavior patterns:
    - Property: For all manually entered item codes, the value is never overwritten by auto-generation logic (from Preservation Requirements 3.1)
    - Property: For all non-existing brand name inputs, the combobox/field accepts the value without blocking (from Preservation Requirements 3.3)
    - Property: For all non-existing product type inputs, the field accepts the value without blocking (from Preservation Requirements 3.4)
    - Property: For all form submissions with valid data, the payload structure matches expected format (from Preservation Requirements 3.2)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for Inventory Form Defects

  - [x] 3.1 Implement reactive Item Code auto-generation (Bug 1)
    - Add `onAllInOnePrefixChange()` method to `inventory.component.ts` that iterates over `allInOneProductItems` and sets `item.itemCode = generateItemCode(prefix, index + 1)` for items that are auto-generated (not manually entered)
    - Track which item codes are "auto-generated" vs "manually entered" using a flag or pattern comparison
    - Bind `(ngModelChange)="onAllInOnePrefixChange()"` to the Prefix input in the "All In One" section of the template
    - Update `addAllInOneProductItem()` to pre-fill item code when prefix is non-empty
    - Handle prefix clearing: clear auto-generated codes but preserve manual ones
    - _Bug_Condition: isBugCondition(input) where input.action == 'PREFIX_CHANGE' AND input.tab == 'all-in-one' AND input.productItems.length > 0_
    - _Expected_Behavior: allItemCodesMatchPattern(items, prefix) — each auto-generated item code follows `<PREFIX><4-digit-sequence>` pattern immediately on prefix change_
    - _Preservation: Manual item code entries are never overwritten (Requirements 3.1); form submission logic unchanged (Requirements 3.2)_
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [x] 3.2 Replace Product Type datalist with searchable dropdown (Bug 2)
    - In `inventory.component.html`, replace `<input type="text" list="productTypeNames">` and `<datalist id="productTypeNames">` with custom combobox markup following the pattern from `purchase-order.component.ts`
    - Add `productTypeSearch` string, `isProductTypeDropdownOpen` boolean, and `filteredProductTypeOptions` array to `inventory.component.ts`
    - Add `onProductTypeComboboxFocus()`, `onProductTypeComboboxBlur()`, `onProductTypeSearchChange()`, and `onProductTypeSelect(option)` methods
    - Render a positioned dropdown panel below the input showing filtered results with highlighted matches
    - Ensure type-to-create still works (value not in options list is accepted on blur/submit)
    - _Bug_Condition: isBugCondition(input) where input.action == 'FIELD_FOCUS' AND input.fieldName == 'productType' AND rendersAsDatalist(input.fieldElement)_
    - _Expected_Behavior: result.hasStyledDropdown AND result.filtersOnType — styled dropdown panel appears with real-time filtering_
    - _Preservation: Type-to-create behavior preserved (Requirements 3.4); standalone Product Type tab unchanged (Requirements 3.5)_
    - _Requirements: 2.3, 3.4, 3.5_

  - [x] 3.3 Replace Brand Name datalist with searchable dropdown (Bug 3)
    - In `inventory.component.html`, replace `<input type="text" list="brandNames">` and `<datalist id="brandNames">` with custom combobox markup
    - Add `brandSearchByItem` map, `isBrandDropdownOpenByItem` map, and `filteredBrandOptionsByItem` computed arrays to `inventory.component.ts`
    - Add `onBrandComboboxFocus(index)`, `onBrandComboboxBlur(index)`, `onBrandSearchChange(index)`, and `onBrandSelect(index, option)` methods
    - Render a positioned dropdown panel below each brand input showing filtered results
    - Ensure type-to-create still works for brand names (new brand value accepted)
    - _Bug_Condition: isBugCondition(input) where input.action == 'FIELD_FOCUS' AND input.fieldName == 'brandName' AND rendersAsDatalist(input.fieldElement)_
    - _Expected_Behavior: result.hasStyledDropdown AND result.filtersOnType — styled dropdown panel appears with real-time filtering_
    - _Preservation: Type-to-create behavior preserved (Requirements 3.3); other inventory features unchanged (Requirements 3.7)_
    - _Requirements: 2.4, 3.3, 3.7_

  - [x] 3.4 Remove Material Inventory page (Bug 4)
    - Remove the route entry from `app.routes.ts` (path: `material-inventory`)
    - Remove the navigation entry from `app-sidebar.component.ts` (the "Material Inventory" menu item)
    - Remove the `material-inventory` key from `rbac.service.ts` route-to-permission mapping
    - Remove the signin redirect entry for `material_inventory` from `signin-form.component.ts`
    - Delete component files: `pages/material-inventory/material-inventory.component.ts` and `.html`
    - Keep `material-inventory.service.ts` if still used by `sales-order-materials` module
    - _Bug_Condition: isBugCondition(input) where input.action == 'NAVIGATE' AND input.targetRoute == '/users/material-inventory'_
    - _Expected_Behavior: routeNotFound(input.targetRoute) — route does not exist, navigation fails or redirects_
    - _Preservation: All other navigation routes and features unchanged (Requirements 3.7)_
    - _Requirements: 2.5, 3.7_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Inventory Form Defects Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all four bugs
    - When this test passes, it confirms:
      - Item Code fields reactively update on prefix change
      - Product Type renders as styled searchable dropdown
      - Brand Name renders as styled searchable dropdown
      - Material Inventory route no longer exists
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all four bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Manual Item Code Override, Type-to-Create, and Unrelated Features
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Manual item code entries are preserved
      - Type-to-create for brands works with new combobox
      - Type-to-create for product types works with new combobox
      - Form submission produces correct payload
      - Unrelated features are unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify bug condition exploration test passes (all four bugs resolved)
  - Verify preservation property tests pass (no behavior regressions)
  - Verify any existing unit/integration tests still pass
  - Ensure all tests pass, ask the user if questions arise


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["3.5", "3.6"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks 1 and 2 MUST be completed BEFORE any implementation in task 3
- The exploration test (task 1) is expected to FAIL on unfixed code — this confirms the bugs exist
- The preservation tests (task 2) are expected to PASS on unfixed code — this captures baseline behavior
- After implementation, re-running the exploration test (task 3.5) should PASS, confirming the fix works
- After implementation, re-running preservation tests (task 3.6) should still PASS, confirming no regressions
- For Bug 4 (Material Inventory removal), keep `material-inventory.service.ts` if it is still imported by `sales-order-materials` module
- The combobox pattern for Bugs 2 and 3 should follow the existing pattern in `purchase-order.component.ts` and `quotation.component.ts`
