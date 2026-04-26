-- Migration: add request_type column to tblpurchase_orders
-- Date: 2026-04-24
-- Description: Add request type field for PO categorization (aircon_units, aircon_parts, aircon_materials)

BEGIN;

ALTER TABLE public.tblpurchase_orders
  ADD COLUMN IF NOT EXISTS "requestType" varchar(50) DEFAULT 'aircon_units',
  ADD COLUMN IF NOT EXISTS "request_type" varchar(50) DEFAULT 'aircon_units';

-- Add index for faster filtering by request type
CREATE INDEX IF NOT EXISTS idx_tblpurchase_orders_request_type ON public.tblpurchase_orders("request_type");

COMMIT;