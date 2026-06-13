-- 3.12 Material Backorder Tracking
-- Tracks backorders (negative stock) when ordered quantity exceeds available inventory
CREATE TABLE IF NOT EXISTS public.tblmaterial_backorder (
  id BIGSERIAL PRIMARY KEY,
  sales_order_id BIGINT NOT NULL REFERENCES public.tblsales_order(id) ON UPDATE CASCADE ON DELETE CASCADE,
  sales_order_item_id BIGINT NOT NULL REFERENCES public.tblsales_order_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES public.tblmaterials(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  
  -- Inventory snapshot at time of backorder creation
  on_hand_qty NUMERIC(14, 2) NOT NULL,
  ordered_qty NUMERIC(14, 2) NOT NULL,
  backorder_qty NUMERIC(14, 2) NOT NULL CHECK (backorder_qty > 0),
  
  -- Backorder details
  backorder_reason TEXT NOT NULL DEFAULT 'Insufficient stock - quantity exceeds available inventory',
  expected_fulfillment_date DATE,
  supplier_reference TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial_fulfilled', 'fulfilled', 'cancelled')),
  fulfilled_qty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  
  -- Audit fields
  created_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_by BIGINT REFERENCES public.tblusers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  
  CONSTRAINT backorder_qty_not_exceeded CHECK (fulfilled_qty <= backorder_qty)
);

CREATE INDEX IF NOT EXISTS idx_material_backorder_sales_order ON public.tblmaterial_backorder(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_material_backorder_material ON public.tblmaterial_backorder(material_id);
CREATE INDEX IF NOT EXISTS idx_material_backorder_status ON public.tblmaterial_backorder(status);
CREATE INDEX IF NOT EXISTS idx_material_backorder_created_at ON public.tblmaterial_backorder(created_at DESC);

COMMENT ON TABLE public.tblmaterial_backorder IS 'Tracks backorders (negative stock) when ordered quantity exceeds available inventory. Records history and fulfillment status.';
COMMENT ON COLUMN public.tblmaterial_backorder.backorder_qty IS 'Quantity that exceeds available stock (ordered_qty - on_hand_qty)';
COMMENT ON COLUMN public.tblmaterial_backorder.expected_fulfillment_date IS 'Expected date when backorder can be fulfilled';
COMMENT ON COLUMN public.tblmaterial_backorder.supplier_reference IS 'Reference to alternative supplier or PO that can fulfill this backorder';

-- Add column to tblmaterial_stock_movement to track backorder movements
ALTER TABLE public.tblmaterial_stock_movement
ADD COLUMN IF NOT EXISTS backorder_id BIGINT REFERENCES public.tblmaterial_backorder(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_stock_movement_backorder ON public.tblmaterial_stock_movement(backorder_id)
WHERE backorder_id IS NOT NULL;

-- Function to record a stock movement with backorder tracking
CREATE OR REPLACE FUNCTION record_backorder_movement(
  p_material_id BIGINT,
  p_backorder_id BIGINT,
  p_qty NUMERIC,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE(movement_id BIGINT, success BOOLEAN) AS $$
DECLARE
  v_movement_id BIGINT;
  v_backorder_rec RECORD;
BEGIN
  -- Fetch backorder details
  SELECT * INTO v_backorder_rec FROM public.tblmaterial_backorder
  WHERE id = p_backorder_id;
  
  IF v_backorder_rec IS NULL THEN
    RETURN QUERY SELECT NULL::BIGINT, FALSE;
    RETURN;
  END IF;
  
  -- Insert stock movement for the negative inventory
  INSERT INTO public.tblmaterial_stock_movement (
    material_id, movement_type, qty, source_type, source_id, source_line_key,
    status_snapshot, remarks, created_by
  )
  VALUES (
    p_material_id,
    'OUT',
    p_qty,
    'SO',
    v_backorder_rec.sales_order_id,
    'backorder_' || p_backorder_id::TEXT,
    'backorder',
    'Negative stock from backorder: ' || v_backorder_rec.backorder_reason,
    p_user_id
  )
  RETURNING public.tblmaterial_stock_movement.id INTO v_movement_id;
  
  -- Update backorder fulfilled qty
  UPDATE public.tblmaterial_backorder
  SET fulfilled_qty = fulfilled_qty + p_qty,
      updated_at = NOW(),
      updated_by = p_user_id
  WHERE id = p_backorder_id;
  
  -- Update status if fully fulfilled
  UPDATE public.tblmaterial_backorder
  SET status = CASE
    WHEN fulfilled_qty >= backorder_qty THEN 'fulfilled'
    WHEN fulfilled_qty > 0 THEN 'partial_fulfilled'
    ELSE status
  END
  WHERE id = p_backorder_id;
  
  RETURN QUERY SELECT v_movement_id, TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.record_backorder_movement(BIGINT, BIGINT, NUMERIC, BIGINT) IS 'Records a stock movement for backorder fulfillment and updates backorder status';
