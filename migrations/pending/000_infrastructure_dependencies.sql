-- Infrastructure dependencies for migrations 190-288
-- Created to unblock C02 migration application

-- Admin users table (required by 190 RLS policies)
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Observability schema (required by 192-196)
CREATE SCHEMA IF NOT EXISTS observability;

-- Grant usage on observability schema
GRANT USAGE ON SCHEMA observability TO authenticated, service_role;

-- Stub permission function (required by 190)
CREATE OR REPLACE FUNCTION has_permission(permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stub: always returns false for non-super-admins
  -- Full implementation would check user permissions table
  RETURN FALSE;
END;
$$;
