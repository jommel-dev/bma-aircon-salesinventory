# Requirements Document

## Introduction

The Payroll Enhancement extends the existing Payroll Module with richer employee data capture, per-employee payroll creation with daily attendance tracking, additional compensation/deduction management, and PDF payslip generation. This enhancement transforms the basic payroll system into a comprehensive compensation management tool that accounts for Philippine government-mandated benefits (Pag-Ibig, Philhealth, SSS), daily attendance with project assignments, commissions, and ad-hoc compensation or deduction entries.

## Glossary

- **Payroll_Module**: The existing frontend and backend subsystem responsible for employee payroll management.
- **Employee_Form**: The form used to create or edit employee records, now enhanced with additional fields for deductions, contact information, address, and department.
- **Department**: A categorical classification for employees, limited to the values: Driver, Installer, Helper, Office, Project Assigned.
- **Government_Deductions**: The Philippine government-mandated benefit contributions: Pag-Ibig, Philhealth, and SSS, stored as fixed monthly amounts per employee.
- **Payroll_Creator**: The per-employee payroll creation interface that allows defining a cutoff period and entering daily attendance records.
- **Cutoff_Period**: A date range selected via datepicker representing the pay period for which payroll is being generated.
- **Daily_Record**: A form entry for a single date within the cutoff period containing attendance status, assigned project, commission, and remarks.
- **Additional_Compensation**: An array of supplementary pay entries, each with a description and amount, added to an employee's payroll for a given cutoff.
- **Additional_Deduction**: An array of deduction entries (such as loans or damage compensation) each with a description and amount, subtracted from an employee's payroll for a given cutoff.
- **Payroll_Summary**: A computed breakdown section showing base salary, total days present, total commissions, additional compensation total, additional deductions total, government deductions, and net pay.
- **Payslip_PDF**: A generated PDF document containing the full payroll breakdown for an employee for a specific cutoff period.

## Requirements

### Requirement 1: Enhanced Employee Form Fields

**User Story:** As a payroll manager, I want to capture government-mandated deductions, contact information, address, and department when adding or editing an employee, so that payroll calculations include statutory contributions and employee records are complete.

#### Acceptance Criteria

1. WHEN a user opens the Add Employee form, THE Employee_Form SHALL display input fields for Pag-Ibig contribution amount, Philhealth contribution amount, and SSS contribution amount in addition to the existing fields.
2. WHEN a user opens the Add Employee form, THE Employee_Form SHALL display an input field for contact number.
3. WHEN a user opens the Add Employee form, THE Employee_Form SHALL display a text area input for address.
4. WHEN a user opens the Add Employee form, THE Employee_Form SHALL display a Department selection dropdown with the options: Driver, Installer, Helper, Office, Project Assigned.
5. WHEN a user opens the Edit Employee form, THE Employee_Form SHALL pre-populate all enhanced fields (Pag-Ibig, Philhealth, SSS, contact number, address, department) with the employee's current stored values.
6. WHEN the user submits the employee form with valid data, THE Payroll_Module SHALL persist the Pag-Ibig, Philhealth, SSS, contact number, address, and department values to the database.
7. THE Employee_Form SHALL accept numeric values greater than or equal to zero for Pag-Ibig, Philhealth, and SSS contribution fields.
8. IF the user submits the employee form with a negative value for any Government_Deductions field, THEN THE Employee_Form SHALL display a validation error indicating the amount must be zero or greater.

### Requirement 2: Department Selection Constraint

**User Story:** As a payroll manager, I want the department field to be restricted to predefined values, so that employee categorization remains consistent across the system.

#### Acceptance Criteria

1. THE Employee_Form SHALL restrict the Department dropdown to exactly five options: Driver, Installer, Helper, Office, Project Assigned.
2. WHEN the user submits the employee form without selecting a department, THE Employee_Form SHALL display a validation error indicating department is required.
3. THE Payroll_Module backend SHALL validate that the department value is one of the allowed options before persisting the employee record.

### Requirement 3: Employee Database Schema Enhancement

**User Story:** As a backend developer, I want the employee table extended with new columns, so that the enhanced employee data is stored reliably.

#### Acceptance Criteria

