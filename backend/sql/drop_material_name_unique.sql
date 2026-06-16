-- Migration: Drop UNIQUE constraint on material_name in tblmaterials
-- Purpose: Allow same material name across different brands
-- (e.g., "1/4 Copper Tube" can exist under brand "Brand A" and "Brand B")

BEGIN;

-- Drop the unique constraint on material_name
ALTER TABLE public.tblmaterials DROP CONSTRAINT IF EXISTS tblmaterials_material_name_key;

COMMIT;
