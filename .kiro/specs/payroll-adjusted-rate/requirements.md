# Requirements Document

## Introduction

This feature integrates the `adjustedRate` field into the payroll module across the full stack. The `adjustedRate` allows payroll administrators to override the default base salary rate on a per-day basis when creating payroll records. This supports scenarios where an employee works at a different rate than their standard base salary (e.g., overtime rate, holiday rate, or project-specific rate). The field has already been added to the `CreatePayrollDto` (backend DTO) and now needs to flow through the backend service logic, database persistence, retrieval queries, and the frontend payroll creator UI.

## Glossary

- **Payroll_Service**: The NestJS backend service (`payroll.service.ts`) responsible for payroll business logic, database operations, and payout computation.
- **Payroll_Controller**: The NestJS backend controller (`payroll.controller.ts`) that exposes payroll REST API endpoints.
- **Payroll_Component**: The Angular frontend component (`payroll.component.ts` and `payroll.component.html`) that renders the payroll UI and handles user interactions.
- **Adjusted_Rate**: A numeric field on each daily attendance record representing the actual rate applied for that day, which may differ from the employee's base salary.
- **Daily_Record**: A per-day attendance entry within a payroll cutoff period, containing presence status, project assignment, commission, adjusted rate, and remarks.
- **Payout_Computation**: The calculation that determines net pay by summing adjusted rates (instead of base salary) plus commissions plus additional compensation minus deductions minus government deductions.
- **Payroll_Creator**: The frontend UI form used to create a per-employee payroll record with daily attendance, compensation, and deduction entries.

## Requirements

### Requirement 1: Database Schema Support for Adjusted Rate

**User Story:** As a system administrator, I want the daily records table to store an adjusted rate per day, so that payroll calculations can use day-specific rates instead of a flat base salary.

#### Acceptance Criteria

1. THE Database SHALL include an `adjusted_rate` column of type `NUMERIC(12,2)` with a default value of `0` in the `tblpayroll_daily_records` table.
2. THE Database SHALL enforce a non-negative constraint on the `adjusted_rate` column using a CHECK constraint with the expression `adjusted_rate >= 0`.
3. WHEN the migration is applied, THE Database SHALL set `adjusted_rate` to `0` for all existing rows in `tblpayroll_daily_records` that were created before the column was added.

### Requirement 2: Backend Persistence of Adjusted Rate

**User Story:** As a payroll administrator, I want the adjusted rate submitted for each daily record to be saved to the database, so that it is available for payout computation and historical review.

#### Acceptance Criteria

1. WHEN a payroll record is created via the `createEmployeePayroll` method, THE Payroll_Service SHALL persist the `adjustedRate` value from each daily record entry into the `adjusted_rate` column (NUMERIC(12,2)) of `tblpayroll_daily_records`.
2. IF the `adjustedRate` value is null or undefined for a daily record, THEN THE Payroll_Service SHALL store `0` in the `adjusted_rate` column for that daily record.
3. IF the `adjustedRate` value is negative, THEN THE Payroll_Service SHALL reject the request with a validation error indicating that adjustedRate must be greater than or equal to 0.
4. WHEN a payroll record is retrieved for payout computation or historical review, THE Payroll_Service SHALL include the persisted `adjusted_rate` value for each daily record in the response.

### Requirement 3: Payout Computation Using Adjusted Rate

**User Story:** As a payroll administrator, I want the net pay calculation to use the sum of adjusted rates from present days instead of a flat base salary, so that the payout accurately reflects day-specific rate overrides.

#### Acceptance Criteria

1. WHEN computing the payout for a payroll record, THE Payroll_Service SHALL sum the `adjusted_rate` values (each >= 0) from all daily records where `is_present` is true, and use this sum as the base salary component in the net pay formula.
2. THE Payroll_Service SHALL compute net pay as: `SUM(adjustedRate for present days) + SUM(commissions for present days) + SUM(additional compensation amounts) - SUM(additional deduction amounts) - (pagIbig_used + philhealth_used + sss_used)`.
3. WHEN retrieving payroll record details via `getPayrollRecordDetails`, THE Payroll_Service SHALL return the `adjustedRate` field for each daily record in the response, regardless of the day's presence status.
4. IF no daily records have `is_present` set to true for a payroll record, THEN THE Payroll_Service SHALL compute the base salary component as 0 and continue applying the remaining formula terms (commissions, compensation, deductions).

