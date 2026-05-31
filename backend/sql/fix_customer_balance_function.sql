-- Fix customer balance calculation to account for tblsales_order_payments
-- Balance = total sales - customer payments - SO payments (paid) - sales_order_payments (paid)

CREATE OR REPLACE FUNCTION public.recalc_customer_balance(p_customer_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.tblcustomer
  SET current_balance = (
    -- Total sales amount (all non-voided orders)
    COALESCE(
      (SELECT SUM(total_amount) FROM public.tblsales_order 
       WHERE customer_id = p_customer_id 
       AND COALESCE(status, '') != 'voided'), 0
    )
    -- Minus: customer manual payments
    - COALESCE(
      (SELECT SUM(payment_amount) FROM public.tblcustomer_payments WHERE customer_id = p_customer_id), 0
    )
    -- Minus: SO payments (legacy)
    - COALESCE(
      (
        SELECT SUM(COALESCE(sp.amount, 0))
        FROM public.tblso_payments sp
        JOIN public.tblsales_order so ON so.id = sp.so_id
        WHERE so.customer_id = p_customer_id
          AND LOWER(COALESCE(sp.status, 'paid')) = 'paid'
          AND LOWER(COALESCE(sp.payment_type, 'sales')) = 'sales'
      ), 0
    )
    -- Minus: sales_order_payments where status = 'paid' (new payment system)
    - COALESCE(
      (
        SELECT SUM(COALESCE(sop.amount, 0))
        FROM public.tblsales_order_payments sop
        JOIN public.tblsales_order so ON so.id = sop.sales_order_id
        WHERE so.customer_id = p_customer_id
          AND LOWER(COALESCE(sop.status, '')) = 'paid'
      ), 0
    )
  ),
  updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;
