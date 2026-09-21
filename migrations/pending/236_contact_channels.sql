-- 236_contact_channels.sql
--
-- Section 94: the WhatsApp contact system as data. Five topics, each with its
-- own number and a prefilled Hebrew opener, ordered and switchable; and a
-- per-route-template map that says which topic a page's floating button and
-- "ask" links default to. Before this table the store had ONE number and ONE
-- sentence, restated in three files.
--
-- The code ships the same five rows as defaults (src/lib/contact/channels.ts),
-- so the storefront works before this applies and keeps working if the read
-- fails; the table is what lets an operator change a number without a deploy.
--
-- RLS: public read of ACTIVE rows only (anon + authenticated), because the
-- storefront reads them on the visitor's own session; every write is service
-- role, from /admin/contact-channels with an audit row. IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_channels (
  key         text PRIMARY KEY
              CHECK (key IN ('customer_service', 'suggestions', 'business_partnerships', 'site_problem', 'supplier_join')),
  label_he    text NOT NULL,
  -- E.164 digits without '+', as wa.me wants them; NULL means "the store number"
  -- (NEXT_PUBLIC_WHATSAPP_PHONE or the published default) resolved at read time.
  number      text CHECK (number IS NULL OR number ~ '^[0-9]{10,15}$'),
  message_he  text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_channels IS
  'WhatsApp contact topics: number + prefilled Hebrew opener per topic. Public read of active rows; writes service role only (236, docs/WA-CONTACT.md).';

CREATE TABLE IF NOT EXISTS public.page_contact_config (
  route_template text PRIMARY KEY,
  channel_key    text NOT NULL REFERENCES public.contact_channels(key) ON DELETE RESTRICT,
  -- Optional override of the channel opener for this route family; {name}
  -- is replaced with the product or supplier name when the page has one.
  message_he     text,
  active         boolean NOT NULL DEFAULT true,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.page_contact_config IS
  'Which contact topic a route family defaults to (e.g. /product/[slug] -> customer_service). Public read; writes service role only (236).';

INSERT INTO public.contact_channels (key, label_he, number, message_he, sort_order, active) VALUES
  ('customer_service',      'שירות לקוחות',      NULL, 'שלום, יש לי שאלה לשירות הלקוחות של קניון אקספרס.', 10, true),
  ('suggestions',           'הצעות ורעיונות',    NULL, 'שלום, יש לי הצעה לשיפור קניון אקספרס.',           20, true),
  ('business_partnerships', 'שיתופי פעולה',      NULL, 'שלום, אני מעוניין/ת בשיתוף פעולה עסקי עם קניון אקספרס.', 30, true),
  ('site_problem',          'תקלה באתר',         NULL, 'שלום, נתקלתי בתקלה באתר קניון אקספרס. העמוד: ',    40, true),
  ('supplier_join',         'הצטרפות כבית עסק',  NULL, 'שלום, אני בעל/ת עסק ורוצה להצטרף לקניון אקספרס.', 50, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.page_contact_config (route_template, channel_key, message_he, active) VALUES
  ('/product/[slug]',  'customer_service', 'שלום, יש לי שאלה על {name} בקניון אקספרס.', true),
  ('/s/[id]',          'customer_service', 'שלום, יש לי שאלה על בית העסק {name} בקניון אקספרס.', true),
  ('/checkout',        'customer_service', 'שלום, אני באמצע תשלום בקניון אקספרס וצריך/ה עזרה.', true),
  ('/account',         'customer_service', 'שלום, יש לי שאלה על ההזמנה שלי בקניון אקספרס.', true),
  ('/suppliers/apply', 'supplier_join',    NULL, true)
ON CONFLICT (route_template) DO NOTHING;

ALTER TABLE public.contact_channels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_contact_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_channels_public_read ON public.contact_channels;
CREATE POLICY contact_channels_public_read ON public.contact_channels
  FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS page_contact_config_public_read ON public.page_contact_config;
CREATE POLICY page_contact_config_public_read ON public.page_contact_config
  FOR SELECT TO anon, authenticated USING (active);

REVOKE ALL ON public.contact_channels    FROM anon, authenticated;
REVOKE ALL ON public.page_contact_config FROM anon, authenticated;
GRANT SELECT ON public.contact_channels    TO anon, authenticated;
GRANT SELECT ON public.page_contact_config TO anon, authenticated;

COMMIT;
