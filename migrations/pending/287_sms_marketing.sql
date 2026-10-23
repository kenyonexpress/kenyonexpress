-- STEP 78: SMS Marketing system with Twilio integration
-- Includes broadcast schema, recipient tracking, delivery events, consent management, and RLS

-- SMS broadcasts table
CREATE TABLE sms_broadcasts (
  id BIGSERIAL PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  phone_number TEXT NOT NULL, -- Twilio sender number
  message TEXT NOT NULL,
  -- Template placeholders: {firstName}, {phone}, {code}, {link}
  segment_name TEXT NOT NULL CHECK (segment_name IN ('Champions', 'Loyal', 'Potential', 'At-Risk', 'Dormant')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0, -- Invalid number
  opted_out_count INTEGER DEFAULT 0, -- STOP keyword response
  replied_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users ON DELETE SET NULL,
  quiet_hours_start TIME, -- e.g., '20:00' for 8 PM
  quiet_hours_end TIME, -- e.g., '08:00' for 8 AM (next day if end < start)
  quiet_hours_tz TEXT DEFAULT 'Asia/Jerusalem'
);

-- SMS broadcast recipients
CREATE TABLE sms_broadcast_recipients (
  id BIGSERIAL PRIMARY KEY,
  broadcast_id BIGINT NOT NULL REFERENCES sms_broadcasts ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced', 'opted_out')),
  twilio_sid TEXT, -- Twilio message SID for tracking
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  failed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(broadcast_id, user_id)
);

-- SMS delivery events (webhooks from Twilio)
CREATE TABLE sms_delivery_events (
  id BIGSERIAL PRIMARY KEY,
  broadcast_id BIGINT NOT NULL REFERENCES sms_broadcasts ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  twilio_sid TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'failed', 'bounced', 'unsubscribe')),
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(twilio_sid, event_type) -- Prevent duplicate webhook processing
);

-- SMS unsubscribe tracking (STOP keyword)
CREATE TABLE sms_unsubscribes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  segment_name TEXT, -- NULL = global unsubscribe, specific segment = segment-only unsubscribe
  reason TEXT DEFAULT 'stop_keyword',
  unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, segment_name)
);

