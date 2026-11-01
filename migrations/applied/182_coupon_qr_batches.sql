-- 182_coupon_qr_batches.sql
--
-- Printable QR coupon batches for marketing campaigns.
--
-- WHAT THIS IS
--
-- A campaign (096, discount_campaigns) has one human-typeable code. A print
-- campaign needs the opposite: many machine-scannable codes that each resolve
-- to the same campaign, so a flyer left on a counter can be redeemed once and
-- only once, and a batch handed to one distributor can be reported on
-- separately from a batch handed to another.
--
-- Each unit is an 8-digit numeric code (7 random digits + a Luhn check digit,
-- generated in src/lib/coupons/unit-codes.ts) printed as text and as a QR that
-- encodes /c/<code>. At the cart, an 8-digit code that misses
-- discount_campaigns.code is resolved through coupon_qr_codes to its campaign
-- and evaluated under the campaign's own rules; the unit adds a per-code
-- single-use gate (redeemed_at) on top of the campaign limits, it never
-- loosens them.
--
-- WHY NOT ROWS IN discount_campaigns
--
-- A thousand-unit batch as a thousand campaigns would make every campaign
-- query, report and admin list wade through print inventory, and the
-- campaign's own limits (max_uses, window, funding cap) would have to be
-- duplicated a thousand times and edited a thousand times. The unit row
-- carries identity and spent/unspent state only; everything about what the
-- discount is worth stays on the one campaign row.
--
-- WHOSE MONEY: the campaign's, i.e. the platform commission (05a181a). A unit
-- code introduces no new amounts and no new funding source.
--
-- redeemed_order_id is a bare uuid, not a foreign key: orders is being
-- partitioned (148) and its composite keys make plain FKs to it a trap. The
-- column is diagnostic, not relational.

-- Defensive: 001 defines this but is not idempotent and may stop early on a
-- live DB (see skills/supabase-migrations).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. coupon_qr_batches: one print run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_qr_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES public.discount_campaigns(id) ON DELETE RESTRICT,

  -- Where this batch physically went ("דוכן שוק הכרמל", "עיתון ספטמבר").
  label        text NOT NULL,

  -- How many codes were generated for it. Denormalised from the code rows so
  -- the admin list does not count a thousand children per row; the generator
  -- writes both in one request and nothing else ever changes it.
  quantity     integer NOT NULL,

  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- 1000 is a print-run ceiling, not a technical one: it caps what one form
  -- submit can insert and what one PDF request will render.
  BEGIN
    ALTER TABLE public.coupon_qr_batches
      ADD CONSTRAINT coupon_qr_batches_quantity_range
      CHECK (quantity > 0 AND quantity <= 1000);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.coupon_qr_batches
      ADD CONSTRAINT coupon_qr_batches_label_length
      CHECK (length(btrim(label)) BETWEEN 1 AND 80);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS coupon_qr_batches_campaign_idx
  ON public.coupon_qr_batches (campaign_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.coupon_qr_batches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.coupon_qr_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_qr_batches ENABLE ROW LEVEL SECURITY;

-- Same posture as discount_campaigns: admins read, nobody else reads, all
-- writes go through the service-role client after requireSection. A shopper
-- never lists batches; their one code is validated server-side.
DROP POLICY IF EXISTS coupon_qr_batches_admin_read ON public.coupon_qr_batches;
CREATE POLICY coupon_qr_batches_admin_read ON public.coupon_qr_batches
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.coupon_qr_batches IS
  'One print run of QR coupon codes for a discount campaign. Codes live in '
  'coupon_qr_codes; discount value and limits live on the campaign row.';

-- ---------------------------------------------------------------------------
-- 2. coupon_qr_codes: the units
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_qr_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.coupon_qr_batches(id) ON DELETE RESTRICT,

  -- Denormalised from the batch so the cart lookup (code -> campaign) is one
  -- indexed hop instead of a join through the batch on every cart render.
  campaign_id        uuid NOT NULL REFERENCES public.discount_campaigns(id) ON DELETE RESTRICT,

  code               text NOT NULL,

  -- The per-unit single-use gate. NULL means unspent. Set alongside the
  -- campaign redemption when the discount claim is wired (fn_claim_discount,
  -- 096); until then it is the same soft state campaign used_count is in.
  redeemed_at        timestamptz,
  redeemed_order_id  uuid,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Global uniqueness, not per-campaign: the cart resolves a bare 8-digit
  -- string with no campaign context, so the same code in two campaigns would
  -- be ambiguous at the till.
  BEGIN
    ALTER TABLE public.coupon_qr_codes
      ADD CONSTRAINT coupon_qr_codes_code_unique UNIQUE (code);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;

  -- Exactly 8 ASCII digits, the shape unit-codes.ts generates and the cart
  -- recognises. A row inserted by hand in the SQL editor cannot become a code
  -- that exists but can never be scanned.
  BEGIN
    ALTER TABLE public.coupon_qr_codes
      ADD CONSTRAINT coupon_qr_codes_code_format
      CHECK (code ~ '^[0-9]{8}$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS coupon_qr_codes_batch_idx
  ON public.coupon_qr_codes (batch_id);

CREATE INDEX IF NOT EXISTS coupon_qr_codes_campaign_idx
  ON public.coupon_qr_codes (campaign_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.coupon_qr_codes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.coupon_qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupon_qr_codes ENABLE ROW LEVEL SECURITY;

-- No shopper-facing policy on purpose: an anon-readable code table is a
-- scraper walking the keyspace and downloading every unspent coupon. The cart
-- lookup runs server-side on the service-role client.
DROP POLICY IF EXISTS coupon_qr_codes_admin_read ON public.coupon_qr_codes;
CREATE POLICY coupon_qr_codes_admin_read ON public.coupon_qr_codes
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.coupon_qr_codes IS
  'One printed 8-digit QR coupon code. Resolves to its discount_campaigns row '
  'at the cart; redeemed_at is the per-unit single-use gate. Not readable by '
  'shoppers: a code is validated server-side, never listed.';
