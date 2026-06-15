-- Migration: Add product_type_id column to tblmaterials
-- Purpose: Allows materials to be directly linked to a product type without requiring a brand.
-- This eliminates the need to create "No Brand" entries for every product type.

BEGIN;

-- Add product_type_id column with FK reference to tblproducttypes
ALTER TABLE public.tblmaterials
  ADD COLUMN IF NOT EXISTS product_type_id BIGINT NULL
    REFERENCES public.tblproducttypes(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Create index for efficient lookups by product_type_id
CREATE INDEX IF NOT EXISTS idx_tblmaterials_product_type_id
  ON public.tblmaterials(product_type_id);

-- Add descriptive comment
COMMENT ON COLUMN public.tblmaterials.product_type_id IS
  'FK to tblproducttypes; allows direct product type association without requiring a brand';

-- Backfill: set product_type_id from the brand''s product_type_id for existing materials
UPDATE public.tblmaterials m
SET product_type_id = b.product_type_id
FROM public.tblbrands b
WHERE m.brand_id = b.id
  AND b.product_type_id IS NOT NULL
  AND m.product_type_id IS NULL;

COMMIT;
