# Implementation Plan: Payroll Module

## Overview

This plan implements the Payroll Module for the Bagama HVAC system, covering database schema creation, RBAC permission migration, NestJS backend (module, controller, service, DTOs), and the Angular standalone frontend component. Each task builds incrementally, starting with the database layer, then backend API, and finally the frontend UI.

## Tasks

- [x] 1. Database schema and RBAC migration
  - [x] 1.1 Create the payroll database migration SQL file
    - Create `backend/sql/supabase/20260501_payroll_module.sql`
    - Include `tblpayroll_employees`, `tblpayroll_cutoffs`, and `tblpayroll_records` table definitions with all constraints, foreign keys, and indexes as specified in the design
    - Include the unique constraint on (employee_id, cutoff_id) in `tblpayroll_records`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 1.2 Create the RBAC permission migration SQL file
    - Create `backend/sql/supabase/20260501_payroll_rbac_permissions.sql`
    - Insert all payroll permission keys (`payroll.view`, `payroll.employee.create`, `payroll.employee.edit`, `payroll.employee.delete`, `payroll.create`, `payroll.cutoff.view`) into `auth_permission_keys`
    - Insert the `payroll` menu entry into `auth_menus` with route `/payroll`, icon `payments`, sort_order 55
    - Assign all payroll permissions to superadmin, admin, and Business Owner roles
    - Use `ON CONFLICT DO NOTHING` for idempotency
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 1.3 Write property test for migration idempotency
    - **Property 9: Migration idempotency**
    - **Validates: Requirements 10.5**

