-- Add material_id to quotation items so material-linked draft edits keep their FK

BEGIN;

ALTER TABLE public.tblquotation_items
  ADD COLUMN IF NOT EXISTS material_id BIGINT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tblquotation_items_material_id_fkey'
  ) THEN
    ALTER TABLE public.tblquotation_items
      ADD CONSTRAINT tblquotation_items_material_id_fkey
      FOREIGN KEY (material_id) REFERENCES public.tblmaterials(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tblquotation_items_material_id
  ON public.tblquotation_items(material_id);

COMMIT;