-- Setup auth permission tables and view
-- This ensures the login flow doesn't lag due to missing tables/indexes

BEGIN;

-- 1. Create permission keys table if not exists
CREATE TABLE IF NOT EXISTS public.auth_permission_keys (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT,
  module TEXT,
  scope TEXT DEFAULT 'feature',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create role permissions table if not exists
CREATE TABLE IF NOT EXISTS public.auth_role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL REFERENCES public.auth_permission_keys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_role_permissions_role_id
  ON public.auth_role_permissions(role_id);

-- 3. Create user permission overrides table if not exists
CREATE TABLE IF NOT EXISTS public.auth_user_permission_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL REFERENCES public.auth_permission_keys(id) ON DELETE CASCADE,
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_user_permission_overrides_user_id
  ON public.auth_user_permission_overrides(user_id);

-- 4. Create or replace the effective permissions view
CREATE OR REPLACE VIEW public.v_auth_user_effective_permissions AS
SELECT
  u.id AS user_id,
  pk.key AS permission_key,
  pk.label AS permission_label,
  COALESCE(pk.module, '') AS module,
  COALESCE(pk.scope, 'feature') AS scope,
  CASE
    -- User-level deny overrides everything
    WHEN uo.effect = 'deny' THEN false
    -- User-level allow overrides role
    WHEN uo.effect = 'allow' THEN true
    -- Role-level permission
    WHEN rp.id IS NOT NULL THEN true
    -- No permission
    ELSE false
  END AS is_allowed,
  CASE
    WHEN uo.effect = 'deny' THEN 'user-deny'
    WHEN uo.effect = 'allow' THEN 'user-allow'
    WHEN rp.id IS NOT NULL THEN 'role'
    ELSE 'none'
  END AS source
FROM tblusers u
CROSS JOIN auth_permission_keys pk
LEFT JOIN auth_role_permissions rp
  ON rp.role_id = NULLIF(
    COALESCE(
      to_jsonb(u)->>'roleId',
      to_jsonb(u)->>'roleid',
      to_jsonb(u)->>'role_id'
    ),
    ''
  )::int
  AND rp.permission_id = pk.id
LEFT JOIN auth_user_permission_overrides uo
  ON uo.user_id = u.id
  AND uo.permission_id = pk.id
WHERE u.id IS NOT NULL;

COMMIT;
