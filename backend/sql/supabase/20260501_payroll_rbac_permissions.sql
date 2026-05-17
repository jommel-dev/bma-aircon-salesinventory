-- Migration: Add payroll module RBAC permissions
-- Date: 2026-05-01
-- Purpose: Add RBAC permission keys, menu entry, and role assignments for the Payroll module
-- Requirements: 10.1, 10.2, 10.3, 10.4, 10.5

BEGIN;

-- 0) Fix sequence if out of sync with existing data
SELECT setval(
  pg_get_serial_sequence('public.auth_permission_keys', 'id'),
  COALESCE((SELECT MAX(id) FROM public.auth_permission_keys), 0) + 1,
  false
);

SELECT setval(
  pg_get_serial_sequence('public.auth_menus', 'id'),
  COALESCE((SELECT MAX(id) FROM public.auth_menus), 0) + 1,
  false
);

SELECT setval(
  pg_get_serial_sequence('public.auth_role_permissions', 'id'),
  COALESCE((SELECT MAX(id) FROM public.auth_role_permissions), 0) + 1,
  false
);

-- 1) Insert payroll permission keys
INSERT INTO public.auth_permission_keys(key, label, module, scope)
VALUES
  ('payroll.view', 'View Payroll', 'payroll', 'feature'),
  ('payroll.employee.create', 'Create Payroll Employee', 'payroll', 'action'),
  ('payroll.employee.edit', 'Edit Payroll Employee', 'payroll', 'action'),
  ('payroll.employee.delete', 'Delete Payroll Employee', 'payroll', 'action'),
  ('payroll.create', 'Create Payroll', 'payroll', 'action'),
  ('payroll.cutoff.view', 'View Payroll Cutoff', 'payroll', 'feature')
ON CONFLICT (key) DO NOTHING;

-- 2) Insert payroll menu entry
INSERT INTO public.auth_menus(key, label, icon, order_index)
VALUES
  ('payroll', 'Payroll', 'payments', 7)
ON CONFLICT (key) DO NOTHING;

-- 3) Assign all payroll permissions to superadmin and admin roles
WITH privileged_roles AS (
  SELECT r.id AS role_id
  FROM public.tblrbac r
  WHERE lower(coalesce(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%admin%'
     OR lower(coalesce(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) LIKE '%super%'
), payroll_keys AS (
  SELECT id
  FROM public.auth_permission_keys
  WHERE key IN (
    'payroll.view',
    'payroll.employee.create',
    'payroll.employee.edit',
    'payroll.employee.delete',
    'payroll.create',
    'payroll.cutoff.view'
  )
)
INSERT INTO public.auth_role_permissions(role_id, permission_id)
SELECT pr.role_id, pk.id
FROM privileged_roles pr
CROSS JOIN payroll_keys pk
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4) Assign all payroll permissions to Business Owner role
WITH business_owner_role AS (
  SELECT r.id AS role_id
  FROM public.tblrbac r
  WHERE lower(coalesce(to_jsonb(r)->>'roleName', to_jsonb(r)->>'rolename', '')) = 'business owner'
  LIMIT 1
), payroll_keys AS (
  SELECT id
  FROM public.auth_permission_keys
  WHERE key IN (
    'payroll.view',
    'payroll.employee.create',
    'payroll.employee.edit',
    'payroll.employee.delete',
    'payroll.create',
    'payroll.cutoff.view'
  )
)
INSERT INTO public.auth_role_permissions(role_id, permission_id)
SELECT bo.role_id, pk.id
FROM business_owner_role bo
CROSS JOIN payroll_keys pk
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
