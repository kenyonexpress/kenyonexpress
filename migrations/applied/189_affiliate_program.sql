-- STEP 79: Affiliate Program
-- Includes affiliate accounts, tracking, commission rules, and payout system

-- Affiliate accounts table
CREATE TABLE affiliates (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  commission_rate INTEGER NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 10000), -- basis points (0-100%)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification')),
  total_clicks BIGINT DEFAULT 0,
  total_attributed_orders BIGINT DEFAULT 0,
  total_commissions BIGINT DEFAULT 0, -- agorot
  total_paid_out BIGINT DEFAULT 0, -- agorot
  pending_balance BIGINT DEFAULT 0, -- agorot
  verification_document_url TEXT, -- ID or business document
  bank_account_id BIGINT, -- Link to payment info
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Affiliate links table (for tracking unique links with custom parameters)
CREATE TABLE affiliate_links (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES affiliates ON DELETE CASCADE,
  utm_source TEXT DEFAULT 'affiliate',
  utm_medium TEXT DEFAULT 'referral',
  utm_campaign TEXT, -- Custom campaign name
  name TEXT, -- Friendly name for affiliate's reference
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Affiliate clicks (attribution tracking)
CREATE TABLE affiliate_clicks (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES affiliates ON DELETE CASCADE,
  session_id TEXT NOT NULL, -- Browser session identifier
  product_id BIGINT REFERENCES products ON DELETE SET NULL,
  category_id BIGINT REFERENCES categories ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 days') -- 30-day cookie window
);

-- Affiliate orders (orders attributed to affiliates for commission)
CREATE TABLE affiliate_orders (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES affiliates ON DELETE CASCADE,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders ON DELETE CASCADE,
  attributed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  order_total BIGINT, -- agorot, from order
  commission_amount BIGINT, -- calculated from commission_rate
  status TEXT NOT NULL DEFAULT 'attributed' CHECK (status IN ('attributed', 'confirmed', 'paid', 'refunded')),
  refund_amount BIGINT DEFAULT 0, -- agorot refunded (affects commission)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Commission tracking (historical record)
CREATE TABLE affiliate_commissions (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES affiliates ON DELETE CASCADE,
  affiliate_order_id BIGINT REFERENCES affiliate_orders ON DELETE SET NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0), -- agorot
  reason TEXT NOT NULL, -- 'sale', 'refund', 'adjustment'
  reference_id TEXT, -- order_id or refund_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Affiliate payouts
CREATE TABLE affiliate_payouts (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES affiliates ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0), -- agorot
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  bank_account_id BIGINT, -- Payment destination
  payment_method TEXT DEFAULT 'bank_transfer', -- 'bank_transfer', 'paypal', etc.
  external_reference TEXT, -- Bank reference ID
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: affiliates (user can only read/update own affiliate account)
CREATE POLICY affiliates_user_read ON affiliates
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY affiliates_user_update ON affiliates
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY affiliates_admin_all ON affiliates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: affiliate_links (user can manage own links)
CREATE POLICY affiliate_links_user_all ON affiliate_links
  FOR ALL USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY affiliate_links_admin_all ON affiliate_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: affiliate_clicks (users can read own, service role can insert)
CREATE POLICY affiliate_clicks_user_read ON affiliate_clicks
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY affiliate_clicks_service_insert ON affiliate_clicks
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY affiliate_clicks_admin_all ON affiliate_clicks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: affiliate_orders (users can read own, service role can insert)
CREATE POLICY affiliate_orders_user_read ON affiliate_orders
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY affiliate_orders_service_insert ON affiliate_orders
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY affiliate_orders_admin_all ON affiliate_orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: affiliate_commissions (users can read own, service role can insert)
CREATE POLICY affiliate_commissions_user_read ON affiliate_commissions
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY affiliate_commissions_service_all ON affiliate_commissions
  FOR ALL WITH CHECK (auth.role() = 'service_role');

CREATE POLICY affiliate_commissions_admin_all ON affiliate_commissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: affiliate_payouts (users can read own, service role manages)
CREATE POLICY affiliate_payouts_user_read ON affiliate_payouts
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

CREATE POLICY affiliate_payouts_service_all ON affiliate_payouts
  FOR ALL WITH CHECK (auth.role() = 'service_role');

CREATE POLICY affiliate_payouts_admin_all ON affiliate_payouts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- Indexes for performance
CREATE INDEX idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX idx_affiliates_affiliate_code ON affiliates(affiliate_code);
CREATE INDEX idx_affiliates_status ON affiliates(status);
CREATE INDEX idx_affiliate_links_affiliate_id ON affiliate_links(affiliate_id);
CREATE INDEX idx_affiliate_links_utm_campaign ON affiliate_links(utm_campaign);
CREATE INDEX idx_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id);
CREATE INDEX idx_affiliate_clicks_session_id ON affiliate_clicks(session_id);
CREATE INDEX idx_affiliate_clicks_created_at ON affiliate_clicks(created_at);
CREATE INDEX idx_affiliate_clicks_expires_at ON affiliate_clicks(expires_at);
CREATE INDEX idx_affiliate_orders_affiliate_id ON affiliate_orders(affiliate_id);
CREATE INDEX idx_affiliate_orders_order_id ON affiliate_orders(order_id);
CREATE INDEX idx_affiliate_orders_status ON affiliate_orders(status);
CREATE INDEX idx_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id);
CREATE INDEX idx_affiliate_commissions_created_at ON affiliate_commissions(created_at);
CREATE INDEX idx_affiliate_payouts_affiliate_id ON affiliate_payouts(affiliate_id);
CREATE INDEX idx_affiliate_payouts_status ON affiliate_payouts(status);

