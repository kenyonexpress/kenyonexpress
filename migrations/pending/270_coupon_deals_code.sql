-- 270_coupon_deals_code.sql
--
-- The code on a coupon ticket (UX10): one nullable column on
-- `public.coupon_deals`, and a partial unique index so two deals cannot
-- advertise one code. No function, no trigger, no policy.
--
-- WHAT THE COLUMN IS
--
-- `code` is what the shopper shows at the business. The home page's hot-
-- coupon ticket (`src/components/CouponCard.tsx`) renders it in a `<code>`
-- beside a copy button, and nothing else reads it: it is NOT a cart discount
-- code (`public.coupons`, `discount_campaigns`) and NOT a voucher unit code
-- (`coupon_codes`, `vouchers.code`), and the checkout never sees it. A deal
-- with NULL shows a "לפרטי הקופון" link where the button would be.
--
-- The CHECK is the admin action's own pattern (`admin/coupon-deals.ts`
-- upper-cases on the way in): 4 to 16 upper-case Latin letters or digits.
-- Short enough to read off a phone across a counter, no lower case so
-- "spa90" and "SPA90" cannot be two rows, no punctuation so the clipboard
-- carries exactly what the stub shows.
--
-- WHO MAY READ AND WRITE
--
--   * Reads ride the table's existing SELECT policies: the home page already
--     reads `coupon_deals` on the anon client (`lib/homepage/below-fold.ts`),
--     and a code is advertised, not secret.
--   * Writes ride the existing admin UPDATE/INSERT policies; the admin form
--     is the only writer.
--
-- BEFORE IT IS APPLIED the storefront reads the column through
-- `readOptionalColumns`, which maps 42703 to "no code" and logs once, and the
-- admin action retries a save without the column when the field was empty.
--
-- PRECONDITIONS: `public.coupon_deals` (live). No dependency on any other
-- pending file.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.coupon_deals_code_unique;
--   ALTER TABLE public.coupon_deals DROP COLUMN IF EXISTS code;

BEGIN;

ALTER TABLE public.coupon_deals
  ADD COLUMN IF NOT EXISTS code text;

-- Idempotent: ADD CONSTRAINT has no IF NOT EXISTS, so drop first.
ALTER TABLE public.coupon_deals
  DROP CONSTRAINT IF EXISTS coupon_deals_code_format;
ALTER TABLE public.coupon_deals
  ADD CONSTRAINT coupon_deals_code_format
  CHECK (code IS NULL OR code ~ '^[A-Z0-9]{4,16}$');

CREATE UNIQUE INDEX IF NOT EXISTS coupon_deals_code_unique
  ON public.coupon_deals (code)
  WHERE code IS NOT NULL;

COMMENT ON COLUMN public.coupon_deals.code IS
  'UX10: the code the shopper shows at the business, copied off the hot-coupon ticket. Upper-case Latin letters and digits, 4 to 16. Not a cart discount code and not a voucher code.';

-- Self-check, rolled back: the shape refuses what it should and allows two
-- codeless rows. Runs against a throwaway row so no real deal is touched.
DO $$
DECLARE
  v_id uuid;
  v_id2 uuid;
BEGIN
  INSERT INTO public.coupon_deals (title_he, business_name, original_price, status)
  VALUES ('בדיקה 270', 'בדיקה', 100, 'draft') RETURNING id INTO v_id;
  INSERT INTO public.coupon_deals (title_he, business_name, original_price, status)
  VALUES ('בדיקה 270 ב', 'בדיקה', 100, 'draft') RETURNING id INTO v_id2;

  BEGIN
    UPDATE public.coupon_deals SET code = 'spa90' WHERE id = v_id;
    RAISE EXCEPTION '270 self-check: lower-case code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.coupon_deals SET code = 'AB1' WHERE id = v_id;
    RAISE EXCEPTION '270 self-check: 3-character code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.coupon_deals SET code = 'SPA90' WHERE id = v_id;
  BEGIN
    UPDATE public.coupon_deals SET code = 'SPA90' WHERE id = v_id2;
    RAISE EXCEPTION '270 self-check: duplicate code was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Two NULLs coexist: the partial index ignores them.
  UPDATE public.coupon_deals SET code = NULL WHERE id IN (v_id, v_id2);

  DELETE FROM public.coupon_deals WHERE id IN (v_id, v_id2);
END $$;

COMMIT;
