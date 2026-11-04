-- 254_voucher_validity_pin_transfer.sql
--
-- S10 (2026-11-04): vouchers on a paid coupon order. Three things, and only
-- these three. Measured on production 04.11 before writing a line of it.
--
-- 1. VALIDITY IS 30, 60 OR 90 DAYS PER PRODUCT, DEFAULT 90.
--
--    products.coupon_expiry_days was nullable with CHECK (> 0). Distribution:
--    90 x 23, 60 x 15, NULL x 88, nothing else. finalize refused to issue a
--    voucher for a NULL (C7), so a coupon product without the field took the
--    payment and then never produced a voucher until an admin noticed.
--    The owner's rule (S10) is: 30/60/90, default 90. The NULLs become 90, the
--    column gets DEFAULT 90, and the CHECK narrows to the three values. No
--    existing row violates it (measured above), so it is VALID, not NOT VALID.
--
--    NOT NULL is deliberately NOT set. It was, for a few minutes on 04.11, and
--    then dropped: buildProductMoneyRow (src/lib/commerce/product-money.ts)
--    writes NULL for every non-coupon product, so NOT NULL refuses every save
--    of a physical product. NULL passes the CHECK; the application resolves a
--    coupon's NULL to 90 (src/server/domain/vouchers/validity.ts).
--
-- 2. THE 8-DIGIT CODE IS partner_pin, AND IT WAS NEVER IN THE REPO.
--
--    Production already has vouchers.partner_pin (CHECK ^[0-9]{8}$), a unique
--    index per supplier among issued vouchers, and a BEFORE INSERT/UPDATE
--    trigger fn_vouchers_partner_pin that fills it. 809 of 848 vouchers carry
--    one. None of the three exists in any file here. This section writes them
--    down idempotently, byte-for-byte what pg_get_functiondef returned, so the
--    repo stops describing a database that is not the one running.
--    The application now generates the pin itself (src/server/domain/vouchers/
--    code.ts generateVoucherPin); the trigger stays as the fallback for any
--    writer that does not.
--
-- 3. transferred IS A STATUS.
--
--    Before this a gift claim rewrote vouchers.user_id in place. The code and
--    the signed QR stayed the same, and both had already been mailed to the
--    BUYER in voucher_issued. The buyer could present that mail at the counter
--    after the recipient claimed. Now a claim retires the buyer's row as
--    `transferred` (terminal) and issues the recipient a NEW row: new code,
--    new QR, new pin, the same order line, money and expiry. Both rows point
--    at each other.
--
--    That is done by transfer_voucher_on_claim() below in ONE transaction,
--    with the source row locked. The code and the signed QR come in from the
--    application, because the QR HMAC secret lives in the application env and
--    must never be in SQL.
--
-- Rollback: section 3's columns and function can be dropped; the enum value
-- cannot be removed from voucher_status without recreating the type, so it
-- stays (unused values are harmless). Section 1: DROP NOT NULL, DROP DEFAULT,
-- restore CHECK (coupon_expiry_days > 0).

-- ---------------------------------------------------------------- 1. validity

UPDATE public.products SET coupon_expiry_days = 90 WHERE coupon_expiry_days IS NULL;

ALTER TABLE public.products ALTER COLUMN coupon_expiry_days SET DEFAULT 90;
ALTER TABLE public.products ALTER COLUMN coupon_expiry_days DROP NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_coupon_expiry_days_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_coupon_expiry_days_check CHECK (coupon_expiry_days IN (30, 60, 90));