1. THE Payroll_Module SHALL add the following columns to the `tblpayroll_employees` table: `pag_ibig` (NUMERIC DEFAULT 0), `philhealth` (NUMERIC DEFAULT 0), `sss` (NUMERIC DEFAULT 0), `contact_number` (VARCHAR), `address` (TEXT), `department` (VARCHAR NOT NULL).
2. THE Payroll_Module SHALL enforce a CHECK constraint on the `department` column to allow only the values: Driver, Installer, Helper, Office, Project Assigned.
3. THE Payroll_Module SHALL enforce CHECK constraints ensuring `pag_ibig >= 0`, `philhealth >= 0`, and `sss >= 0`.
4. THE migration SHALL be backward-compatible, using ALTER TABLE with DEFAULT values so existing employee records remain valid.

### Requirement 4: Enhanced Employee API Endpoints

**User Story:** As a frontend developer, I want the employee API endpoints to accept and return the new fields, so that the frontend can manage the enhanced employee data.

#### Acceptance Criteria

1. THE `POST /payroll/employees` endpoint SHALL accept the additional fields: `pagIbig`, `philhealth`, `sss`, `contactNumber`, `address`, and `department` in the request body.
2. THE `PATCH /payroll/employees/:id` endpoint SHALL accept the additional fields: `pagIbig`, `philhealth`, `sss`, `contactNumber`, `address`, and `department` in the request body.
3. THE `GET /payroll/employees` endpoint SHALL return the additional fields: `pagIbig`, `philhealth`, `sss`, `contactNumber`, `address`, and `department` in each employee object.
4. IF the `POST /payroll/employees` request omits the `department` field, THEN THE Payroll_Module backend SHALL return a 400 Bad Request response indicating department is required.

### Requirement 5: Per-Employee Payroll Creation Interface

**User Story:** As a payroll manager, I want to create payroll for a specific employee by selecting a date range and entering daily attendance data, so that compensation is calculated based on actual work performed.

#### Acceptance Criteria

1. WHEN an employee is selected from the Employee_List, THE Payroll_Module SHALL display a "Create Payroll" button in the employee content section.
2. WHEN the user clicks the "Create Payroll" button, THE Payroll_Creator SHALL display a date range picker to define the Cutoff_Period start and end dates.
3. WHEN the user selects a valid Cutoff_Period, THE Payroll_Creator SHALL generate a tab for each calendar date within the range (inclusive of start and end dates).
4. THE Payroll_Creator SHALL display each date tab with a form containing: an isPresent checkbox for attendance, an assignedProject dropdown, a commission numeric input, and a remarks text input.
5. IF the user selects a Cutoff_Period where the end date is before the start date, THEN THE Payroll_Creator SHALL display a validation error and prevent tab generation.
6. WHEN the user marks isPresent as false for a date, THE Payroll_Creator SHALL disable the commission field for that date and set its value to zero.

### Requirement 6: Additional Compensation Management

**User Story:** As a payroll manager, I want to add supplementary compensation entries to an employee's payroll, so that bonuses, allowances, or other extra pay are included in the payout.

#### Acceptance Criteria

1. THE Payroll_Creator SHALL display an "Additional Compensation" section below the date tabs.
2. THE Additional_Compensation section SHALL allow the user to add multiple entries, each consisting of a description text field and an amount numeric field.
3. WHEN the user clicks an "Add" button in the Additional_Compensation section, THE Payroll_Creator SHALL append a new empty entry row.
4. WHEN the user clicks a "Remove" button on an Additional_Compensation entry, THE Payroll_Creator SHALL remove that entry from the list.
5. IF the user enters a non-positive amount for an Additional_Compensation entry, THEN THE Payroll_Creator SHALL display a validation error for that entry.
6. IF the user leaves the description field empty for an Additional_Compensation entry with a non-zero amount, THEN THE Payroll_Creator SHALL display a validation error indicating description is required.

### Requirement 7: Additional Deductions Management

**User Story:** As a payroll manager, I want to add deduction entries such as loans or damage compensation to an employee's payroll, so that amounts owed by the employee are properly subtracted from their payout.

#### Acceptance Criteria

