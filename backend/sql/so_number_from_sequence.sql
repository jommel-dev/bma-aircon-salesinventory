-- Change so_number from GENERATED ALWAYS to a trigger-based sequence using tblsequences
-- Format: YYYY-NNNN (e.g. 2026-8245, 2026-8246, ...)

BEGIN;

-- Step 1: Drop the generated column and recreate as regular TEXT
ALTER TABLE public.tblsales_order DROP COLUMN IF EXISTS so_number;
ALTER TABLE public.tblsales_order ADD COLUMN so_number TEXT;

-- Step 2: Backfill existing rows with SO-ID format (for old data)
UPDATE public.tblsales_order SET so_number = 'SO-' || LPAD(id::text, 6, '0') WHERE so_number IS NULL;

-- Step 3: Create the sequence function
CREATE OR REPLACE FUNCTION public.generate_so_number()
RETURNS TRIGGER AS $$
DECLARE
  v_current_value BIGINT;
  v_prefix TEXT;
  v_next_value BIGINT;
BEGIN
  -- Get current sequence value
  SELECT current_value, COALESCE(prefix, EXTRACT(YEAR FROM NOW())::TEXT)
  INTO v_current_value, v_prefix
  FROM public.tblsequences
  WHERE name = 'sales_order_number'
  LIMIT 1;

  -- If no sequence exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.tblsequences (name, current_value, prefix)
    VALUES ('sales_order_number', 0, EXTRACT(YEAR FROM NOW())::TEXT);
    v_current_value := 0;
    v_prefix := EXTRACT(YEAR FROM NOW())::TEXT;
  END IF;

  -- Increment and update
  v_next_value := v_current_value + 1;
  UPDATE public.tblsequences
  SET current_value = v_next_value, updated_at = NOW()
  WHERE name = 'sales_order_number';

  -- Set the so_number on the new row
  NEW.so_number := v_prefix || '-' || v_next_value;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger (only fires when so_number is NULL)
DROP TRIGGER IF EXISTS trg_generate_so_number ON public.tblsales_order;
CREATE TRIGGER trg_generate_so_number
  BEFORE INSERT ON public.tblsales_order
  FOR EACH ROW
  WHEN (NEW.so_number IS NULL)
  EXECUTE FUNCTION public.generate_so_number();

-- Step 5: Add unique index on so_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_tblsales_order_so_number
  ON public.tblsales_order(so_number) WHERE so_number IS NOT NULL;

COMMIT;
