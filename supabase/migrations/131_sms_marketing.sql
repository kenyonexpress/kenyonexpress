-- SMS Marketing Infrastructure: Broadcasts, Unsubscribes, Delivery Events

-- sms_broadcasts table: SMS campaign definitions
CREATE TABLE IF NOT EXISTS public.sms_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_name text NOT NULL,
  message_content text NOT NULL,
  quiet_hours_start text, -- "HH:MM" format, e.g., "22:00"
  quiet_hours_end text,   -- "HH:MM" format, e.g., "08:00"
  timezone text DEFAULT 'Asia/Jerusalem',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'paused', 'cancelled')),
  scheduled_at timestamp with time zone,
  sent_at timestamp with time zone,
  total_recipients integer DEFAULT 0,
  successful_sends integer DEFAULT 0,
  failed_sends integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- sms_unsubscribes table: Users who opted out of SMS marketing
CREATE TABLE IF NOT EXISTS public.sms_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  segment_name text, -- NULL for global unsubscribe, specific segment name for segment-level unsubscribe
  reason text, -- 'stop_keyword', 'user_request', 'admin_action'
  unsubscribed_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, segment_name)
);

-- sms_delivery_events table: Twilio webhook delivery status
CREATE TABLE IF NOT EXISTS public.sms_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  broadcast_id uuid REFERENCES public.sms_broadcasts(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('sent', 'delivered', 'failed', 'bounced')),
  error_code text,
  error_message text,
  received_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on SMS tables
ALTER TABLE public.sms_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_delivery_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_broadcasts
CREATE POLICY "sms_broadcasts_created_by" ON public.sms_broadcasts
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "sms_broadcasts_admin_insert" ON public.sms_broadcasts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "sms_broadcasts_admin_update" ON public.sms_broadcasts
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "sms_broadcasts_admin_delete" ON public.sms_broadcasts
  FOR DELETE USING (created_by = auth.uid());

-- RLS Policies for sms_unsubscribes (user privacy)
CREATE POLICY "sms_unsubscribes_own" ON public.sms_unsubscribes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sms_unsubscribes_insert_own" ON public.sms_unsubscribes
  FOR INSERT WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND auth.uid() IS NOT NULL));

CREATE POLICY "sms_unsubscribes_update_own" ON public.sms_unsubscribes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RLS Policies for sms_delivery_events (service role only for webhook writes)
CREATE POLICY "sms_delivery_events_webhook" ON public.sms_delivery_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "sms_delivery_events_admin_read" ON public.sms_delivery_events
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin')
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS sms_broadcasts_created_by_idx ON public.sms_broadcasts(created_by);
CREATE INDEX IF NOT EXISTS sms_broadcasts_status_idx ON public.sms_broadcasts(status);
CREATE INDEX IF NOT EXISTS sms_unsubscribes_user_id_idx ON public.sms_unsubscribes(user_id);
CREATE INDEX IF NOT EXISTS sms_unsubscribes_segment_idx ON public.sms_unsubscribes(segment_name);
CREATE INDEX IF NOT EXISTS sms_delivery_events_twilio_sid_idx ON public.sms_delivery_events(twilio_sid);
CREATE INDEX IF NOT EXISTS sms_delivery_events_user_id_idx ON public.sms_delivery_events(user_id);
CREATE INDEX IF NOT EXISTS sms_delivery_events_broadcast_id_idx ON public.sms_delivery_events(broadcast_id);

-- RPC function to check if user is unsubscribed from SMS
CREATE OR REPLACE FUNCTION public.fn_is_sms_unsubscribed(
  p_user_id uuid,
  p_segment_name text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  -- Check for global unsubscribe (segment_name = NULL)
  IF EXISTS (SELECT 1 FROM sms_unsubscribes WHERE user_id = p_user_id AND segment_name IS NULL) THEN
    RETURN true;
  END IF;

  -- Check for segment-specific unsubscribe
  IF p_segment_name IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM sms_unsubscribes WHERE user_id = p_user_id AND segment_name = p_segment_name) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to process SMS delivery events from Twilio webhooks
CREATE OR REPLACE FUNCTION public.fn_process_sms_delivery_event(
  p_twilio_sid text,
  p_event_type text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  INSERT INTO public.sms_delivery_events (twilio_sid, event_type, error_code, error_message)
  VALUES (p_twilio_sid, p_event_type, p_error_code, p_error_message);
EXCEPTION WHEN unique_violation THEN
  -- Idempotent: webhook may fire multiple times for same event
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fn_is_sms_unsubscribed TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_process_sms_delivery_event TO service_role;
