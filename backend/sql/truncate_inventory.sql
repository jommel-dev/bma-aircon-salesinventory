-- Truncate all inventory data (materials, brands, product types)
-- WARNING: This deletes ALL data from these tables. Use with caution.

BEGIN;

-- Truncate in order (child tables first due to FK constraints)
TRUNCATE TABLE public.tblmaterials RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.tblbrands RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.tblproducttypes RESTART IDENTITY CASCADE;

COMMIT;
