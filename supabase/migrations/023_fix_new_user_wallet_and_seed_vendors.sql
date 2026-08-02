-- 023: Repair handle_new_user (wallet_balances) + seed demo vendors
-- Idempotent: safe to run multiple times.
--
-- Bug: migration 006 dropped public.wallets and replaced it with
-- public.wallet_balances, but handle_new_user() still inserted into the
-- now-missing public.wallets, so every auth signup failed on a fresh DB.
-- This repairs the trigger to use wallet_balances, then seeds the demo
-- vendors (each needs its own auth user because vendors.profile_id is
-- NOT NULL UNIQUE).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Repair handle_new_user -> wallet_balances (user_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.wallet_balances (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Demo vendors (brands). Guarded by business_id; auth.users by email.
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

    -- profile is normally created by the on_auth_user_created trigger; ensure it
    INSERT INTO public.profiles (id, email, role)
    VALUES (uid, v.email, 'customer')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.vendors (profile_id, business_name, business_id, contact_email, status)
    VALUES (uid, v.business_name, v.business_id, v.email, 'active')
    ON CONFLICT (business_id) DO NOTHING;
  END LOOP;
END $$;
