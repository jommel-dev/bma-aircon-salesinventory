-- Migration: Payroll Adjusted Rate
-- Date: 2026-05-03
-- Purpose: Add adjusted_rate column to tblpayroll_daily_records to support
--          per-day rate overrides (overtime, holiday, project-specific rates).
-- Requirements: 1.1, 1.2, 1.3

BEGIN;

-- ============================================================================
-- ALTER TABLE: tblpayroll_daily_records
-- Add adjusted_rate column with DEFAULT 0 for backward compatibility (Req 1.3)
-- Existing rows will receive default value of 0
-- ============================================================================
ALTER TABLE public.tblpayroll_daily_records
  ADD COLUMN adjusted_rate NUMERIC(12,2) NOT NULL DEFAULT 0;

-- CHECK constraint ensuring adjusted_rate is non-negative (Req 1.2)
ALTER TABLE public.tblpayroll_daily_records
  ADD CONSTRAINT chk_adjusted_rate_non_negative CHECK (adjusted_rate >= 0);

COMMIT;
