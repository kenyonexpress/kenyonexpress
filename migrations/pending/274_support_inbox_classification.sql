-- STEP 96: Customer support inbox classification bot
-- Stores support messages, classifications, and auto-responses
-- Integrates with existing email + WhatsApp routing to owner

CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Customer contact info
  customer_email varchar(254) NOT NULL,
  customer_name varchar(80) NOT NULL,
  customer_phone varchar(20),

  -- Message content
  message_body text NOT NULL,
  subject varchar(200),

  -- Classification
  category varchar(50) NOT NULL DEFAULT 'unknown',
  -- Categories: 'order_status', 'refund', 'delivery', 'product_quality',
  --            'technical', 'billing', 'other', 'unknown'
  is_complex boolean NOT NULL DEFAULT false,
  complexity_score integer NOT NULL DEFAULT 0, -- 0-100, >70 = complex
  classification_reason text,

  -- Response tracking
  auto_response_sent_at timestamptz,
  auto_response_template varchar(100),
  owner_notified_at timestamptz,
  owner_response_at timestamptz,

  -- Message status
  status varchar(50) NOT NULL DEFAULT 'new',
  -- Statuses: 'new', 'auto_responded', 'owner_notified', 'resolved'

  -- Metadata
  source varchar(20) NOT NULL DEFAULT 'contact_form',
  -- Sources: 'contact_form', 'whatsapp', 'email'
  metadata jsonb,
  tags text[] DEFAULT ARRAY[]::text[],

  CONSTRAINT message_length CHECK (char_length(message_body) > 9),
  CONSTRAINT status_valid CHECK (status IN ('new', 'auto_responded', 'owner_notified', 'resolved')),
  CONSTRAINT category_valid CHECK (
    category IN (
      'order_status', 'refund', 'delivery', 'product_quality',
      'technical', 'billing', 'other', 'unknown'
    )
  )
);

CREATE INDEX idx_support_messages_status ON support_messages(status);
CREATE INDEX idx_support_messages_category ON support_messages(category);
CREATE INDEX idx_support_messages_created_at ON support_messages(created_at DESC);
CREATE INDEX idx_support_messages_customer_email ON support_messages(customer_email);
CREATE INDEX idx_support_messages_is_complex ON support_messages(is_complex);

-- RLS: Public can insert (contact form), anon cannot read
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_support_messages" ON support_messages
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON support_messages
  USING (auth.role() = 'service_role');

-- Auto-response templates
CREATE TABLE support_auto_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  category varchar(50) NOT NULL UNIQUE,
  -- Maps to support_messages.category

  template_key varchar(100) NOT NULL,
  subject_he varchar(200) NOT NULL,
  body_he text NOT NULL,

  enabled boolean NOT NULL DEFAULT true,
  complexity_threshold integer NOT NULL DEFAULT 30,
  -- Only send auto-response if complexity_score < threshold

  CONSTRAINT category_valid CHECK (
    category IN (
      'order_status', 'refund', 'delivery', 'product_quality',
      'technical', 'billing', 'other'
    )
  )
);

ALTER TABLE support_auto_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_auto_responses" ON support_auto_responses
  USING (auth.role() = 'service_role');

-- Seed auto-response templates
INSERT INTO support_auto_responses (category, template_key, subject_he, body_he, complexity_threshold)
VALUES
  ('order_status',
   'order_status_auto',
   'סטטוס הזמנתך',
   'תודה על פנייתך. אנחנו בודקים את סטטוס ההזמנה שלך וחוזרים אליך בהקדם ביותר.
   ניתן לתבוע את ההזמנה בעמוד החשבון האישי שלך.',
   25),

  ('delivery',
   'delivery_auto',
   'משלוח ודיוור',
   'תודה על השאלה בנוגע למשלוח. עמוד החשבון שלך מציג את סטטוס משלוחך בזמן אמת.
   לשאלות נוסף, חוזרים אליך בהקדם.',
   25),

  ('product_quality',
   'quality_auto',
   'בעיה בתוצר',
   'אנחנו מצטערים על הבעיה שחוויתה. יצרנו תיקייה לפנייתך ואנחנו בודקים את הפרטים.
   צפה לחזרה שלנו בחלון ה-24 שעות הקרוב.',
   50),

  ('refund',
   'refund_auto',
   'בקשת החזרה או זיכוי',
   'קיבלנו את בקשת ההחזרה שלך. אנו בודקים את הפרטים ויחזרו אליך עם פרטי התהליך בהקדם.',
   60),

  ('billing',
   'billing_auto',
   'שאלה כלכלית',
   'תודה על פנייתך בנוגע לחיוב. אנו בודקים את הפרטים ומטפלים בכך כפריוריטי.',
   40),

  ('technical',
   'technical_auto',
   'בעיה טכנית',
   'קיבלנו את הדיווח לבעיה הטכנית שלך. המטאם שלנו בודק את הנושא ויחזור אליך קרוב לעת.',
   70),

  ('other',
   'other_auto',
   'תודה על הפנייה',
   'תודה על צור הקשר איתנו. אנו בודקים את הבקשה שלך ויחזרו אליך בהקדם.',
   30);

