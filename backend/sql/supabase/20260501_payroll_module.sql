-- Migration: Create payroll module tables
-- Date: 2026-05-01
-- Purpose: Add payroll management tables for employee payroll tracking,
--          cutoff period management, and individual payroll records.
--          Supports the Payroll Module feature with RBAC-protected endpoints.

BEGIN;

-- ============================================================================
-- Table: tblpayroll_employees
-- Description: Stores payroll employee records with salary and project assignment
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tblpayroll_employees (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  position VARCHAR(100) NOT NULL,
  project_id BIGINT,
  base_salary NUMERIC(12,2) NOT NULL CHECK (base_salary > 0),
  status SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES public.tblusers(id)
);

-- ============================================================================
-- Table: tblpayroll_cutoffs
-- Description: Defines payroll cutoff periods with date range validation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tblpayroll_cutoffs (
  id BIGSERIAL PRIMARY KEY,
  cutoff_start DATE NOT NULL,
  cutoff_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES public.tblusers(id),
  CONSTRAINT chk_cutoff_dates CHECK (cutoff_end >= cutoff_start)
);

-- ============================================================================
-- Table: tblpayroll_records
-- Description: Individual payroll records linking employees to cutoff periods.
--              One record per employee per cutoff enforced by unique constraint.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tblpayroll_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.tblpayroll_employees(id) ON DELETE CASCADE,
  cutoff_id BIGINT NOT NULL REFERENCES public.tblpayroll_cutoffs(id) ON DELETE CASCADE,
  base_salary_used NUMERIC(12,2) NOT NULL,
  payout_amount NUMERIC(12,2) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_employee_cutoff UNIQUE (employee_id, cutoff_id)
);

-- ============================================================================
-- Indexes for common queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee ON public.tblpayroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_cutoff ON public.tblpayroll_records(cutoff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_position ON public.tblpayroll_employees(position);
CREATE INDEX IF NOT EXISTS idx_payroll_employees_project ON public.tblpayroll_employees(project_id);

COMMIT;
