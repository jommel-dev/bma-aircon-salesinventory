-- Migration: Create tblparts table and add approval fields to tblpurchase_orders
-- Date: 2026-04-25
-- Description: Add parts table for Aircon Parts (ACP) and approval fields to PO

BEGIN;

-- =====================================================
-- SECTION 1: Create tblparts table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tblparts (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NULL REFERENCES public.tblbrands(id) ON UPDATE CASCADE ON DELETE SET NULL,
  parts_name TEXT NOT NULL,
  model VARCHAR(100),
  parts_code VARCHAR(50) UNIQUE, -- SKU or parts code
  srp NUMERIC(12, 2) DEFAULT 0, -- Suggested Retail Price
  discount_percentage NUMERIC(5, 2) DEFAULT 0, -- Discount % (0-100)
  discounted_price NUMERIC(12, 2) DEFAULT 0, -- Calculated: srp * (1 - discount_percentage/100)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  updated_at TIMESTAMPTZ,
  updated_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT tblparts_parts_name_key UNIQUE (parts_name, brand_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tblparts_brand_id ON public.tblparts(brand_id);
CREATE INDEX IF NOT EXISTS idx_tblparts_parts_code ON public.tblparts(parts_code);
CREATE INDEX IF NOT EXISTS idx_tblparts_deleted_at ON public.tblparts(deleted_at);

COMMENT ON TABLE public.tblparts IS 'Aircon Parts inventory (motors, fans, boards, etc.)';
COMMENT ON COLUMN public.tblparts.parts_name IS 'Name of the parts';
COMMENT ON COLUMN public.tblparts.model IS 'Model number of the parts';
COMMENT ON COLUMN public.tblparts.parts_code IS 'Unique SKU/code for the parts';
COMMENT ON COLUMN public.tblparts.srp IS 'Suggested Retail Price';
COMMENT ON COLUMN public.tblparts.discount_percentage IS 'Discount percentage (0-100)';
COMMENT ON COLUMN public.tblparts.discounted_price IS 'Calculated discounted price: srp * (1 - discount_percentage/100)';

-- =====================================================
-- SECTION 2: Add approval fields to tblpurchase_orders
-- =====================================================
ALTER TABLE public.tblpurchase_orders
  ADD COLUMN IF NOT EXISTS "approve_by" BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "approveDate" TIMESTAMPTZ;

COMMENT ON COLUMN public.tblpurchase_orders."approve_by" IS 'User who approved the purchase order';
COMMENT ON COLUMN public.tblpurchase_orders."approveDate" IS 'Date when the purchase order was approved';

-- Index for approval fields
CREATE INDEX IF NOT EXISTS idx_tblpurchase_orders_approve_by ON public.tblpurchase_orders("approve_by");

COMMIT;