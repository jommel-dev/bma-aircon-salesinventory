-- Migration: Add discount column to tblsales_order_items
-- Purpose: Stores fixed amount discount per line item

BEGIN;

ALTER TABLE public.tblsales_order_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tblsales_order_items.discount IS
  'Fixed amount discount per item. Total = (rate - discount) * qty';

COMMIT;