-- RPC function: Create affiliate account
CREATE OR REPLACE FUNCTION fn_create_affiliate(
  p_commission_rate INTEGER DEFAULT 500 -- default 5% (500 basis points)
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_id BIGINT;
  v_affiliate_code TEXT;
BEGIN
  -- Check if user already has affiliate account
  IF EXISTS (SELECT 1 FROM affiliates WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already has an affiliate account';
  END IF;

  -- Generate unique affiliate code (first 8 chars of base64-encoded UUID)
  v_affiliate_code := 'AFF' || SUBSTR(encode(digest(auth.uid()::text || now()::text, 'sha256'), 'base64'), 1, 8);

  -- Create affiliate account
  INSERT INTO affiliates (user_id, affiliate_code, commission_rate, status)
  VALUES (auth.uid(), v_affiliate_code, p_commission_rate, 'pending_verification')
  RETURNING id INTO v_affiliate_id;

  RETURN jsonb_build_object(
    'affiliate_id', v_affiliate_id,
    'affiliate_code', v_affiliate_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: Record affiliate click
CREATE OR REPLACE FUNCTION fn_record_affiliate_click(
  p_affiliate_code TEXT,
  p_session_id TEXT,
  p_product_id BIGINT DEFAULT NULL,
  p_category_id BIGINT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_id BIGINT;
  v_click_id BIGINT;
BEGIN
  -- Find affiliate
  SELECT id INTO v_affiliate_id FROM affiliates
  WHERE affiliate_code = p_affiliate_code AND status = 'active';

  IF v_affiliate_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate code not found or inactive: %', p_affiliate_code;
  END IF;

  -- Record click
  INSERT INTO affiliate_clicks (
    affiliate_id, session_id, product_id, category_id,
    ip_address, user_agent, referrer
  )
  VALUES (
    v_affiliate_id, p_session_id, p_product_id, p_category_id,
    p_ip_address, p_user_agent, p_referrer
  )
  RETURNING id INTO v_click_id;

  -- Increment click counter
  UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE id = v_affiliate_id;

  RETURN jsonb_build_object(
    'click_id', v_click_id,
    'affiliate_id', v_affiliate_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: Attribute order to affiliate
CREATE OR REPLACE FUNCTION fn_attribute_order_to_affiliate(
  p_order_id BIGINT,
  p_session_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_click_id BIGINT;
  v_affiliate_id BIGINT;
  v_affiliate_order_id BIGINT;
  v_order_total BIGINT;
  v_commission_rate INTEGER;
  v_commission_amount BIGINT;
BEGIN
  -- Find click from session (within 30-day window)
  SELECT ac.id, ac.affiliate_id INTO v_affiliate_click_id, v_affiliate_id
  FROM affiliate_clicks ac
  WHERE ac.session_id = p_session_id AND ac.expires_at > now()
  ORDER BY ac.created_at DESC
  LIMIT 1;

  IF v_affiliate_id IS NULL THEN
    -- No affiliate attribution
    RETURN jsonb_build_object('attributed', false);
  END IF;

  -- Get order total and commission rate
  SELECT o.total INTO v_order_total FROM orders o WHERE o.id = p_order_id;
  SELECT commission_rate INTO v_commission_rate FROM affiliates WHERE id = v_affiliate_id;

  IF v_order_total IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Calculate commission
  v_commission_amount := (v_order_total * v_commission_rate) / 10000;

  -- Create affiliate order
  INSERT INTO affiliate_orders (
    affiliate_id, order_id, order_total, commission_amount, status
  )
  VALUES (v_affiliate_id, p_order_id, v_order_total, v_commission_amount, 'attributed')
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_affiliate_order_id;

  IF v_affiliate_order_id IS NOT NULL THEN
    -- Record commission
    INSERT INTO affiliate_commissions (affiliate_id, affiliate_order_id, amount, reason, reference_id)
    VALUES (v_affiliate_id, v_affiliate_order_id, v_commission_amount, 'sale', p_order_id::text);

    -- Update affiliate stats
    UPDATE affiliates SET
      total_attributed_orders = total_attributed_orders + 1,
      total_commissions = total_commissions + v_commission_amount,
      pending_balance = pending_balance + v_commission_amount
    WHERE id = v_affiliate_id;
  END IF;

  RETURN jsonb_build_object(
    'attributed', v_affiliate_order_id IS NOT NULL,
    'affiliate_id', v_affiliate_id,
    'commission_amount', v_commission_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: Get affiliate dashboard stats
CREATE OR REPLACE FUNCTION fn_get_affiliate_stats()
RETURNS TABLE (
  affiliate_code TEXT,
  total_clicks BIGINT,
  total_attributed_orders BIGINT,
  conversion_rate NUMERIC,
  total_commissions BIGINT,
  total_paid_out BIGINT,
  pending_balance BIGINT,
  average_order_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.affiliate_code,
    a.total_clicks,
    a.total_attributed_orders,
    CASE WHEN a.total_clicks > 0 THEN
      ROUND((CAST(a.total_attributed_orders AS NUMERIC) / a.total_clicks) * 100, 2)
    ELSE 0 END,
    a.total_commissions,
    a.total_paid_out,
    a.pending_balance,
    CASE WHEN a.total_attributed_orders > 0 THEN
      ROUND(CAST(a.total_commissions AS NUMERIC) / a.total_attributed_orders, 0)
    ELSE 0 END
  FROM affiliates a
  WHERE a.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql;

-- RPC function: Request affiliate payout
CREATE OR REPLACE FUNCTION fn_request_affiliate_payout(
  p_amount BIGINT
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_id BIGINT;
  v_pending_balance BIGINT;
  v_payout_id BIGINT;
BEGIN
  -- Get affiliate and check balance
  SELECT id, pending_balance INTO v_affiliate_id, v_pending_balance
  FROM affiliates WHERE user_id = auth.uid();

  IF v_affiliate_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate account not found';
  END IF;

  IF p_amount > v_pending_balance THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', v_pending_balance;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Create payout request
  INSERT INTO affiliate_payouts (affiliate_id, amount, status)
  VALUES (v_affiliate_id, p_amount, 'pending')
  RETURNING id INTO v_payout_id;

  -- Deduct from pending balance
  UPDATE affiliates SET pending_balance = pending_balance - p_amount
  WHERE id = v_affiliate_id;

  RETURN jsonb_build_object(
    'payout_id', v_payout_id,
    'amount', p_amount,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_create_affiliate TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_affiliate_click TO service_role;
GRANT EXECUTE ON FUNCTION fn_attribute_order_to_affiliate TO service_role;
GRANT EXECUTE ON FUNCTION fn_get_affiliate_stats TO authenticated;
GRANT EXECUTE ON FUNCTION fn_request_affiliate_payout TO authenticated;
