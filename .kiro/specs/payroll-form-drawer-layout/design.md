# Design Document: Payroll Form Drawer Layout

## Overview

This feature converts the payroll employee forms (Add Employee and Edit Employee) from their current presentation styles — a centered modal dialog and an inline form panel — to a consistent right-side drawer (slide-in panel) layout. The drawer provides a fixed header, scrollable body with a reorganized CSS grid for form fields, and a fixed footer with action buttons. A semi-transparent backdrop dims the main content while the drawer is open.

The change is purely presentational. No data flow, API calls, validation logic, or component state management changes are required beyond the existing `showAddEmployeeForm` and `showEditEmployeeForm` boolean flags.

## Architecture

### Current State

```
┌─────────────────────────────────────────────────┐
│ PayrollComponent                                │
│                                                 │
│  Add Employee: Fixed overlay modal (inset-0)    │
│    - Centered card (max-w-lg)                   │
│    - Single-column stacked form fields          │
│    - Inline actions at bottom of form           │
│                                                 │
│  Edit Employee: Inline panel                    │
│    - Rendered inside right content area         │
│    - Below employee heading                     │
│    - 2-column grid (sm:grid-cols-2)             │
│    - Inline actions at bottom                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Target State

```
┌─────────────────────────────────────────────────┐
│ PayrollComponent                                │
│                                                 │
│  Add Employee Drawer:                           │
│    ┌──────────────────────────────────────┐     │
│    │ Backdrop (fixed inset-0, bg-black/50)│     │
│    │                    ┌────────────────┐│     │
│    │                    │ Drawer Panel   ││     │
│    │                    │ (right-0,      ││     │
│    │                    │  max-w-[600px])││     │
│    │                    │               ││     │
│    │                    │ [Header]      ││     │
│    │                    │ [Body/Grid]   ││     │
│    │                    │ [Footer]      ││     │
│    │                    └────────────────┘│     │
│    └──────────────────────────────────────┘     │
│                                                 │
│  Edit Employee Drawer: Same structure           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Design Decisions

1. **Single component, no extraction**: Both drawers remain in `PayrollComponent`'s template. The component is already large but extracting a shared drawer sub-component would require passing many form bindings and callbacks. The template-driven approach with `ngModel` makes extraction costly for minimal benefit at this stage.

2. **CSS-only animation**: The slide-in/out animation uses Tailwind's `translate-x` utilities with `transition` and `duration` classes, toggled via Angular class bindings. No `@angular/animations` dependency is needed.

3. **Shared grid pattern**: Both Add and Edit forms use an identical CSS grid structure. The grid uses Tailwind's `grid-cols-6` as the base, with fields spanning appropriate column counts to achieve the required layout.

4. **Existing state flags reused**: `showAddEmployeeForm` and `showEditEmployeeForm` continue to control drawer visibility. No new state is introduced.

## Components and Interfaces

### PayrollComponent (Modified)

No new properties or methods are required. The following existing members drive the drawer:

| Member | Type | Purpose |
|--------|------|---------|
| `showAddEmployeeForm` | `boolean` | Controls Add Employee drawer visibility |
| `showEditEmployeeForm` | `boolean` | Controls Edit Employee drawer visibility |
| `openAddEmployeeForm()` | `void` | Sets `showAddEmployeeForm = true` |
| `closeAddEmployeeForm()` | `void` | Sets `showAddEmployeeForm = false` |
| `openEditEmployeeForm()` | `void` | Populates edit fields, sets `showEditEmployeeForm = true` |
| `closeEditEmployeeForm()` | `void` | Sets `showEditEmployeeForm = false` |
| `submitAddEmployee()` | `Promise<void>` | Validates and submits add form |
| `submitEditEmployee()` | `Promise<void>` | Validates and submits edit form |

### Drawer Template Structure

Each drawer follows this DOM structure:

