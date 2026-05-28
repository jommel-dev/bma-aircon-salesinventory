-- ============================================================================
-- Migration: Create tblsales_order_items table for material line items
-- Description: Creates the sales order items table to store material line items
--              for the Sales Order Materials module.
-- Requirements: 6.1, 6.5, 9.6
-- ============================================================================

BEGIN;

-- Create the tblsales_order_items table
CREATE TABLE IF NOT EXISTS public.tblsales_order_items (
  id BIGSERIAL PRIMARY KEY,
  sales_order_id INTEGER NOT NULL,
  material_id BIGINT NULL,
  description VARCHAR(255) NOT NULL,
  item_code VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_non_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key to tblsales_order
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tblsales_order_items_sales_order_id_fkey') THEN
    ALTER TABLE public.tblsales_order_items ADD CONSTRAINT tblsales_order_items_sales_order_id_fkey
      FOREIGN KEY (sales_order_id) REFERENCES public.tblsales_order(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key to tblmaterials with ON DELETE SET NULL
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tblsales_order_items_material_id_fkey') THEN
    ALTER TABLE public.tblsales_order_items ADD CONSTRAINT tblsales_order_items_material_id_fkey
      FOREIGN KEY (material_id) REFERENCES public.tblmaterials(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tblsales_order_items_sales_order_id ON public.tblsales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_tblsales_order_items_material_id ON public.tblsales_order_items(material_id);
CREATE INDEX IF NOT EXISTS idx_tblsales_order_items_is_non_inventory ON public.tblsales_order_items(is_non_inventory);

COMMENT ON TABLE public.tblsales_order_items IS 'Line items for material sales orders';
COMMENT ON COLUMN public.tblsales_order_items.material_id IS 'FK to tblmaterials; NULL for non-inventory items';
COMMENT ON COLUMN public.tblsales_order_items.is_non_inventory IS 'TRUE if item is not from inventory catalog';
COMMENT ON COLUMN public.tblsales_order_items.total IS 'Computed server-side as rate * qty';

COMMIT;
