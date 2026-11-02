-- 327_profiles_email_nullable_for_anonymous.sql
--
-- Guest-first checkout (src/lib/payments/guest-identity.ts) signs a guest in
-- with supabase.auth.signInAnonymously(). An anonymous auth user has no email,
-- and handle_new_user() copies new.email into profiles.email, which was
-- NOT NULL: every anonymous sign-in failed with "Database error creating
-- anonymous user" (measured 2026-11-02, C142, right after anonymous sign-ins
-- were switched on). The email arrives later, when the guest links Google or
-- an email on the return page (manual linking).
--
-- profiles_email_key stays: a unique index admits any number of NULLs.
-- Run preflight_327.sql first.

alter table public.profiles alter column email drop not null;