-- SMS consent table (tracks opt-in status)
CREATE TABLE sms_consent (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  opted_in BOOLEAN DEFAULT FALSE,
  marketing_opted_in BOOLEAN DEFAULT FALSE,
  consent_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE sms_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_consent ENABLE ROW LEVEL SECURITY;

-- RLS Policies: sms_broadcasts (admin only)
CREATE POLICY sms_broadcasts_admin_all ON sms_broadcasts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY sms_broadcasts_creator_read ON sms_broadcasts
  FOR SELECT USING (created_by = auth.uid());

-- RLS Policies: sms_broadcast_recipients (admin + self-read for own receipts)
CREATE POLICY sms_broadcast_recipients_admin_all ON sms_broadcast_recipients
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY sms_broadcast_recipients_user_read ON sms_broadcast_recipients
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policies: sms_delivery_events (admin + webhook service role)
CREATE POLICY sms_delivery_events_admin_all ON sms_delivery_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY sms_delivery_events_service_insert ON sms_delivery_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- RLS Policies: sms_unsubscribes (user self-service + admin)
CREATE POLICY sms_unsubscribes_user_manage ON sms_unsubscribes
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY sms_unsubscribes_admin_all ON sms_unsubscribes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY sms_unsubscribes_service_insert ON sms_unsubscribes
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- RLS Policies: sms_consent (user self-service + admin)
CREATE POLICY sms_consent_user_manage ON sms_consent
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY sms_consent_admin_all ON sms_consent
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- RLS Policies: sms_consent service role can insert
CREATE POLICY sms_consent_service_insert ON sms_consent
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_sms_broadcasts_created_by ON sms_broadcasts(created_by);
CREATE INDEX idx_sms_broadcasts_status ON sms_broadcasts(status);
CREATE INDEX idx_sms_broadcasts_segment ON sms_broadcasts(segment_name);
CREATE INDEX idx_sms_broadcast_recipients_broadcast_id ON sms_broadcast_recipients(broadcast_id);
CREATE INDEX idx_sms_broadcast_recipients_user_id ON sms_broadcast_recipients(user_id);
CREATE INDEX idx_sms_broadcast_recipients_status ON sms_broadcast_recipients(status);
CREATE INDEX idx_sms_broadcast_recipients_twilio_sid ON sms_broadcast_recipients(twilio_sid);
CREATE INDEX idx_sms_delivery_events_broadcast_id ON sms_delivery_events(broadcast_id);
CREATE INDEX idx_sms_delivery_events_twilio_sid ON sms_delivery_events(twilio_sid);
CREATE INDEX idx_sms_delivery_events_event_type ON sms_delivery_events(event_type);
CREATE INDEX idx_sms_unsubscribes_user_id ON sms_unsubscribes(user_id);
CREATE INDEX idx_sms_unsubscribes_phone_number ON sms_unsubscribes(phone_number);
CREATE INDEX idx_sms_unsubscribes_segment_name ON sms_unsubscribes(segment_name);
CREATE INDEX idx_sms_consent_user_id ON sms_consent(user_id);

-- RPC function: Create SMS broadcast and populate recipients
CREATE OR REPLACE FUNCTION fn_create_sms_broadcast(
  p_name TEXT,
  p_description TEXT,
  p_phone_number TEXT,
  p_message TEXT,
  p_segment_name TEXT,
  p_scheduled_at TIMESTAMP WITH TIME ZONE,
  p_quiet_hours_start TIME,
  p_quiet_hours_end TIME
)
RETURNS JSONB AS $$
DECLARE
  v_broadcast_id BIGINT;
  v_recipient_count INTEGER;
BEGIN
  -- Validate input
  IF p_message IS NULL OR p_message = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  IF p_segment_name NOT IN ('Champions', 'Loyal', 'Potential', 'At-Risk', 'Dormant') THEN
    RAISE EXCEPTION 'Invalid segment name: %', p_segment_name;
  END IF;

  -- Create broadcast
  INSERT INTO sms_broadcasts (
    created_by, name, description, phone_number, message,
    segment_name, status, scheduled_at,
    quiet_hours_start, quiet_hours_end
  )
  VALUES (auth.uid(), p_name, p_description, p_phone_number, p_message, p_segment_name, 'draft', p_scheduled_at,
    p_quiet_hours_start, p_quiet_hours_end)
  RETURNING id INTO v_broadcast_id;

  -- Populate recipients from segment (customers who have opted in and not unsubscribed from this segment)
  WITH eligible_recipients AS (
    SELECT DISTINCT p.user_id, p.phone_number
    FROM profiles p
    INNER JOIN sms_consent sc ON p.user_id = sc.user_id AND sc.marketing_opted_in = TRUE
    LEFT JOIN sms_unsubscribes su ON p.user_id = su.user_id
      AND (su.segment_name = p_segment_name OR su.segment_name IS NULL)
    INNER JOIN customer_segments cs ON p.user_id = cs.user_id AND cs.segment_name = p_segment_name
    WHERE su.id IS NULL -- Not unsubscribed
      AND p.phone_number IS NOT NULL
  )
  INSERT INTO sms_broadcast_recipients (broadcast_id, user_id, phone_number, status)
  SELECT v_broadcast_id, user_id, phone_number, 'queued'
  FROM eligible_recipients;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  -- Update broadcast recipient count
  UPDATE sms_broadcasts SET total_recipients = v_recipient_count WHERE id = v_broadcast_id;

  RETURN jsonb_build_object(
    'id', v_broadcast_id,
    'recipient_count', v_recipient_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: Get SMS broadcast statistics
CREATE OR REPLACE FUNCTION fn_get_sms_broadcast_stats(p_broadcast_id BIGINT)
RETURNS TABLE (
  sent_count BIGINT,
  delivered_count BIGINT,
  failed_count BIGINT,
  bounced_count BIGINT,
  opted_out_count BIGINT,
  delivery_rate NUMERIC,
  bounce_rate NUMERIC,
  optout_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'opted_out' THEN 1 ELSE 0 END), 0),
    CASE WHEN COUNT(*) > 0 THEN
      ROUND((CAST(SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END) AS NUMERIC) / COUNT(*)) * 100, 2)
    ELSE 0 END,
    CASE WHEN COUNT(*) > 0 THEN
      ROUND((CAST(SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS NUMERIC) / COUNT(*)) * 100, 2)
    ELSE 0 END,
    CASE WHEN COUNT(*) > 0 THEN
      ROUND((CAST(SUM(CASE WHEN status = 'opted_out' THEN 1 ELSE 0 END) AS NUMERIC) / COUNT(*)) * 100, 2)
    ELSE 0 END
  FROM sms_broadcast_recipients
  WHERE broadcast_id = p_broadcast_id;