-- ------------------------------------------------------ 2. partner_pin, as-is

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS partner_pin text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.vouchers'::regclass AND conname = 'vouchers_partner_pin_format'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_partner_pin_format
      CHECK ((partner_pin IS NULL) OR (partner_pin ~ '^[0-9]{8}$'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_partner_pin_issued_uq
  ON public.vouchers USING btree (supplier_id, partner_pin)
  WHERE ((status = 'issued'::public.voucher_status) AND (partner_pin IS NOT NULL));

CREATE OR REPLACE FUNCTION public.fn_vouchers_partner_pin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  candidate text;
  tries int := 0;
begin
  if new.partner_pin is not null or new.status <> 'issued' then return new; end if;
  loop
    candidate := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0');
    exit when not exists (
      select 1 from public.vouchers
      where supplier_id = new.supplier_id and partner_pin = candidate and status = 'issued');
    tries := tries + 1;
    if tries > 20 then raise exception 'partner_pin space exhausted'; end if;
  end loop;
  new.partner_pin := candidate;
  return new;
end $function$;

DROP TRIGGER IF EXISTS tg_vouchers_partner_pin ON public.vouchers;
CREATE TRIGGER tg_vouchers_partner_pin
  BEFORE INSERT OR UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.fn_vouchers_partner_pin();

-- ------------------------------------------------------------ 3. transferred

ALTER TYPE public.voucher_status ADD VALUE IF NOT EXISTS 'transferred';

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS transferred_to_voucher_id uuid
  REFERENCES public.vouchers(id) ON DELETE RESTRICT;
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS transferred_from_voucher_id uuid
  REFERENCES public.vouchers(id) ON DELETE RESTRICT;

-- A retired row always names its successor and when; a live row never does.
-- Compared as text so the new enum label is not "used" inside this
-- transaction (55P04 "unsafe use of new value").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.vouchers'::regclass AND conname = 'vouchers_transferred_fields'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_transferred_fields CHECK (
        ((status::text = 'transferred') AND transferred_at IS NOT NULL AND transferred_to_voucher_id IS NOT NULL)
        OR ((status::text <> 'transferred') AND transferred_at IS NULL AND transferred_to_voucher_id IS NULL)
      );
  END IF;
END $$;

-- One successor per retired row.
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_transferred_from_uq
  ON public.vouchers (transferred_from_voucher_id)
  WHERE transferred_from_voucher_id IS NOT NULL;

-- The 166 guard, plus issued -> transferred. Every non-issued state stays
-- terminal. Parsed by src/server/domain/orders/status-transitions.test.ts:
-- keep the IN (...) list and the "  ) THEN" line exactly in this shape.
CREATE OR REPLACE FUNCTION public.fn_vouchers_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Not participating, or not moving. Either way this trigger has no opinion.
  IF NEW.status IS NULL OR OLD.status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('issued','redeemed'),
    ('issued','expired'),
    ('issued','cancelled'),
    ('issued','refunded'),
    ('issued','transferred')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal vouchers.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$function$;

-- The claim. Service role only: it takes the new owner as an argument, and a
-- definer function that trusts a caller-supplied uid must not be reachable by
-- the caller (see the memory note on definer functions).
--
-- Errors, mapped by src/server/domain/vouchers/transfer.ts:
--   P0002 voucher_not_found     no row with that id and token hash
--   P0001 gift_already_claimed  gift_claimed_at already set
--   P0001 voucher_not_issued    redeemed / expired / cancelled / refunded / transferred
--   P0001 voucher_expired       expires_at has passed
--   23505                       code or pin collided; the caller regenerates
CREATE OR REPLACE FUNCTION public.transfer_voucher_on_claim(
  p_voucher_id uuid,
  p_token_hash text,
  p_new_user_id uuid,
  p_code text,
  p_qr_payload text,
  p_qr_key_id text,
  p_partner_pin text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  src public.vouchers%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO src
    FROM public.vouchers
   WHERE id = p_voucher_id AND gift_claim_token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voucher_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF src.gift_claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'gift_already_claimed' USING ERRCODE = 'P0001';
  END IF;
  IF src.status::text <> 'issued' THEN
    RAISE EXCEPTION 'voucher_not_issued' USING ERRCODE = 'P0001';
  END IF;
  IF src.expires_at <= now() THEN
    RAISE EXCEPTION 'voucher_expired' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.vouchers (
    code, qr_payload, qr_key_id, partner_pin,
    order_id, order_item_id, product_id, supplier_id, user_id, status,
    face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
    platform_percent, offer_valid_until, expires_at, issued_at,
    gifted_by_user_id, gift_claimed_at, transferred_from_voucher_id
  ) VALUES (
    p_code, p_qr_payload, p_qr_key_id, p_partner_pin,
    src.order_id, src.order_item_id, src.product_id, src.supplier_id, p_new_user_id, 'issued',
    src.face_value_agorot, src.coupon_price_agorot, src.remaining_amount_due_agorot,
    src.platform_percent, src.offer_valid_until, src.expires_at, now(),
    -- The buyer, not the previous holder, when a coupon is passed on twice:
    -- gifted_by_user_id is the link to whoever paid.
    COALESCE(src.gifted_by_user_id, src.user_id), now(), src.id
  )
  RETURNING id INTO new_id;

  UPDATE public.vouchers
     SET status = 'transferred',
         transferred_at = now(),
         transferred_to_voucher_id = new_id,
         gift_claimed_at = now(),
         status_reason = 'gift_claim'
   WHERE id = src.id;

  RETURN new_id;
END
$function$;

REVOKE ALL ON FUNCTION public.transfer_voucher_on_claim(uuid, text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_voucher_on_claim(uuid, text, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_voucher_on_claim(uuid, text, uuid, text, text, text, text) TO service_role;