```html
<!-- Backdrop + Drawer Container -->
<div class="fixed inset-0 z-[100010]">
  <!-- Backdrop (click to close) -->
  <div class="absolute inset-0 bg-black/50" (click)="closeForm()"></div>

  <!-- Drawer Panel -->
  <div class="absolute inset-y-0 right-0 w-full sm:max-w-[600px] flex flex-col bg-white dark:bg-gray-900 shadow-xl
              transform transition-transform duration-300 ease-in-out translate-x-0">

    <!-- Fixed Header -->
    <div class="flex items-center justify-between border-b px-6 py-4">
      <h3>Title</h3>
      <button (click)="closeForm()">X</button>
    </div>

    <!-- Scrollable Body -->
    <div class="flex-1 overflow-y-auto px-6 py-5">
      <!-- Form Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <!-- Fields with col-span classes -->
      </div>
    </div>

    <!-- Fixed Footer -->
    <div class="flex items-center justify-end gap-3 border-t px-6 py-4">
      <button>Cancel</button>
      <button>Submit</button>
    </div>
  </div>
</div>
```

### Form Grid Layout (6-column base)

| Row | Fields | Column Spans |
|-----|--------|-------------|
| 1 | Full Name, Department | `sm:col-span-3`, `sm:col-span-3` |
| 2 | Position, Base Salary | `sm:col-span-3`, `sm:col-span-3` |
| 3 | Project | `sm:col-span-3` (left-aligned, right half empty) |
| 4 | Pag-Ibig, Philhealth, SSS | `sm:col-span-2`, `sm:col-span-2`, `sm:col-span-2` |
| 5 | Contact Number | `sm:col-span-6` (full width) |
| 6 | Address | `sm:col-span-6` (full width) |

On viewports below 640px (`sm` breakpoint), all fields use `col-span-1` in a single-column grid (`grid-cols-1`), stacking vertically.

## Data Models

No data model changes are required. The feature is purely presentational. All existing interfaces (`PayrollEmployee`, `AddEmployeeErrors`, etc.) remain unchanged.

The form fields and their bindings remain identical:

**Add Employee Form Bindings:**
- `addEmployeeFullName`, `addEmployeePosition`, `addEmployeeProjectId`, `addEmployeeBaseSalary`
- `addEmployeeDepartment`, `addEmployeePagIbig`, `addEmployeePhilhealth`, `addEmployeeSss`
- `addEmployeeContactNumber`, `addEmployeeAddress`

**Edit Employee Form Bindings:**
- `editFullName`, `editPosition`, `editProjectId`, `editBaseSalary`
- `editEmployeeDepartment`, `editEmployeePagIbig`, `editEmployeePhilhealth`, `editEmployeeSss`
- `editEmployeeContactNumber`, `editEmployeeAddress`

## Error Handling

No changes to error handling logic. The existing validation and API error display patterns are preserved:

- **Field-level validation errors**: Displayed below each field using the existing `addEmployeeErrors` / `editErrors` objects
- **API errors**: Displayed as a banner inside the drawer body (above the form grid), using the existing `addEmployeeApiError` / `editErrors.general` strings
- **Submit button disabled state**: The existing `isAddEmployeeSubmitting` / `isEditSubmitting` flags disable the submit button and show "Saving..." text

## Testing Strategy

Since this feature is purely a UI layout/presentation change (converting modals to drawers and rearranging CSS grid), property-based testing is not applicable. The feature involves:
- DOM structure changes (no logic to vary with input)
- CSS class application (deterministic, not input-dependent)
- Animation transitions (visual, not computable)

**Recommended testing approach:**

### Manual Visual Testing
- Verify drawer slides in from right on both Add and Edit triggers
- Verify backdrop appears and dims content
- Verify clicking backdrop closes drawer
- Verify clicking X button closes drawer
- Verify form grid layout matches specification at desktop widths
- Verify responsive stacking at mobile widths (< 640px)
- Verify scrolling works when form content exceeds viewport height
- Verify header and footer remain fixed during scroll

### Example-Based Unit Tests (Optional)
- Test that `openAddEmployeeForm()` sets `showAddEmployeeForm = true`
- Test that `closeAddEmployeeForm()` sets `showAddEmployeeForm = false`
- Test that `openEditEmployeeForm()` populates edit fields from `selectedEmployee`
- Test that clicking backdrop triggers close method (component test with TestBed)

### Integration Smoke Test
- Verify the component compiles and renders without errors after template changes
- Verify form submission still works end-to-end (no regression from layout change)

**Why PBT does not apply:** This feature modifies HTML template structure and CSS classes. There are no pure functions with varying inputs, no data transformations, and no business logic changes. The behavior is deterministic and visual — either the drawer renders correctly or it doesn't. Snapshot testing or visual regression testing would be more appropriate than property-based testing for validating the layout.
