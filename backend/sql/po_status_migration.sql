-- PO status migration helper
-- Run checks before applying. This script is safe for text/varchar status columns.

BEGIN;

-- Normalize existing legacy statuses to new canonical values
UPDATE tblpurchase_orders
SET status = 'for_approval'
WHERE LOWER(COALESCE(status, '')) IN ('pending', 'draft', 'new')
  AND LOWER(COALESCE(status, '')) NOT IN ('for_approval','for approval');

UPDATE tblpurchase_orders
SET status = 'in-progress'
WHERE LOWER(COALESCE(status, '')) IN ('awaiting_delivery','awaiting-delivery','awaiting delivery','awaiting')
  AND LOWER(COALESCE(status, '')) NOT IN ('in-progress','awaiting_delivery');

UPDATE tblpurchase_orders
SET status = 'completed'
WHERE LOWER(COALESCE(status, '')) IN ('request_completed','request-completed','request complete')
  AND LOWER(COALESCE(status, '')) NOT IN ('completed');

-- Optional: identify rows needing manual review
SELECT id, status FROM tblpurchase_orders WHERE LOWER(COALESCE(status, '')) NOT IN (
  'for_approval','in-progress','completed','cancelled','rejected','received','transfer_received'
) LIMIT 100;

COMMIT;

-- If your status column is an ENUM type, add new values first. Example for PostgreSQL:
-- ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'for_approval';
-- ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'in-progress';
-- ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'completed';

-- If ALTER TYPE is not supported for existing enum (older PG versions), use the safer approach:
-- 1) CREATE TYPE purchase_order_status_new AS ENUM('for_approval','in-progress','completed','cancelled','rejected','received','transfer_received');
-- 2) ALTER TABLE tblpurchase_orders ALTER COLUMN status TYPE purchase_order_status_new USING status::text::purchase_order_status_new;
-- 3) DROP TYPE purchase_order_status;
-- 4) ALTER TYPE purchase_order_status_new RENAME TO purchase_order_status;
