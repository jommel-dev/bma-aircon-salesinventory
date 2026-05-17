# Implementation Plan: Payroll Enhancement

## Overview

This plan implements the payroll enhancement feature in incremental steps: database migration first, then backend DTOs/service/controller updates, followed by frontend UI changes (enhanced employee form, per-employee payroll creator, detail view), and finally client-side PDF generation. Property-based tests validate correctness properties using fast-check.

## Tasks

- [x] 1. Database migration for payroll enhancement schema
  - [x] 1.1 Create migration file `backend/sql/supabase/20260502_payroll_enhancement.sql`
    - ALTER `tblpayroll_employees` to add columns: `pag_ibig`, `philhealth`, `sss`, `contact_number`, `address`, `department` with CHECK constraints
    - ALTER `tblpayroll_records` to add columns: `pag_ibig_used`, `philhealth_used`, `sss_used`, `total_commissions`
    - CREATE TABLE `tblpayroll_daily_records` with unique constraint on (payroll_record_id, record_date)
    - CREATE TABLE `tblpayroll_additional_compensation` with CHECK (amount > 0)
    - CREATE TABLE `tblpayroll_additional_deductions` with CHECK (amount > 0)
    - Add indexes on `payroll_record_id` for all new tables
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 2. Backend DTOs and validation
  - [x] 2.1 Enhance `CreateEmployeeDto` and `UpdateEmployeeDto` with new fields
    - Add `pagIbig`, `philhealth`, `sss` (numeric, optional, default 0), `contactNumber` (string, optional), `address` (string, optional), `department` (string, required in create)
    - Add validation: department must be one of Driver/Installer/Helper/Office/Project Assigned
    - Add validation: pagIbig/philhealth/sss must be >= 0
    - _Requirements: 4.1, 4.2, 4.4, 1.7, 1.8, 2.3_

  - [x] 2.2 Create `CreatePayrollDto` with nested DTOs
    - Create `backend/src/payroll/dto/create-payroll.dto.ts` with `CreatePayrollDto`, `DailyRecordDto`, `CompensationEntryDto`, `DeductionEntryDto`
    - Validate: cutoffEnd >= cutoffStart, dailyRecords count matches day count, compensation/deduction amounts > 0, descriptions required when amount set
    - _Requirements: 11.1, 11.5, 6.5, 6.6, 7.5, 7.6_

  - [x]* 2.3 Write property tests for validation logic
    - **Property 1: Government Deduction Non-Negative Validation**
    - **Property 2: Department Enum Validation**
    - **Property 5: Entry Amount Positive Validation**
    - **Property 6: Entry Description Required With Amount**
    - **Validates: Requirements 1.7, 1.8, 2.1, 2.3, 6.5, 6.6, 7.5, 7.6**

- [x] 3. Backend service: enhanced employee CRUD
  - [x] 3.1 Update `createEmployee` method to persist new fields
    - Add department validation (reject if not in allowed list, return 400)
    - Add pagIbig/philhealth/sss non-negative validation
    - Insert new columns into the INSERT query
    - Return new fields in the response
    - _Requirements: 4.1, 4.4, 3.1, 3.2, 3.3_

  - [x] 3.2 Update `updateEmployee` method to handle new fields
    - Add optional SET clauses for pagIbig, philhealth, sss, contactNumber, address, department
    - Validate department if provided
    - Validate government deductions if provided
    - Return new fields in the response
    - _Requirements: 4.2_

  - [x] 3.3 Update `getEmployees` method to return new fields
    - Add pag_ibig, philhealth, sss, contact_number, address, department to SELECT query with proper aliases
    - _Requirements: 4.3_

- [x] 4. Backend service: per-employee payroll creation
  - [x] 4.1 Implement `createEmployeePayroll` method in PayrollService
    - Accept employeeId, CreatePayrollDto, userId
    - Validate employee exists and is active
    - Validate cutoff date range (end >= start)
    - Validate daily records count matches calendar days in period
    - Check for overlapping cutoff periods for the same employee
    - Compute net pay: baseSalary + totalCommissions + totalAdditionalComp - totalAdditionalDed - govDeductions
    - Execute all inserts within a single transaction (BEGIN/COMMIT/ROLLBACK)
    - Insert cutoff record, payroll record (with gov deduction snapshot), daily records, compensation entries, deduction entries
    - Return created payroll record with computed summary
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.2, 11.3, 11.5, 11.6_

  - [x]* 4.2 Write property test for net pay computation
    - **Property 7: Net Pay Computation Formula**
    - **Validates: Requirements 8.3**

  - [x]* 4.3 Write property test for date range logic
    - **Property 3: Date Range to Day Count Correspondence**
    - **Property 8: Date Range Overlap Detection**
    - **Validates: Requirements 5.3, 9.6, 11.5**

- [x] 5. Backend service: payroll record details
  - [x] 5.1 Implement `getPayrollRecordDetails` method in PayrollService
    - Query payroll record with employee name, department, cutoff dates, base salary, payout amount, generated date
    - Query associated daily records with assigned project names (LEFT JOIN projects table)
    - Query additional compensation entries
    - Query additional deduction entries
    - Return government deduction snapshot values (pag_ibig_used, philhealth_used, sss_used)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 6. Backend controller: new and modified endpoints
  - [x] 6.1 Add `POST /payroll/employees/:id/payroll` endpoint
    - Use `@Permissions(['payroll.create'])` guard
    - Call `createEmployeePayroll` service method
    - Handle ConflictException (409), NotFoundException (404), BadRequestException (400)
    - _Requirements: 11.1, 11.4_

  - [x] 6.2 Add `GET /payroll/records/:id/details` endpoint
    - Use `@Permissions(['payroll.cutoff.view'])` guard
    - Call `getPayrollRecordDetails` service method
    - Handle NotFoundException (404)
    - _Requirements: 13.6, 14.6_

