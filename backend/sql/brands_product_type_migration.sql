-- Migration: Add product_type_id column to tblbrands
-- Purpose: Establishes Product Type → Brand hierarchy for the inventory tree view
-- Requirements: 2.2, 2.3

BEGIN;

-- Add product_type_id column with FK reference to tblproducttypes
ALTER TABLE public.tblbrands
  ADD COLUMN IF NOT EXISTS product_type_id BIGINT NULL
    REFERENCES public.tblproducttypes(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Create index for efficient lookups by product_type_id
CREATE INDEX IF NOT EXISTS idx_tblbrands_product_type_id
  ON public.tblbrands(product_type_id);

-- Add descriptive comment
COMMENT ON COLUMN public.tblbrands.product_type_id IS
  'FK to tblproducttypes; groups MAT brands under product type categories in the tree view';

COMMIT;
