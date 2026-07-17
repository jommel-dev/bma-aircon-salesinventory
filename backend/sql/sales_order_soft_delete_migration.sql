-- Soft delete support for sales orders (Material Sales Order drafts)
ALTER TABLE public.tblsales_order ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.tblsales_order ADD COLUMN IF NOT EXISTS deleted_by BIGINT;

CREATE INDEX IF NOT EXISTS idx_tblsales_order_deleted_at ON public.tblsales_order(deleted_at);

COMMENT ON COLUMN public.tblsales_order.deleted_at IS 'Timestamp when the sales order was soft-deleted';
COMMENT ON COLUMN public.tblsales_order.deleted_by IS 'User ID who soft-deleted the sales order';
