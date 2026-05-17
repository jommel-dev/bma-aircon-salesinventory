# Implementation Plan: Payroll Adjusted Rate

## Overview

This plan integrates the `adjustedRate` field across the full stack — database migration, backend service persistence and payout computation, and frontend form input and display. Each task builds incrementally, starting with the database schema change, then backend logic, then frontend interfaces and UI, and finally wiring everything together with updated payout computation.

## Tasks

- [x] 1. Database migration for adjusted_rate column
  - [x] 1.1 Create SQL migration file `backend/sql/supabase/20260503_payroll_adjusted_rate.sql`
    - Add `adjusted_rate NUMERIC(12,2) NOT NULL DEFAULT 0` column to `tblpayroll_daily_records`
    - Add CHECK constraint `chk_adjusted_rate_non_negative` ensuring `adjusted_rate >= 0`
    - Wrap in BEGIN/COMMIT transaction block
    - Existing rows will receive default value of 0
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Backend service: persist adjustedRate in daily records
  - [x] 2.1 Update `createEmployeePayroll` in `backend/src/payroll/payroll.service.ts` to include `adjusted_rate` in daily records INSERT
    - Expand the daily records INSERT statement from 6 columns to 7 columns (add `adjusted_rate`)
    - Add `record.adjustedRate ?? 0` as the 7th parameter for each daily record placeholder
    - Update the placeholder pattern from `($1, $2, $3, $4, $5, $6)` to `($1, $2, $3, $4, $5, $6, $7)` per record
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Update payout computation in `createEmployeePayroll` to use sum of adjustedRate for present days
    - Replace `const netPay = baseSalary + totalCommissions + ...` with `const totalAdjustedRate = dto.dailyRecords.filter(r => r.isPresent).reduce((sum, r) => sum + (r.adjustedRate ?? 0), 0)`
    - Compute `netPay = totalAdjustedRate + totalCommissions + totalAdditionalComp - totalAdditionalDed - totalGovDeductions`
    - _Requirements: 3.1, 3.2, 3.4_

  - [ ]* 2.3 Write property test for payout computation formula
    - **Property 2: Payout Computation Formula**
    - **Validates: Requirements 3.1, 3.2, 4.3**

- [x] 3. Backend service: retrieve adjustedRate in record details
  - [x] 3.1 Update `getPayrollRecordDetails` in `backend/src/payroll/payroll.service.ts` to query `adjusted_rate` from daily records
    - Change the daily records SELECT to include `dr.adjusted_rate::numeric AS "adjustedRate"` instead of `pr.base_salary_used::numeric AS "baseRate"`
    - Update the payout computation in this method to sum `adjustedRate` for present days instead of `baseRate`
    - _Requirements: 3.3, 4.1, 4.2, 4.3_

  - [x] 3.2 Update `getEmployeeCutoffs` and `computePayout` methods to use `adjusted_rate` from daily records
    - In `computePayout`, change the daily records query to SELECT `dr.adjusted_rate::numeric AS "adjustedRate"` and `dr.is_present AS "isPresent"` from `tblpayroll_daily_records`
    - Sum `adjustedRate` only for present days instead of using `base_salary_used`
    - Update `getEmployeeCutoffs` similarly to use adjusted_rate-based computation
    - _Requirements: 3.1, 3.4, 4.3_

  - [ ]* 3.3 Write property test for adjusted rate persistence round-trip
    - **Property 1: Adjusted Rate Persistence Round-Trip**
    - **Validates: Requirements 2.1, 2.4, 3.3, 4.1**

- [x] 4. Checkpoint - Ensure backend changes compile and pass validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend: update TypeScript interfaces
  - [x] 5.1 Update `DailyRecord` and `PayrollRecordDetail` interfaces in `frontend/src/app/payroll/payroll.component.ts`
    - Replace `baseRate: number` with `adjustedRate: number` in the `DailyRecord` interface
    - Replace `baseRate: number` with `adjustedRate: number` in the `PayrollRecordDetail.dailyRecords` array type
    - _Requirements: 7.1, 7.2_

- [x] 6. Frontend: payroll creator form changes
  - [x] 6.1 Update `generatePayrollCreatorDays()` to initialize `adjustedRate` to employee's baseSalary
    - Change `baseRate: 0` to `adjustedRate: this.selectedEmployee!.baseSalary` in the record generation loop
    - _Requirements: 5.2, 7.3_

  - [x] 6.2 Update `submitPayrollCreator()` to include `adjustedRate` in the API request payload
    - Add `adjustedRate: r.adjustedRate ?? 0` to the dailyRecords mapping in the request body
    - _Requirements: 5.3_

  - [x] 6.3 Add "Adjusted Rate" numeric input field in the payroll creator template (`payroll.component.html`)
    - Add a labeled `<input type="number">` bound to `payrollCreatorDailyRecords[payrollCreatorSelectedTab].adjustedRate`
    - Set `min="0"` and `step="0.01"` attributes
    - Place it in the daily record tab form alongside existing fields (commission, project, remarks)
    - _Requirements: 5.1, 5.4, 5.5_

  - [ ]* 6.4 Write property test for daily record initialization to base salary
    - **Property 3: Daily Record Initialization to Base Salary**
    - **Validates: Requirements 5.2, 7.3**

- [x] 7. Frontend: record detail display changes
  - [x] 7.1 Update `getSubTotalBaseRate()` method to use `adjustedRate` field
    - Rename method to `getSubTotalAdjustedRate()` (or keep name and update internals)
    - Change `e.baseRate` to `e.adjustedRate` in the reduce computation
    - Only sum for present days (already filtered)
    - _Requirements: 6.2, 6.3_

  - [x] 7.2 Update the record detail template in `payroll.component.html` to display `adjustedRate`
    - Replace references to `baseRate` with `adjustedRate` in the daily record detail display
    - Format as PHP currency with 2 decimal places using `formatCurrency()`
    - Update the subtotal display to call the updated method
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 7.3 Write property test for subtotal computation using only present days
    - **Property 4: Subtotal Computation Uses Only Present Days**
    - **Validates: Requirements 3.4, 6.2, 6.3**

- [x] 8. Final checkpoint - Ensure all changes compile and integrate correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The `DailyRecordDto` already has `adjustedRate` with `@IsNumber()` and `@Min(0)` validation — no DTO changes needed
- The backend controller requires no changes — it already passes the DTO through and returns the service response

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "6.2", "6.3", "7.1"] },
    { "id": 4, "tasks": ["2.3", "3.3", "6.4", "7.2"] },
    { "id": 5, "tasks": ["7.3"] }
  ]
}
```
