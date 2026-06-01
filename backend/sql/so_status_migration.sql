-- Sales Order status migration
-- Normalizes legacy/incomplete statuses to the canonical values used by the app.
-- Canonical SO statuses: draft, pending, complete, voided
--
-- Run this in Supabase SQL editor or psql. Safe to run multiple times (idempotent).

BEGIN;

-- 1. Normalize common legacy variants → 'draft'
UPDATE tblsales_order
SET status = 'draft'
WHERE LOWER(COALESCE(status, '')) IN ('new', 'created', 'open', 'in-progress', 'in_progress', 'processing')
  AND LOWER(COALESCE(status, '')) NOT IN ('draft');

-- 2. Normalize legacy variants → 'pending'
UPDATE tblsales_order
SET status = 'pending'
WHERE LOWER(COALESCE(status, '')) IN ('approved', 'confirmed', 'for_delivery', 'for-delivery', 'awaiting', 'awaiting_delivery', 'awaiting-delivery')
  AND LOWER(COALESCE(status, '')) NOT IN ('pending');

-- 3. Normalize legacy variants → 'complete'
UPDATE tblsales_order
SET status = 'complete'
WHERE LOWER(COALESCE(status, '')) IN ('completed', 'done', 'delivered', 'closed', 'finished', 'transfer_received')
  AND LOWER(COALESCE(status, '')) NOT IN ('complete');

-- 4. Normalize legacy variants → 'voided'
UPDATE tblsales_order
SET status = 'voided'
WHERE LOWER(COALESCE(status, '')) IN ('void', 'cancelled', 'canceled', 'rejected', 'deleted')
  AND LOWER(COALESCE(status, '')) NOT IN ('voided');

-- 5. Fallback: any remaining unrecognized status → 'draft'
UPDATE tblsales_order
SET status = 'draft'
WHERE LOWER(COALESCE(status, '')) NOT IN ('draft', 'pending', 'complete', 'voided');

-- 6. Verify: show any rows that still have unexpected statuses (should return 0 rows)
SELECT id, status, so_number
FROM tblsales_order
WHERE LOWER(COALESCE(status, '')) NOT IN ('draft', 'pending', 'complete', 'voided')
LIMIT 20;

COMMIT;