1. THE Payroll_Creator SHALL display an "Additional Deductions" section below the Additional Compensation section.
2. THE Additional_Deduction section SHALL allow the user to add multiple entries, each consisting of a description text field and an amount numeric field.
3. WHEN the user clicks an "Add" button in the Additional_Deduction section, THE Payroll_Creator SHALL append a new empty entry row.
4. WHEN the user clicks a "Remove" button on an Additional_Deduction entry, THE Payroll_Creator SHALL remove that entry from the list.
5. IF the user enters a non-positive amount for an Additional_Deduction entry, THEN THE Payroll_Creator SHALL display a validation error for that entry.
6. IF the user leaves the description field empty for an Additional_Deduction entry with a non-zero amount, THEN THE Payroll_Creator SHALL display a validation error indicating description is required.

### Requirement 8: Payroll Summary Computation

**User Story:** As a payroll manager, I want to see a computed summary of the payroll before finalizing, so that I can verify the breakdown is correct before generating the payslip.

#### Acceptance Criteria

1. THE Payroll_Creator SHALL display a Summary section below the Additional Deductions section.
2. THE Payroll_Summary SHALL display the following computed values: base salary (from employee record), total days present (count of dates marked isPresent), total commissions (sum of commission values from all dates marked present), total additional compensation (sum of all Additional_Compensation amounts), total additional deductions (sum of all Additional_Deduction amounts), total government deductions (sum of Pag-Ibig + Philhealth + SSS from employee record), and net pay.
3. THE Payroll_Summary SHALL compute net pay as: base salary + total commissions + total additional compensation - total additional deductions - total government deductions.
4. WHEN any input value changes in the daily records, additional compensation, or additional deductions, THE Payroll_Summary SHALL recalculate all computed values in real time.
5. IF the computed net pay is negative, THEN THE Payroll_Summary SHALL display the net pay value highlighted in red as a warning.

### Requirement 9: Payroll Record Persistence

**User Story:** As a payroll manager, I want the completed payroll data to be saved to the database, so that attendance records, compensation, and deductions are permanently stored.

#### Acceptance Criteria

1. WHEN the user submits the payroll creation form with valid data, THE Payroll_Module SHALL persist a payroll cutoff record with the selected date range.
2. WHEN the payroll is submitted, THE Payroll_Module SHALL persist each Daily_Record (date, isPresent, assignedProject, commission, remarks) linked to the payroll record.
3. WHEN the payroll is submitted, THE Payroll_Module SHALL persist all Additional_Compensation entries linked to the payroll record.
4. WHEN the payroll is submitted, THE Payroll_Module SHALL persist all Additional_Deduction entries linked to the payroll record.
5. WHEN the payroll is submitted, THE Payroll_Module SHALL store the computed payout amount (net pay) in the payroll record.
6. IF a payroll record already exists for the same employee and an overlapping cutoff period, THEN THE Payroll_Module SHALL reject the submission and display an error indicating the date range conflict.

### Requirement 10: Payroll Enhancement Database Schema

**User Story:** As a backend developer, I want new database tables to store daily attendance records, additional compensation, and additional deductions, so that the enhanced payroll data is structured and queryable.

#### Acceptance Criteria

1. THE Payroll_Module SHALL create a `tblpayroll_daily_records` table with columns: id (BIGSERIAL PRIMARY KEY), payroll_record_id (BIGINT NOT NULL referencing tblpayroll_records), record_date (DATE NOT NULL), is_present (BOOLEAN NOT NULL DEFAULT false), assigned_project_id (BIGINT referencing projects table), commission (NUMERIC DEFAULT 0), remarks (TEXT).
2. THE Payroll_Module SHALL create a `tblpayroll_additional_compensation` table with columns: id (BIGSERIAL PRIMARY KEY), payroll_record_id (BIGINT NOT NULL referencing tblpayroll_records), description (VARCHAR NOT NULL), amount (NUMERIC NOT NULL CHECK amount > 0).
3. THE Payroll_Module SHALL create a `tblpayroll_additional_deductions` table with columns: id (BIGSERIAL PRIMARY KEY), payroll_record_id (BIGINT NOT NULL referencing tblpayroll_records), description (VARCHAR NOT NULL), amount (NUMERIC NOT NULL CHECK amount > 0).
4. THE Payroll_Module SHALL enforce a unique constraint on (payroll_record_id, record_date) in the `tblpayroll_daily_records` table to prevent duplicate entries for the same date.
5. THE Payroll_Module SHALL add indexes on `payroll_record_id` for all three new tables to optimize query performance.

### Requirement 11: Payroll Creation API Endpoint

**User Story:** As a frontend developer, I want a comprehensive API endpoint for creating per-employee payroll with daily records and adjustments, so that the frontend can submit the complete payroll data in a single request.

