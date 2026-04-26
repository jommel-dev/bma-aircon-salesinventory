-- Ensure tbltransaction_product_items has trans_type (older DBs may be missing it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tbltransaction_product_items'
      AND column_name = 'trans_type'
  ) THEN
    ALTER TABLE tbltransaction_product_items
      ADD COLUMN trans_type VARCHAR(20);
  END IF;
END $$;

-- Backfill and normalize values
UPDATE tbltransaction_product_items
SET trans_type = CASE
  WHEN trans_type IS NOT NULL AND btrim(trans_type) <> '' THEN lower(btrim(trans_type))
  WHEN sales_id IS NOT NULL THEN 'sales'
  ELSE 'purchase'
END
WHERE trans_type IS NULL OR btrim(trans_type) = '' OR trans_type NOT IN ('purchase', 'sales');

-- Enforce constraints (idempotent-ish)
ALTER TABLE tbltransaction_product_items
  ALTER COLUMN trans_type SET DEFAULT 'purchase';

ALTER TABLE tbltransaction_product_items
  ALTER COLUMN trans_type SET NOT NULL;

ALTER TABLE tbltransaction_product_items
  DROP CONSTRAINT IF EXISTS tbltransaction_product_items_trans_type_check;

ALTER TABLE tbltransaction_product_items
  ADD CONSTRAINT tbltransaction_product_items_trans_type_check
  CHECK (trans_type IN ('purchase', 'sales'));

