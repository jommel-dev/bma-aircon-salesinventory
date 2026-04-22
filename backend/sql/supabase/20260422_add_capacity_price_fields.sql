-- Migration: add cashPrice, ccPrice, unitPrice to tblcapacity
-- Date: 2026-04-22

BEGIN;

ALTER TABLE public.tblcapacity
  ADD COLUMN IF NOT EXISTS "cashPrice" numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ccPrice" numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitPrice" numeric(12,2) DEFAULT 0;

-- Indexes (optional)
CREATE INDEX IF NOT EXISTS idx_tblcapacity_unitprice ON public.tblcapacity("unitPrice");
CREATE INDEX IF NOT EXISTS idx_tblcapacity_cashprice ON public.tblcapacity("cashPrice");

COMMIT;