#### Acceptance Criteria

1. THE Payroll_Module backend SHALL expose a `POST /payroll/employees/:id/payroll` endpoint that accepts: cutoffStart (date), cutoffEnd (date), dailyRecords (array of {date, isPresent, assignedProjectId, commission, remarks}), additionalCompensation (array of {description, amount}), additionalDeductions (array of {description, amount}).
2. WHEN the endpoint receives a valid request, THE Payroll_Module backend SHALL create the cutoff record, payroll record, daily records, additional compensation entries, and additional deduction entries within a single database transaction.
3. IF any part of the transaction fails, THEN THE Payroll_Module backend SHALL roll back all changes and return an appropriate error response.
4. THE endpoint SHALL be protected by the `payroll.create` permission key.
5. THE endpoint SHALL validate that the number of daily records matches the number of calendar days in the cutoff period.
6. THE endpoint SHALL return the created payroll record with computed summary values in the response.

### Requirement 12: PDF Payslip Generation

**User Story:** As a payroll manager, I want to generate a PDF payslip for an employee's payroll record, so that I can provide a formal document for the employee's records.

#### Acceptance Criteria

1. WHEN a payroll record exists for an employee, THE Payroll_Module SHALL display a "Generate PDF" button in the payroll detail view.
2. WHEN the user clicks the "Generate PDF" button, THE Payroll_Module SHALL generate a PDF document containing the employee name, department, cutoff period dates, and generation date.
3. THE Payslip_PDF SHALL include a Compensation section showing: base salary, total days present out of total days in the period, and total commissions with a per-day breakdown.
4. THE Payslip_PDF SHALL include an Attendance section showing a table of all dates in the cutoff period with columns: date, present/absent status, assigned project name, commission amount, and remarks.
5. THE Payslip_PDF SHALL include an Additional Compensation section listing each entry with description and amount, and a subtotal.
6. THE Payslip_PDF SHALL include an Additional Deductions section listing each entry with description and amount, and a subtotal.
7. THE Payslip_PDF SHALL include a Benefits Deductions section showing individual amounts for Pag-Ibig, Philhealth, and SSS, and a subtotal.
8. THE Payslip_PDF SHALL include a Net Pay section showing the final computed amount after all additions and deductions.
9. THE Payslip_PDF SHALL be generated client-side using a PDF library and trigger a browser download with the filename format: `payslip_{employee_name}_{cutoff_start}_{cutoff_end}.pdf`.

### Requirement 13: Payroll Detail View Enhancement

**User Story:** As a payroll manager, I want to view the full breakdown of a previously generated payroll record, so that I can review attendance, compensation, and deductions at any time.

#### Acceptance Criteria

1. WHEN the user views a payroll cutoff detail for an employee, THE Payroll_Module SHALL display the daily attendance records in a tabular format showing date, attendance status, assigned project, commission, and remarks.
2. THE payroll detail view SHALL display the Additional Compensation entries with description and amount.
3. THE payroll detail view SHALL display the Additional Deduction entries with description and amount.
4. THE payroll detail view SHALL display the Government Deductions (Pag-Ibig, Philhealth, SSS) amounts that were applied.
5. THE payroll detail view SHALL display the computed net pay amount.
6. THE Payroll_Module backend SHALL expose a `GET /payroll/records/:id/details` endpoint that returns the payroll record with all associated daily records, additional compensation, additional deductions, and the government deduction values used.

### Requirement 14: Payroll Record API Enhancement

**User Story:** As a frontend developer, I want the payroll detail API to return all enhanced data, so that the frontend can render the complete payroll breakdown.

#### Acceptance Criteria

1. THE `GET /payroll/records/:id/details` endpoint SHALL return the payroll record including: employee name, department, cutoff start date, cutoff end date, base salary used, payout amount (net pay), and generated date.
2. THE endpoint SHALL return the array of daily records with: date, isPresent, assignedProjectId, assignedProjectName, commission, and remarks.
3. THE endpoint SHALL return the array of additional compensation entries with: description and amount.
4. THE endpoint SHALL return the array of additional deduction entries with: description and amount.
5. THE endpoint SHALL return the government deduction values (pagIbig, philhealth, sss) that were recorded at the time of payroll generation.
6. THE endpoint SHALL be protected by the `payroll.cutoff.view` permission key.
