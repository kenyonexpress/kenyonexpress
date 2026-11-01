-- Migration 310: F66 Fraud detection tables
-- Creates:
-- - fraud_alerts: Admin-reviewable fraud events
-- - fraud_ip_signup_log: IP-based signup tracking
-- - orders.device_fingerprint: FingerprintJS device ID on orders

-- fraud_alerts: Flagged events for admin review
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  alert_type text NOT NULL, -- 'order_rate_exceeded', 'ip_signup_abuse', 'device_bulk_purchase', 'disposable_email', 'duplicate_email'
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'blocked')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_alerts_user_id ON fraud_alerts(user_id);
CREATE INDEX idx_fraud_alerts_order_id ON fraud_alerts(order_id);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts(created_at DESC);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);

-- fraud_ip_signup_log: Track signups per IP for rate limiting
CREATE TABLE IF NOT EXISTS fraud_ip_signup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_ip_signup_log_ip ON fraud_ip_signup_log(ip_address, created_at DESC);
CREATE INDEX idx_fraud_ip_signup_log_created_at ON fraud_ip_signup_log(created_at DESC);

-- Add device_fingerprint to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'device_fingerprint'
  ) THEN
    ALTER TABLE orders ADD COLUMN device_fingerprint text;
    CREATE INDEX idx_orders_device_fingerprint ON orders(device_fingerprint, created_at DESC);
  END IF;
END $$;

-- RLS policies for fraud_alerts (admin only)
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all fraud alerts"
  ON fraud_alerts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin can update fraud alerts"
  ON fraud_alerts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can insert fraud alerts
CREATE POLICY "Service can insert fraud alerts"
  ON fraud_alerts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS for fraud_ip_signup_log (service role only)
ALTER TABLE fraud_ip_signup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage IP signup log"
  ON fraud_ip_signup_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, UPDATE ON fraud_alerts TO authenticated;
GRANT INSERT ON fraud_alerts TO service_role;
GRANT ALL ON fraud_ip_signup_log TO service_role;
