-- Set the SO number sequence to start at 8245 for year 2026
-- This ensures the next generated SO number will be 2026-8245

BEGIN;

-- Create or update a sequence tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tblsequences (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  prefix TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert or update the SO number sequence
INSERT INTO public.tblsequences (name, current_value, prefix)
VALUES ('sales_order_number', 8244, '2026')
ON CONFLICT (name) DO UPDATE SET current_value = 8244, prefix = '2026', updated_at = NOW();

COMMIT;