- [x] 2. Backend payroll module setup and employee endpoints
  - [x] 2.1 Create the payroll NestJS module structure
    - Create `backend/src/payroll/payroll.module.ts` importing `DatabaseModule`
    - Create `backend/src/payroll/payroll.controller.ts` with `JwtAuthGuard` and `PermissionGuard`
    - Create `backend/src/payroll/payroll.service.ts` with Supabase client injection
    - Create DTO files: `backend/src/payroll/dto/create-employee.dto.ts`, `update-employee.dto.ts`, `create-cutoff.dto.ts`
    - Register `PayrollModule` in `app.module.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.8_

  - [x] 2.2 Implement GET /payroll/employees endpoint
    - Implement the service method to query `tblpayroll_employees` with optional position and project_id filters
    - Add query parameter handling in the controller
    - Return response in `{ success: true, data: [...] }` format
    - _Requirements: 9.1, 2.3, 2.4, 2.5_

  - [x] 2.3 Implement POST /payroll/employees endpoint
    - Implement `CreateEmployeeDto` with class-validator decorators (IsNotEmpty, IsPositive, IsOptional)
    - Implement the service method to insert into `tblpayroll_employees`
    - Protect with `@Permissions('payroll.employee.create')` decorator
    - Return the created employee record
    - _Requirements: 9.2, 4.2, 4.3_

  - [x] 2.4 Implement PATCH /payroll/employees/:id endpoint
    - Implement `UpdateEmployeeDto` with optional fields and validation
    - Implement the service method to update `tblpayroll_employees` by id
    - Protect with `@Permissions('payroll.employee.edit')` decorator
    - Set `updated_at` timestamp on update
    - _Requirements: 9.3, 6.2, 6.3_

  - [x]* 2.5 Write property test for employee creation round-trip
    - **Property 2: Employee creation round-trip**
    - **Validates: Requirements 4.2, 9.2**

  - [x]* 2.6 Write property test for employee form validation
    - **Property 3: Employee form validation rejects invalid input**
    - **Validates: Requirements 4.3, 6.3**

  - [x]* 2.7 Write property test for employee update round-trip
    - **Property 4: Employee update round-trip**
    - **Validates: Requirements 6.2, 9.3**

- [x] 3. Checkpoint - Ensure employee endpoints work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend payroll summary and cutoff endpoints
  - [x] 4.1 Implement GET /payroll/employees/:id/summary endpoint
    - Query `tblpayroll_records` for the given employee_id
    - Compute `generatedPayrollCount` (COUNT), `currentPayout` (most recent payout_amount by generated_at), and `totalPayout` (SUM of payout_amount)
    - Protect with `@Permissions('payroll.view')` decorator
    - _Requirements: 9.4, 5.3_

  - [x] 4.2 Implement GET /payroll/employees/:id/cutoffs endpoint
    - Query `tblpayroll_records` joined with `tblpayroll_cutoffs` for the given employee_id
    - Return cutoff list with date ranges
    - Protect with `@Permissions('payroll.view')` decorator
    - _Requirements: 9.5, 5.4_

  - [x] 4.3 Implement POST /payroll/cutoffs endpoint
    - Implement `CreateCutoffDto` with validation (dates, non-empty employeeIds array)
    - Check for overlapping cutoff periods for the same employees using the unique constraint and date range logic
    - Insert into `tblpayroll_cutoffs` and create `tblpayroll_records` for each employee with `base_salary_used` from current employee salary
    - Protect with `@Permissions('payroll.create')` decorator
    - Return 409 on overlap conflict
    - _Requirements: 9.6, 7.2, 7.3, 7.4_

  - [x] 4.4 Implement GET /payroll/cutoffs/:id endpoint
    - Query `tblpayroll_cutoffs` joined with `tblpayroll_records` and employee names
    - Return cutoff detail with all associated records
    - Protect with `@Permissions('payroll.cutoff.view')` decorator
    - _Requirements: 9.7, 8.1_

  - [x]* 4.5 Write property test for summary computation correctness
    - **Property 5: Summary computation correctness**
    - **Validates: Requirements 5.3, 9.4**

  - [x]* 4.6 Write property test for payroll generation correctness
    - **Property 6: Payroll generation correctness**
    - **Validates: Requirements 7.2, 7.3, 9.6**

  - [x]* 4.7 Write property test for cutoff overlap rejection
    - **Property 7: Cutoff overlap rejection**
    - **Validates: Requirements 7.4, 11.4**

  - [x]* 4.8 Write property test for cutoff detail retrieval correctness
    - **Property 10: Cutoff detail retrieval correctness**
    - **Validates: Requirements 8.1, 9.7**

- [x] 5. Checkpoint - Ensure all backend endpoints work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend permission enforcement
  - [x] 6.1 Verify permission guard integration on all payroll endpoints
    - Ensure all controller methods have the correct `@Permissions()` decorator
    - Verify `JwtAuthGuard` and `PermissionGuard` are applied at the controller level
    - Test that unauthenticated requests return 401 and unauthorized requests return 403
    - _Requirements: 9.8, 1.2_

  - [x]* 6.2 Write property test for permission enforcement
    - **Property 8: Permission enforcement**
    - **Validates: Requirements 9.8**

- [x] 7. Frontend payroll component - layout and employee list
  - [x] 7.1 Create the PayrollComponent standalone component
    - Create `frontend/src/app/payroll/payroll.component.ts` as a standalone component
    - Implement the two-column grid layout: sidebar (340px) + content area
    - Import `CommonModule`, `FormsModule`, `PageBreadcrumbComponent`
    - Add page header with "Payroll Reports" title
    - Add Position_Filter and Project_Filter dropdowns in the header
    - _Requirements: 1.1, 1.3, 2.1, 2.2_

  - [x] 7.2 Implement the employee list sidebar
    - Render the tree-view sidebar panel with employee entries showing full name
    - Implement Smart_Search input at the top of the sidebar for real-time name filtering
    - Implement click-to-select behavior marking the active employee
    - Display placeholder message when no employees match filters/search
    - Wire up Position_Filter and Project_Filter to filter the employee list
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.3, 2.4, 2.5, 2.6_

  - [x]* 7.3 Write property test for employee filtering correctness
    - **Property 1: Employee filtering correctness**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 3.3**

- [x] 8. Frontend payroll component - content section and forms
  - [x] 8.1 Implement the employee content section
    - Display selected employee name as heading
    - Display "Settings" button (edit action) conditionally based on `payroll.employee.edit` permission
    - Display three summary cards: Generated Payroll Count, Current Payout, Total Payout
    - Display the list of payroll cutoff entries with date range and "View" button
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.2 Implement the Add Employee form
    - Create form with fields: full name, position, project (dropdown), base salary
    - Add client-side validation (required fields, positive salary)
    - Display validation errors next to invalid fields
    - Submit via POST /payroll/employees and refresh the employee list on success
    - Conditionally show "Add Employee" button based on `payroll.employee.create` permission
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 8.3 Implement the Edit Employee form
    - Pre-populate form with current employee data
    - Submit via PATCH /payroll/employees/:id and refresh data on success
    - Display validation errors on invalid input
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.4 Implement the Create Payroll form
    - Create form with cutoff start date, end date, and employee multi-select
    - Validate date range (end >= start) and non-empty employee selection
    - Submit via POST /payroll/cutoffs
    - Handle 409 overlap error and display conflict message
    - Update summary cards and cutoff list on success
    - Conditionally show "Create Payroll" button based on `payroll.create` permission
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.5 Implement the View Payroll Cutoff detail
    - Display cutoff detail in a modal or expanded section
    - Show cutoff date range, each employee's base_salary_used, payout_amount, and generation date
    - Fetch data via GET /payroll/cutoffs/:id
    - _Requirements: 8.1, 8.2_

- [x] 9. Frontend routing and navigation integration
  - [x] 9.1 Register the payroll route and navigation
    - Add `/payroll` route to the Angular routing configuration with `rbacGuard`
    - Add the payroll menu item to the sidebar navigation, conditionally rendered based on `payroll` menu key
    - Ensure users without the `payroll` menu key do not see the navigation link
    - Ensure users without `payroll.view` permission are redirected to dashboard
    - _Requirements: 12.1, 12.2, 12.3, 1.1, 1.2_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses the existing `DatabaseModule` and Supabase client pattern
- The frontend follows the standalone component pattern with inline imports
- All API responses follow the `{ success: boolean, data: unknown }` format

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "2.6", "2.7", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4"] },
    { "id": 5, "tasks": ["4.5", "4.6", "4.7", "4.8", "6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "9.1"] },
    { "id": 8, "tasks": ["7.3", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 10, "tasks": ["8.5"] }
  ]
}
```