-- Classification history
CREATE TABLE support_classification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  message_id uuid NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,

  old_category varchar(50),
  new_category varchar(50) NOT NULL,
  old_complexity_score integer,
  new_complexity_score integer NOT NULL,
  reason text,

  CONSTRAINT category_valid CHECK (
    new_category IN (
      'order_status', 'refund', 'delivery', 'product_quality',
      'technical', 'billing', 'other', 'unknown'
    )
  )
);

CREATE INDEX idx_classification_logs_message_id ON support_classification_logs(message_id);

ALTER TABLE support_classification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_classification_logs" ON support_classification_logs
  USING (auth.role() = 'service_role');

-- Dashboard view: pending support messages requiring owner response
CREATE VIEW v_support_pending AS
SELECT
  m.id,
  m.created_at,
  m.customer_email,
  m.customer_name,
  m.customer_phone,
  m.message_body,
  m.subject,
  m.category,
  m.is_complex,
  m.complexity_score,
  m.status,
  m.owner_notified_at,
  m.owner_response_at,
  CASE
    WHEN m.owner_response_at IS NOT NULL THEN 'resolved'
    WHEN m.owner_notified_at IS NOT NULL THEN 'waiting_response'
    WHEN m.auto_response_sent_at IS NOT NULL THEN 'auto_responded'
    ELSE 'new'
  END::varchar AS workflow_status,
  EXTRACT(EPOCH FROM (now() - m.created_at))/3600::integer AS hours_since_created
FROM support_messages m
WHERE m.status != 'resolved'
  AND (m.owner_response_at IS NULL OR m.owner_response_at > now() - INTERVAL '24 hours')
ORDER BY
  CASE WHEN m.owner_response_at IS NULL THEN 1 ELSE 2 END,
  m.is_complex DESC,
  m.created_at ASC;

ALTER VIEW v_support_pending OWNER TO postgres;

GRANT SELECT ON v_support_pending TO authenticated;
GRANT SELECT ON v_support_pending TO service_role;

-- Dashboard metrics
CREATE VIEW v_support_metrics AS
SELECT
  COUNT(*) FILTER (WHERE status = 'new') AS new_count,
  COUNT(*) FILTER (WHERE status = 'auto_responded') AS auto_responded_count,
  COUNT(*) FILTER (WHERE status = 'owner_notified') AS owner_notified_count,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE is_complex = true AND status != 'resolved') AS complex_pending_count,
  AVG(EXTRACT(EPOCH FROM (now() - created_at))/3600)
    FILTER (WHERE status = 'new')::numeric(5, 1) AS avg_hours_new_messages,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours') AS messages_24h
FROM support_messages;

ALTER VIEW v_support_metrics OWNER TO postgres;

GRANT SELECT ON v_support_metrics TO authenticated;
GRANT SELECT ON v_support_metrics TO service_role;

-- Cron endpoint recording
CREATE TABLE support_classifier_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  messages_processed integer NOT NULL DEFAULT 0,
  messages_auto_responded integer NOT NULL DEFAULT 0,
  messages_routed_to_owner integer NOT NULL DEFAULT 0,
  errors text,

  CONSTRAINT completed_after_start CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_classifier_runs_started_at ON support_classifier_runs(started_at DESC);

ALTER TABLE support_classifier_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_classifier_runs" ON support_classifier_runs
  USING (auth.role() = 'service_role');