- [x] 7. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend: enhanced employee interfaces and form
  - [x] 8.1 Update `PayrollEmployee` interface and add new interfaces
    - Add `pagIbig`, `philhealth`, `sss`, `contactNumber`, `address`, `department` to `PayrollEmployee` interface
    - Add `DailyRecord`, `CompensationEntry`, `DeductionEntry`, `PayrollSummary`, `PayrollRecordDetail` interfaces
    - _Requirements: 4.3, 5.4, 6.2, 7.2, 8.2_

  - [x] 8.2 Enhance Add Employee form with new fields
    - Add department dropdown (Driver, Installer, Helper, Office, Project Assigned) - required
    - Add Pag-Ibig, Philhealth, SSS numeric inputs (default 0, validate >= 0)
    - Add contact number text input
    - Add address textarea
    - Add validation: department required, gov deductions non-negative
    - Update `submitAddEmployee` to include new fields in API request
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8, 2.1, 2.2_

  - [x] 8.3 Enhance Edit Employee form with new fields
    - Add same fields as Add form
    - Pre-populate all enhanced fields from `selectedEmployee` data
    - Update `submitEditEmployee` to include new fields in API request
    - _Requirements: 1.5, 1.6_

- [x] 9. Frontend: per-employee payroll creator UI
  - [x] 9.1 Implement payroll creator state and date range selection
    - Add state variables: showPayrollCreator, payrollCutoffStart, payrollCutoffEnd, dailyRecords array, additionalCompensation array, additionalDeductions array
    - Add "Create Payroll" button in employee content section (visible when employee selected)
    - Implement date range picker using flatpickr for cutoff period selection
    - Validate end date >= start date
    - On valid date range selection, generate DailyRecord entries for each calendar day in range
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 9.2 Implement daily records tab interface
    - Render a tab for each date in the cutoff period
    - Each tab shows: isPresent checkbox, assignedProject dropdown (from projects list), commission numeric input, remarks text input
    - When isPresent is unchecked, disable commission field and set value to 0
    - _Requirements: 5.3, 5.4, 5.6_

  - [x]* 9.3 Write property test for absent day commission invariant
    - **Property 4: Absent Day Commission Invariant**
    - **Validates: Requirements 5.6**

  - [x] 9.4 Implement additional compensation section
    - Display "Additional Compensation" section below date tabs
    - Add button to append new entry row (description + amount fields)
    - Remove button to delete an entry
    - Validate: amount must be > 0, description required when amount is set
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 9.5 Implement additional deductions section
    - Display "Additional Deductions" section below compensation section
    - Add button to append new entry row (description + amount fields)
    - Remove button to delete an entry
    - Validate: amount must be > 0, description required when amount is set
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 9.6 Implement payroll summary section with real-time computation
    - Display Summary section below deductions
    - Compute and display: base salary, total days present, total commissions, total additional compensation, total additional deductions, total government deductions, net pay
    - Net pay = baseSalary + totalCommissions + totalAdditionalComp - totalAdditionalDed - (pagIbig + philhealth + sss)
    - Recalculate on any input change
    - Highlight net pay in red if negative
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.7 Implement payroll submission to backend
    - On submit, call `POST /payroll/employees/:id/payroll` with all form data
    - Handle success: close creator, refresh employee summary and cutoffs
    - Handle errors: display 409 conflict message, 400 validation errors, generic network errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.1_

- [x] 10. Checkpoint - Payroll creator complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Frontend: enhanced payroll detail view
  - [x] 11.1 Implement enhanced payroll detail view
    - Call `GET /payroll/records/:id/details` when viewing a payroll record
    - Display daily attendance records table: date, present/absent, project name, commission, remarks
    - Display additional compensation entries with description and amount
    - Display additional deduction entries with description and amount
    - Display government deductions (Pag-Ibig, Philhealth, SSS) amounts
    - Display computed net pay amount
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 12. Frontend: PDF payslip generation
  - [x] 12.1 Implement `generatePayslipPdf` method using pdf-lib
    - Generate PDF with employee name, department, cutoff period, generation date
    - Include Compensation section: base salary, days present/total days, total commissions
    - Include Attendance table: date, status, project, commission, remarks for each day
    - Include Additional Compensation section with entries and subtotal
    - Include Additional Deductions section with entries and subtotal
    - Include Benefits Deductions section: Pag-Ibig, Philhealth, SSS with subtotal
    - Include Net Pay section with final amount
    - Trigger download with filename: `payslip_{employee_name}_{cutoff_start}_{cutoff_end}.pdf`
    - Add "Generate PDF" button in payroll detail view
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

- [x] 13. Final checkpoint - All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The existing `POST /payroll/cutoffs` endpoint remains for backward compatibility
- pdf-lib is already installed in the frontend (^1.17.1)
- flatpickr is already available for date pickers
- All backend queries use raw SQL via DatabaseService (not TypeORM)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1", "6.2"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2", "9.4", "9.5"] },
    { "id": 9, "tasks": ["9.3", "9.6"] },
    { "id": 10, "tasks": ["9.7"] },
    { "id": 11, "tasks": ["11.1"] },
    { "id": 12, "tasks": ["12.1"] }
  ]
}
```