END;
$$ LANGUAGE plpgsql;

-- RPC function: Process SMS delivery event and update unsubscribes for STOP keyword
CREATE OR REPLACE FUNCTION fn_process_sms_delivery_event(
  p_twilio_sid TEXT,
  p_event_type TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_broadcast_id BIGINT;
  v_user_id UUID;
  v_phone_number TEXT;
  v_segment_name TEXT;
BEGIN
  -- Find the recipient
  SELECT br.broadcast_id, br.user_id, br.phone_number, sb.segment_name
  INTO v_broadcast_id, v_user_id, v_phone_number, v_segment_name
  FROM sms_broadcast_recipients br
  JOIN sms_broadcasts sb ON br.broadcast_id = sb.id
  WHERE br.twilio_sid = p_twilio_sid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found for SID: %', p_twilio_sid;
  END IF;

  -- Record event
  INSERT INTO sms_delivery_events (broadcast_id, user_id, twilio_sid, event_type, error_code, error_message)
  VALUES (v_broadcast_id, v_user_id, p_twilio_sid, p_event_type, p_error_code, p_error_message);

  -- Update recipient status
  UPDATE sms_broadcast_recipients
  SET status = p_event_type,
      updated_at = now()
  WHERE twilio_sid = p_twilio_sid;

  -- If unsubscribe event (STOP keyword), record it
  IF p_event_type = 'unsubscribe' THEN
    INSERT INTO sms_unsubscribes (user_id, phone_number, segment_name, reason)
    VALUES (v_user_id, v_phone_number, v_segment_name, 'stop_keyword')
    ON CONFLICT (user_id, segment_name) DO UPDATE SET
      unsubscribed_at = now(),
      reason = 'stop_keyword';
  END IF;

  -- Update broadcast aggregates
  UPDATE sms_broadcasts
  SET
    sent_count = (SELECT COALESCE(SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END), 0) FROM sms_broadcast_recipients WHERE broadcast_id = v_broadcast_id),
    delivered_count = (SELECT COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) FROM sms_broadcast_recipients WHERE broadcast_id = v_broadcast_id),
    failed_count = (SELECT COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) FROM sms_broadcast_recipients WHERE broadcast_id = v_broadcast_id),
    bounced_count = (SELECT COALESCE(SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END), 0) FROM sms_broadcast_recipients WHERE broadcast_id = v_broadcast_id),
    opted_out_count = (SELECT COALESCE(SUM(CASE WHEN status = 'opted_out' THEN 1 ELSE 0 END), 0) FROM sms_broadcast_recipients WHERE broadcast_id = v_broadcast_id),
    updated_at = now()
  WHERE id = v_broadcast_id;

  RETURN jsonb_build_object(
    'broadcast_id', v_broadcast_id,
    'recipient_sid', p_twilio_sid,
    'event_type', p_event_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: Get segment for SMS broadcast (for admin reference)
CREATE OR REPLACE FUNCTION fn_get_segment_for_sms_broadcast(p_broadcast_id BIGINT)
RETURNS TABLE (
  segment_name TEXT,
  total_recipients INTEGER,
  opted_in_count BIGINT,
  contacted_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sb.segment_name,
    sb.total_recipients,
    (SELECT COUNT(*) FROM sms_consent WHERE marketing_opted_in = TRUE),
    (SELECT COUNT(*) FROM sms_broadcast_recipients WHERE broadcast_id = p_broadcast_id AND status != 'queued')
  FROM sms_broadcasts sb
  WHERE sb.id = p_broadcast_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_create_sms_broadcast TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_sms_broadcast_stats TO authenticated;
GRANT EXECUTE ON FUNCTION fn_process_sms_delivery_event TO service_role;
GRANT EXECUTE ON FUNCTION fn_get_segment_for_sms_broadcast TO authenticated;
