-- 070: Checkout / Cardcom multi-account runtime.
--
-- Adds the pieces the feat/checkout-cardcom flow needs on top of 046/047:
--   1. cardcom_accounts: optional per-supplier Cardcom terminals. The platform
--      terminal stays in env (CARDCOM_*); a row here means the supplier clears
--      on their own terminal (clearing_mode 'own_terminal' from
--      CARDCOM-ARCHITECTURE section 4, now concrete). Missing row = platform
--      terminal, split recorded in our ledger. Fallback is always safe.
--   2. payment_events: append-only audit trail of every order/payment state
--      transition. Mirrors the ledger immutability rules (058): no UPDATE, no
--      DELETE, no TRUNCATE, for service_role too. This is the state machine's
--      journal, not a money ledger; amounts are copies for observability.
--   3. order_escrow_holds: internal escrow rows for coupon lines under the
--      escrow flow (ESCROW_FLOW_ENABLED). Internal-only per C3: the money sits
--      in our Cardcom clearing account; this row is the "held" record that is
--      closed at redemption or refund. Kept separate from legacy escrow_holds
--      (047), which is keyed to coupon_codes and slated for removal (R1).
--   4. payments.cardcom_account_key: which Cardcom account charged this
--      payment, so webhook verification re-verifies against the same terminal.
--
-- Idempotent: safe to run more than once.

-- 1. cardcom_accounts ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cardcom_accounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text        NOT NULL UNIQUE CHECK (char_length(key) BETWEEN 1 AND 60),
  supplier_id     uuid        UNIQUE REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  terminal_number text        NOT NULL UNIQUE CHECK (char_length(terminal_number) BETWEEN 1 AND 20),
  api_name        text        NOT NULL CHECK (char_length(api_name) BETWEEN 1 AND 120),
  api_password    text        NOT NULL CHECK (char_length(api_password) BETWEEN 1 AND 200),
  webhook_secret  text        NOT NULL CHECK (char_length(webhook_secret) BETWEEN 16 AND 200),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cardcom_accounts IS
  'Per-supplier Cardcom terminals. No row for a supplier means the platform terminal charges and the split is recorded in the ledger. Credentials are service-role-only: RLS is enabled with no policies on purpose.';

CREATE INDEX IF NOT EXISTS idx_cardcom_accounts_supplier
  ON public.cardcom_accounts (supplier_id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.cardcom_accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cardcom_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cardcom_accounts ENABLE ROW LEVEL SECURITY;
-- No policies: credentials never leave the service role.

-- 2. payment_events (append-only) --------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id   uuid        REFERENCES public.order_items(id) ON DELETE RESTRICT,
  payment_id      uuid        REFERENCES public.payments(id) ON DELETE RESTRICT,
  -- text, not enum: the event vocabulary grows with the flow and an
  -- append-only log must accept historical values forever.
  event_type      text        NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 80),
  from_state      text        CHECK (from_state IS NULL OR char_length(from_state) <= 40),
  to_state        text        CHECK (to_state IS NULL OR char_length(to_state) <= 40),
  amount_agorot   bigint,
  actor           text        NOT NULL DEFAULT 'system' CHECK (char_length(actor) BETWEEN 1 AND 60),
  idempotency_key text        UNIQUE,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
  -- no updated_at on purpose: events are immutable
);

COMMENT ON TABLE public.payment_events IS
  'Append-only journal of order/payment state transitions written by the checkout state machine. Never UPDATE or DELETE; corrections are new events.';

CREATE INDEX IF NOT EXISTS idx_payment_events_order   ON public.payment_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON public.payment_events (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_type    ON public.payment_events (event_type, created_at);

CREATE OR REPLACE FUNCTION public.fn_payment_events_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only: % is forbidden; write a new event instead', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_events_immutable ON public.payment_events;
CREATE TRIGGER trg_payment_events_immutable
  BEFORE UPDATE OR DELETE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_events_block_mutation();

DROP TRIGGER IF EXISTS trg_payment_events_no_truncate ON public.payment_events;
CREATE TRIGGER trg_payment_events_no_truncate
  BEFORE TRUNCATE ON public.payment_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_payment_events_block_mutation();

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Customers may read the trail of their own orders; admins read everything.
-- Writes go through the service role only.
DROP POLICY IF EXISTS payment_events_owner_read ON public.payment_events;
CREATE POLICY payment_events_owner_read ON public.payment_events
  FOR SELECT USING (
    order_id IN (SELECT o.id FROM public.orders o WHERE o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS payment_events_admin_read ON public.payment_events;
CREATE POLICY payment_events_admin_read ON public.payment_events
  FOR SELECT USING (public.is_admin());

-- 3. order_escrow_holds -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_escrow_holds (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id           uuid        NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  order_id                uuid        NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  supplier_id             uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  held_agorot             bigint      NOT NULL CHECK (held_agorot >= 0),
  platform_fee_agorot     bigint      NOT NULL CHECK (platform_fee_agorot >= 0),
  release_agorot          bigint      NOT NULL CHECK (release_agorot >= 0),
  status                  public.escrow_status NOT NULL DEFAULT 'held',
  held_at                 timestamptz NOT NULL DEFAULT now(),
  released_at             timestamptz,
  refunded_at             timestamptz,
  release_idempotency_key text        UNIQUE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_escrow_holds_conservation
    CHECK (held_agorot = platform_fee_agorot + release_agorot)
);

COMMENT ON TABLE public.order_escrow_holds IS
  'Internal escrow (C3: no external escrow, no J5) for coupon lines under ESCROW_FLOW_ENABLED. held = the on-site charge for the line; platform_fee_agorot is the purchase-time platform_percent snapshot share of held (per product, no default). On redemption the platform keeps the fee and release_agorot becomes supplier_payable.';

CREATE INDEX IF NOT EXISTS idx_order_escrow_holds_supplier
  ON public.order_escrow_holds (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_order_escrow_holds_order
  ON public.order_escrow_holds (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.order_escrow_holds;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.order_escrow_holds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.order_escrow_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_escrow_holds_owner_read ON public.order_escrow_holds;
CREATE POLICY order_escrow_holds_owner_read ON public.order_escrow_holds
  FOR SELECT USING (
    order_id IN (SELECT o.id FROM public.orders o WHERE o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS order_escrow_holds_supplier_read ON public.order_escrow_holds;
CREATE POLICY order_escrow_holds_supplier_read ON public.order_escrow_holds
  FOR SELECT USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS order_escrow_holds_admin_read ON public.order_escrow_holds;
CREATE POLICY order_escrow_holds_admin_read ON public.order_escrow_holds
  FOR SELECT USING (public.is_admin());

-- 4. payments.cardcom_account_key --------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cardcom_account_key text NOT NULL DEFAULT 'platform';

COMMENT ON COLUMN public.payments.cardcom_account_key IS
  'cardcom_accounts.key (or ''platform'') of the terminal that charged this payment. Webhook re-verification must use the same account.';
