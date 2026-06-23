-- 022: Demo seed (coupons + vendors) + restore public read for active vendors
-- Idempotent: safe to run multiple times.
--
-- Context: the homepage Hot Coupons and Brands sections read coupon_deals and
-- vendors. coupon_deals already has a "public read active" policy, but vendors
-- lost its public read (anon visitors get 0 rows), so the Brands section stays
-- empty. This migration restores public read for active vendors and seeds
-- realistic Hebrew demo data for both sections.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Public read for active vendors (required by the homepage Brands section)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "vendors: public select active" ON public.vendors;
CREATE POLICY "vendors: public select active"
  ON public.vendors FOR SELECT
  USING ((status = 'active' AND deleted_at IS NULL) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Demo coupons (coupon_deals). Guarded by (title_he, business_name).
-- ---------------------------------------------------------------------------

INSERT INTO public.coupon_deals (title_he, business_name, original_price, location_he, terms_he, status)
SELECT v.title_he, v.business_name, v.original_price, v.location_he, v.terms_he, v.status
FROM (VALUES
  ('עיסוי שוודי מפנק 60 דקות', 'ספא נירוונה',    320::numeric, 'תל אביב',   'בתיאום מראש, בתוקף לחצי שנה', 'active'),
  ('ארוחה זוגית במסעדה איטלקית','טרטוריה בלה',     240::numeric, 'הרצליה',    'לא כולל אלכוהול, בימים א-ה',  'active'),
  ('כניסה זוגית לפארק מים',     'ימית 2000',      180::numeric, 'חולון',     'בתוקף לעונת הקיץ',           'active'),
  ('טיפול פנים יוקרתי',         'קליניק ביוטי',    290::numeric, 'רמת גן',    'בתיאום מראש',                'active'),
  ('לילה רומנטי בצימר בצפון',   'צימרים בגליל',    850::numeric, 'ראש פינה',  'בכפוף לזמינות, אמצע שבוע',    'active'),
  ('קורס סדנת בישול איטלקי',    'שף בבית',         360::numeric, 'ירושלים',   'סדנה של 3 שעות',             'active'),
  ('כרטיס זוגי להופעה',         'היכל התרבות',     280::numeric, 'תל אביב',   'בכפוף לזמינות מקומות',        'active'),
  ('חבילת גלישה וסאפ',          'אתגר אקסטרים',    199::numeric, 'אילת',      'כולל ציוד מלא',              'active')
) AS v(title_he, business_name, original_price, location_he, terms_he, status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupon_deals c
  WHERE c.title_he = v.title_he AND c.business_name = v.business_name
);

-- ---------------------------------------------------------------------------
-- 3. Demo vendors (brands). vendors.profile_id is NOT NULL UNIQUE -> each
--    vendor needs its own auth user + profile. Guarded by business_id.
--    The auth.users insert is wrapped so a schema mismatch never breaks db push.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v   record;
  uid uuid;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('demo-vendor1@kenyonexpress.demo', 'אלקטרו פלוס',  'DEMO-001'),
    ('demo-vendor2@kenyonexpress.demo', 'סטייל הבית',   'DEMO-002'),
    ('demo-vendor3@kenyonexpress.demo', 'ביוטי לאב',    'DEMO-003'),
    ('demo-vendor4@kenyonexpress.demo', 'ספורט מקס',    'DEMO-004'),
    ('demo-vendor5@kenyonexpress.demo', 'טעמים גורמה',  'DEMO-005'),
    ('demo-vendor6@kenyonexpress.demo', 'טק וורלד',     'DEMO-006')
  ) AS t(email, business_name, business_id)
  LOOP
    -- skip if this vendor already exists
    IF EXISTS (SELECT 1 FROM public.vendors WHERE business_id = v.business_id) THEN
      CONTINUE;
    END IF;

    SELECT id INTO uid FROM auth.users WHERE email = v.email;

    IF uid IS NULL THEN
      uid := gen_random_uuid();
      BEGIN
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at,
          raw_app_meta_data, raw_user_meta_data,
          confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
          '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
          v.email, crypt('DemoVendor!2026', gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}', '{}',
          '', '', '', ''
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skipping demo vendor % (auth user insert failed)', v.email;
        CONTINUE;
      END;
    END IF;

    -- profile (handle_new_user trigger usually creates it; ensure idempotently)
    INSERT INTO public.profiles (id, email, role)
    VALUES (uid, v.email, 'customer')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.vendors (profile_id, business_name, business_id, contact_email, status)
    VALUES (uid, v.business_name, v.business_id, v.email, 'active')
    ON CONFLICT (business_id) DO NOTHING;
  END LOOP;
END $$;
