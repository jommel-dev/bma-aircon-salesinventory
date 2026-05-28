-- ============================================================================
-- Migration: Create tblsales_order_payments table for material sales order payments
-- Description: Creates the sales order payments table to store payment details
--              (including split payments) for the Material Sales Order module.
-- ============================================================================

BEGIN;

-- Create the tblsales_order_payments table
CREATE TABLE IF NOT EXISTS public.tblsales_order_payments (
  id BIGSERIAL PRIMARY KEY,
  sales_order_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  terms TEXT NULL,
  terms_due_date DATE NULL,
  reference_no TEXT NULL,
  payment_date DATE NULL,
  issued_by TEXT NULL,
  cc_charge TEXT NULL,
  check_no TEXT NULL,
  bank_name TEXT NULL,
  bank_account TEXT NULL,
  post_dated DATE NULL,
  down_payment NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key to tblsales_order
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tblsales_order_payments_sales_order_id_fkey') THEN
    ALTER TABLE public.tblsales_order_payments ADD CONSTRAINT tblsales_order_payments_sales_order_id_fkey
      FOREIGN KEY (sales_order_id) REFERENCES public.tblsales_order(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tblsales_order_payments_sales_order_id ON public.tblsales_order_payments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_tblsales_order_payments_status ON public.tblsales_order_payments(status);
CREATE INDEX IF NOT EXISTS idx_tblsales_order_payments_method ON public.tblsales_order_payments(method);

COMMENT ON TABLE public.tblsales_order_payments IS 'Payment details for material sales orders (supports split payments)';
COMMENT ON COLUMN public.tblsales_order_payments.method IS 'Payment method: Cash, Bank Transfer, Terms, Terms with DP, Cheque, Credit Card, Installment';
COMMENT ON COLUMN public.tblsales_order_payments.status IS 'Payment status: paid, unpaid, overdue';
COMMENT ON COLUMN public.tblsales_order_payments.terms IS 'Payment terms in days (e.g. 30, 60)';
COMMENT ON COLUMN public.tblsales_order_payments.down_payment IS 'Down payment amount for Terms with DP and Installment methods';

COMMIT;
