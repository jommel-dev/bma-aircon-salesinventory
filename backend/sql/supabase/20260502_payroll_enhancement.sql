-- Migration: Payroll Enhancement
-- Date: 2026-05-02
-- Purpose: Extend payroll module with government deductions, contact info,
--          department classification, daily attendance records, and
--          additional compensation/deduction tables.
-- Requirements: 3.1, 3.2, 3.3, 3.4, 10.1, 10.2, 10.3, 10.4, 10.5

BEGIN;

-- ============================================================================
-- ALTER TABLE: tblpayroll_employees
-- Add government deduction fields, contact info, address, and department
-- Uses DEFAULT values for backward compatibility with existing records (Req 3.4)
-- ============================================================================
ALTER TABLE public.tblpayroll_employees
  ADD COLUMN pag_ibig NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN philhealth NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN sss NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN contact_number VARCHAR(50),
  ADD COLUMN address TEXT,
  ADD COLUMN department VARCHAR(50) NOT NULL DEFAULT 'Office';

-- CHECK constraints for non-negative government deductions (Req 3.3)
ALTER TABLE public.tblpayroll_employees
  ADD CONSTRAINT chk_pag_ibig_non_negative CHECK (pag_ibig >= 0),
  ADD CONSTRAINT chk_philhealth_non_negative CHECK (philhealth >= 0),
  ADD CONSTRAINT chk_sss_non_negative CHECK (sss >= 0);

-- CHECK constraint for department enum values (Req 3.2)
ALTER TABLE public.tblpayroll_employees
  ADD CONSTRAINT chk_department_values CHECK (department IN ('Driver', 'Installer', 'Helper', 'Office', 'Project Assigned'));

-- ============================================================================
-- ALTER TABLE: tblpayroll_records
-- Add government deduction snapshot columns and total commissions
-- ============================================================================
ALTER TABLE public.tblpayroll_records
  ADD COLUMN pag_ibig_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN philhealth_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN sss_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN total_commissions NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ============================================================================
-- NEW TABLE: tblpayroll_daily_records
-- Stores per-day attendance, project assignment, commission, and remarks
-- (Req 10.1, 10.4)
-- ============================================================================
CREATE TABLE public.tblpayroll_daily_records (
  id BIGSERIAL PRIMARY KEY,
  payroll_record_id BIGINT NOT NULL REFERENCES public.tblpayroll_records(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  is_present BOOLEAN NOT NULL DEFAULT false,
  assigned_project_id BIGINT,
  commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  remarks TEXT,
  CONSTRAINT uq_daily_record_date UNIQUE (payroll_record_id, record_date)
);

-- ============================================================================
-- NEW TABLE: tblpayroll_additional_compensation
-- Stores supplementary pay entries per payroll record (Req 10.2)
-- ============================================================================
CREATE TABLE public.tblpayroll_additional_compensation (
  id BIGSERIAL PRIMARY KEY,
  payroll_record_id BIGINT NOT NULL REFERENCES public.tblpayroll_records(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

-- ============================================================================
-- NEW TABLE: tblpayroll_additional_deductions
-- Stores deduction entries per payroll record (Req 10.3)
-- ============================================================================
CREATE TABLE public.tblpayroll_additional_deductions (
  id BIGSERIAL PRIMARY KEY,
  payroll_record_id BIGINT NOT NULL REFERENCES public.tblpayroll_records(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

-- ============================================================================
-- Indexes on payroll_record_id for all new tables (Req 10.5)
-- ============================================================================
CREATE INDEX idx_daily_records_payroll ON public.tblpayroll_daily_records(payroll_record_id);
CREATE INDEX idx_additional_comp_payroll ON public.tblpayroll_additional_compensation(payroll_record_id);
CREATE INDEX idx_additional_ded_payroll ON public.tblpayroll_additional_deductions(payroll_record_id);

COMMIT;
