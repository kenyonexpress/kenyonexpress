-- Migration 190: Partner API Infrastructure
-- Provides read-only API access for approved partners with key-based authentication,
-- scope-based authorization, and rate limiting tracking.

-- Partners table (organizations with API access)
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partner API key scopes
CREATE TYPE partner_api_scope AS ENUM (
  'products:read',      -- Read product catalogue
  'categories:read',    -- Read categories
  'orders:read',        -- Read order data
  'inventory:read',     -- Read stock levels
  'prices:read'         -- Read pricing information
);

-- Partner API keys table
CREATE TABLE partner_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  scopes partner_api_scope[] NOT NULL DEFAULT ARRAY['products:read', 'categories:read']::partner_api_scope[],
  rate_limit_per_hour INT NOT NULL DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  CONSTRAINT valid_key_hash CHECK (char_length(key_hash) = 64),
  CONSTRAINT valid_rate_limit CHECK (rate_limit_per_hour > 0 AND rate_limit_per_hour <= 100000)
);

CREATE INDEX idx_partner_api_keys_partner_id ON partner_api_keys(partner_id);
CREATE INDEX idx_partner_api_keys_key_hash ON partner_api_keys(key_hash);
CREATE INDEX idx_partner_api_keys_active ON partner_api_keys(is_active) WHERE is_active = TRUE;

-- Partner API audit log
CREATE TABLE partner_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES partner_api_keys(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method VARCHAR(10) NOT NULL,
  scope_required partner_api_scope NOT NULL,
  response_status INT NOT NULL,
  response_time_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_method CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD')),
  CONSTRAINT valid_status CHECK (response_status >= 100 AND response_status < 600),
  CONSTRAINT valid_response_time CHECK (response_time_ms >= 0)
);

CREATE INDEX idx_partner_api_requests_api_key_id ON partner_api_requests(api_key_id);
CREATE INDEX idx_partner_api_requests_partner_id ON partner_api_requests(partner_id);
CREATE INDEX idx_partner_api_requests_created_at ON partner_api_requests(created_at);

-- Rate limit tracking (hourly window)
CREATE TABLE partner_api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES partner_api_keys(id) ON DELETE CASCADE,
  hour_window TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(api_key_id, hour_window)
);

CREATE INDEX idx_partner_api_rate_limits_api_key_id ON partner_api_rate_limits(api_key_id, hour_window);

-- RLS Policies

ALTER TABLE partner_api_keys ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all API keys
CREATE POLICY partner_api_keys_admin_all ON partner_api_keys
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
      AND (is_super_admin OR has_permission('api_management'))
    )
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
      AND (is_super_admin OR has_permission('api_management'))
    )
  );

-- Partners can view their own API keys
CREATE POLICY partner_api_keys_partner_own ON partner_api_keys
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'authenticated'
    AND partner_id = (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );

-- Only service role can manage rate limits
ALTER TABLE partner_api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_api_rate_limits_service_only ON partner_api_rate_limits
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Audit log is service-only
ALTER TABLE partner_api_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_api_requests_service_only ON partner_api_requests
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
  );

-- RPC: Create a new API key for a partner
CREATE OR REPLACE FUNCTION fn_create_partner_api_key(
  p_partner_id UUID,
  p_name TEXT,
  p_key_hash VARCHAR(64),
  p_scopes partner_api_scope[],
  p_rate_limit_per_hour INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
  v_result JSONB;
BEGIN
  -- Only service role and admins can create API keys
  IF auth.jwt() ->> 'role' NOT IN ('service_role', 'authenticated') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- If authenticated, must be partner owner or admin
  IF auth.jwt() ->> 'role' = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM partners WHERE id = p_partner_id AND user_id = auth.uid()
    ) AND NOT EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_super_admin
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  INSERT INTO partner_api_keys (partner_id, name, key_hash, scopes, rate_limit_per_hour, created_by, updated_by)
  VALUES (p_partner_id, p_name, p_key_hash, p_scopes, p_rate_limit_per_hour, COALESCE(auth.uid(), gen_random_uuid()), COALESCE(auth.uid(), gen_random_uuid()))
  RETURNING id INTO v_key_id;

  v_result := jsonb_build_object(
    'id', v_key_id,
    'partner_id', p_partner_id,
    'name', p_name,
    'scopes', p_scopes,
    'rate_limit_per_hour', p_rate_limit_per_hour
  );

  RETURN v_result;
END;
$$;

-- RPC: Check and increment rate limit
CREATE OR REPLACE FUNCTION fn_check_api_rate_limit(
  p_api_key_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key record;
  v_current_hour TIMESTAMPTZ;
  v_request_count INT;
  v_result JSONB;
BEGIN
  -- Only service role
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get API key details
  SELECT * INTO v_key FROM partner_api_keys WHERE id = p_api_key_id AND is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'Invalid or inactive API key');
  END IF;

  -- Check expiration
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < now() THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'API key expired');
  END IF;

  -- Get current hour window
  v_current_hour := date_trunc('hour', now());

  -- Update or insert rate limit record
  INSERT INTO partner_api_rate_limits (api_key_id, hour_window, request_count)
  VALUES (p_api_key_id, v_current_hour, 1)
  ON CONFLICT (api_key_id, hour_window)
  DO UPDATE SET request_count = request_count + 1, updated_at = now()
  RETURNING request_count INTO v_request_count;

  -- Check if limit exceeded
  IF v_request_count > v_key.rate_limit_per_hour THEN
    v_result := jsonb_build_object(
      'allowed', FALSE,
      'reason', 'Rate limit exceeded',
      'limit', v_key.rate_limit_per_hour,
      'current', v_request_count
    );
  ELSE
    v_result := jsonb_build_object(
      'allowed', TRUE,
      'remaining', v_key.rate_limit_per_hour - v_request_count,
      'limit', v_key.rate_limit_per_hour
    );
  END IF;

  -- Update last_used_at
  UPDATE partner_api_keys SET last_used_at = now() WHERE id = p_api_key_id;

  RETURN v_result;
END;
$$;

-- RPC: Log API request
CREATE OR REPLACE FUNCTION fn_log_api_request(
  p_api_key_id UUID,
  p_endpoint TEXT,
  p_method VARCHAR(10),
  p_scope partner_api_scope,
  p_response_status INT,
  p_response_time_ms INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
BEGIN
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT partner_id INTO v_partner_id FROM partner_api_keys WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO partner_api_requests (api_key_id, partner_id, endpoint, method, scope_required, response_status, response_time_ms)
  VALUES (p_api_key_id, v_partner_id, p_endpoint, p_method, p_scope, p_response_status, p_response_time_ms);
END;
$$;

-- Cleanup: Remove old rate limit records (older than 25 hours)
CREATE OR REPLACE FUNCTION fn_cleanup_old_rate_limits()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM partner_api_rate_limits
  WHERE hour_window < date_trunc('hour', now()) - INTERVAL '25 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
