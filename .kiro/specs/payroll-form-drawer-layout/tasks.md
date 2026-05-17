# Implementation Plan: Payroll Form Drawer Layout

## Overview

Convert the Add Employee modal and Edit Employee inline form into consistent right-side drawer panels with a 6-column CSS grid layout for form fields. All changes are confined to the `payroll.component.html` template — no TypeScript, service, or data model changes are required.

## Tasks

- [x] 1. Replace Add Employee modal with drawer
  - [x] 1.1 Replace the Add Employee fixed overlay modal with a drawer container
    - Remove the existing centered modal markup (the `*ngIf="showAddEmployeeForm"` block with the centered card)
    - Replace with the drawer structure: fixed container (`fixed inset-0 z-[100010]`), backdrop (`absolute inset-0 bg-black/50` with `(click)="closeAddEmployeeForm()"`), and drawer panel (`absolute inset-y-0 right-0 w-full sm:max-w-[600px]`)
    - Add the fixed header with title "Add Employee" and close button (X icon) that calls `closeAddEmployeeForm()`
    - Add the scrollable body wrapper (`flex-1 overflow-y-auto px-6 py-5`)
    - Add the fixed footer with "Cancel" button (calls `closeAddEmployeeForm()`) and "Save Employee" submit button (calls `submitAddEmployee()`)
    - Preserve the existing `*ngIf="showAddEmployeeForm"` conditional rendering
    - Preserve the existing `isAddEmployeeSubmitting` loading state on the submit button (show "Saving..." when submitting, disable button)
    - Preserve the existing `addEmployeeApiError` banner display above the form
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.7, 1.9, 4.1, 4.3, 4.5_

  - [x] 1.2 Implement the 6-column form grid for the Add Employee drawer body
    - Inside the scrollable body, create a grid container with classes `grid grid-cols-1 sm:grid-cols-6 gap-4`
    - Row 1: Full Name (`sm:col-span-3`) and Department (`sm:col-span-3`)
    - Row 2: Position (`sm:col-span-3`) and Base Salary (`sm:col-span-3`)
    - Row 3: Project (`sm:col-span-3`, left-aligned)
    - Row 4: Pag-Ibig (`sm:col-span-2`), Philhealth (`sm:col-span-2`), SSS (`sm:col-span-2`)
    - Row 5: Contact Number (`sm:col-span-6`, full width)
    - Row 6: Address (`sm:col-span-6`, full width)
    - Preserve all existing `[(ngModel)]` bindings, field labels, input types, and validation error displays
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.3_

- [x] 2. Replace Edit Employee inline form with drawer
  - [x] 2.1 Remove the inline Edit Employee form panel from the right content area
    - Locate the existing `*ngIf="showEditEmployeeForm"` block that renders inside the employee detail section (below the employee heading in the right content area)
    - Remove this entire inline form block from its current location
    - _Requirements: 6.1, 6.2_

  - [x] 2.2 Create the Edit Employee drawer structure
    - Add a new drawer block (same structure as Add Employee drawer) controlled by `*ngIf="showEditEmployeeForm"`
    - Use the same container, backdrop, and panel classes as the Add Employee drawer
    - Backdrop click calls `closeEditEmployeeForm()`
    - Fixed header with title "Edit Employee" and close button (X icon) calling `closeEditEmployeeForm()`
    - Scrollable body wrapper (`flex-1 overflow-y-auto px-6 py-5`)
    - Fixed footer with "Cancel" button (calls `closeEditEmployeeForm()`) and "Save Changes" submit button (calls `submitEditEmployee()`)
    - Preserve the existing `isEditSubmitting` loading state on the submit button (show "Saving..." when submitting, disable button)
    - Preserve the existing `editErrors.general` error banner display above the form
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.8, 1.9, 4.2, 4.4, 4.5_

  - [x] 2.3 Implement the 6-column form grid for the Edit Employee drawer body
    - Inside the scrollable body, create a grid container with classes `grid grid-cols-1 sm:grid-cols-6 gap-4`
    - Row 1: Full Name (`sm:col-span-3`) and Department (`sm:col-span-3`)
    - Row 2: Position (`sm:col-span-3`) and Base Salary (`sm:col-span-3`)
    - Row 3: Project (`sm:col-span-3`, left-aligned)
    - Row 4: Pag-Ibig (`sm:col-span-2`), Philhealth (`sm:col-span-2`), SSS (`sm:col-span-2`)
    - Row 5: Contact Number (`sm:col-span-6`, full width)
    - Row 6: Address (`sm:col-span-6`, full width)
    - Preserve all existing `[(ngModel)]` bindings for edit fields (`editFullName`, `editPosition`, etc.), field labels, input types, and validation error displays
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.3_

- [x] 3. Ensure responsive behavior
  - [x] 3.1 Verify responsive classes on both drawers
    - Confirm both drawer panels use `w-full sm:max-w-[600px]` so they go full-width on mobile and capped at 600px on larger screens
    - Confirm both form grids use `grid-cols-1 sm:grid-cols-6` so fields stack on mobile and use the multi-column layout on desktop
    - Confirm all field col-span classes are prefixed with `sm:` so they only apply above the 640px breakpoint
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 4. Checkpoint - Verify template compiles and forms function
  - Ensure the Angular template compiles without errors (run `ng build` or check IDE diagnostics)
  - Verify Add Employee drawer opens, form submits, and closes correctly
  - Verify Edit Employee drawer opens with pre-populated data, form submits, and closes correctly
  - Verify backdrop click closes both drawers
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All changes are confined to `frontend/src/app/payroll/payroll.component.html` — no TypeScript changes needed
- Existing state flags (`showAddEmployeeForm`, `showEditEmployeeForm`) and methods are reused as-is
- No new dependencies are required
- The design explicitly states property-based testing is not applicable (pure UI/CSS change)
- CSS animation uses Tailwind `transform transition-transform duration-300 ease-in-out` classes
- The `z-[100010]` z-index ensures the drawer appears above all other page elements
- Checkpoints ensure incremental validation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] }
  ]
}
```
