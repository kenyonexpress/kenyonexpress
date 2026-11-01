-- 190_whatsapp_otp.sql
--
-- WhatsApp OTP verification via Twilio.
-- Adds verified_phone and verified_phone_at columns to track verified phone numbers.
-- Creates otp_sessions table to manage temporary OTP storage.
--
-- ROLLBACK (whole file):
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS verified_phone;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS verified_phone_at;
--   DROP TABLE IF EXISTS public.otp_sessions;

-- Add verified phone tracking to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_phone text,
  ADD COLUMN IF NOT EXISTS verified_phone_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_verified_phone_idx ON public.profiles (verified_phone);

-- OTP sessions table for temporary OTP storage and rate limiting
CREATE TABLE IF NOT EXISTS public.otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS otp_sessions_phone_idx ON public.otp_sessions (phone);
CREATE INDEX IF NOT EXISTS otp_sessions_user_id_idx ON public.otp_sessions (user_id);
CREATE INDEX IF NOT EXISTS otp_sessions_expires_at_idx ON public.otp_sessions (expires_at);

-- Enable RLS
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read their own OTP sessions
CREATE POLICY "Users can read own otp_sessions"
  ON public.otp_sessions FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Only system can insert/update OTP sessions (no direct user access)
CREATE POLICY "System insert otp_sessions"
  ON public.otp_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System update otp_sessions"
  ON public.otp_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);
