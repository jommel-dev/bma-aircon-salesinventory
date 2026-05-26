-- Migration: Add overtime column to tblpayroll_daily_records
-- Date: 2026-05-26
-- Description: Add per-day overtime field to daily payroll records

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tblpayroll_daily_records'
      AND column_name = 'overtime'
  ) THEN
    ALTER TABLE tblpayroll_daily_records ADD COLUMN overtime NUMERIC DEFAULT 0;
  END IF;
END $$;

COMMENT ON COLUMN tblpayroll_daily_records.overtime IS 'Daily overtime amount for the employee';