### Requirement 4: Backend Retrieval of Adjusted Rate

**User Story:** As a frontend developer, I want the payroll record detail API to include the adjusted rate for each daily record, so that the UI can display it accurately.

#### Acceptance Criteria

1. WHEN the `GET /payroll/records/:id/details` endpoint is called with a valid record ID, THE Payroll_Controller SHALL return the `adjustedRate` value as a numeric field for each daily record entry in the `dailyRecords` array of the response payload.
2. IF the `GET /payroll/records/:id/details` endpoint is called with a record ID that does not exist, THEN THE Payroll_Controller SHALL return an error response indicating the payroll record was not found.
3. WHEN computing subtotals for the cutoff detail view, THE Payroll_Service SHALL sum the `adjusted_rate` values from `tblpayroll_daily_records` only for daily records where `is_present` is true, and use this sum as the base salary subtotal.

### Requirement 5: Frontend Payroll Creator Input for Adjusted Rate

**User Story:** As a payroll administrator, I want to enter an adjusted rate for each day in the payroll creator form, so that I can specify day-specific rates when generating payroll.

#### Acceptance Criteria

1. THE Payroll_Component SHALL display an "Adjusted Rate" numeric input field for each daily record in the payroll creator form, accepting values with up to 2 decimal places within the range 0.00 to 999,999,999.99.
2. WHEN the Payroll_Component generates daily records for a new cutoff period, THE Payroll_Component SHALL initialize the `adjustedRate` field of each daily record to the selected employee's current base salary value.
3. WHEN the payroll creator form is submitted, THE Payroll_Component SHALL include the `adjustedRate` value for each daily record in the API request payload sent to the `POST /payroll/employees/:id/payroll` endpoint.
4. IF the `adjustedRate` value for any daily record is less than 0 or is not a valid number, THEN THE Payroll_Component SHALL prevent form submission and display a validation error message indicating the adjusted rate must be zero or greater.
5. WHEN the user modifies the `adjustedRate` field for a daily record, THE Payroll_Component SHALL retain the modified value when switching between daily record tabs within the same payroll creator session.

### Requirement 6: Frontend Display of Adjusted Rate in Record Details

**User Story:** As a payroll administrator, I want to see the adjusted rate for each day when viewing a payroll record's details, so that I can verify the rates used in the payout calculation.

#### Acceptance Criteria

1. WHEN displaying payroll record details, THE Payroll_Component SHALL show the `adjustedRate` value for each daily record in the attendance breakdown, formatted as PHP currency with 2 decimal places.
2. WHEN displaying payroll record details, THE Payroll_Component SHALL display the subtotal of `adjustedRate` values summed from all daily records where `isPresent` is true.
3. WHEN displaying the net pay breakdown, THE Payroll_Component SHALL compute and display the net pay as: SUM(adjustedRate for present days) + SUM(commissions) + SUM(additional compensation) - SUM(additional deductions) - SUM(government deductions), using the sum of adjusted rates instead of a flat base salary.

### Requirement 7: Frontend DailyRecord Interface Update

**User Story:** As a frontend developer, I want the `DailyRecord` and `PayrollRecordDetail` TypeScript interfaces to include the `adjustedRate` field, so that the data model is consistent with the backend.

#### Acceptance Criteria

1. THE Payroll_Component SHALL define `adjustedRate` as a required `number` property on the `DailyRecord` interface, with a minimum value of 0.
2. THE Payroll_Component SHALL define `adjustedRate` as a required `number` property on the daily record entries within the `PayrollRecordDetail` interface's `dailyRecords` array.
3. WHEN generating a new `DailyRecord` object, THE Payroll_Component SHALL initialize `adjustedRate` to the employee's base salary value (not 0).
