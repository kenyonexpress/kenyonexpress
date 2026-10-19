-- Migration 191: Card verification and saved payment methods
--
-- Creates payment_card_verifications table for 1 agora card verification flow.
-- Adds saved_payment_method column to profiles for storing verified payment method reference.

-- Table for tracking card verification attempts
CREATE TABLE IF NOT EXISTS public.payment_card_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  low_profile_code text,
  transaction_id text,
  payment_token_id uuid REFERENCES public.payment_tokens(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'processing', 'verified', 'failed', 'unavailable')),
  failure_reason text,
  amount_agorot integer NOT NULL,
  voided boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT valid_completion CHECK (completed_at IS NULL OR status != 'started')
);

CREATE INDEX IF NOT EXISTS payment_card_verifications_profile_id_idx ON public.payment_card_verifications (profile_id);
CREATE INDEX IF NOT EXISTS payment_card_verifications_status_idx ON public.payment_card_verifications (status);
CREATE INDEX IF NOT EXISTS payment_card_verifications_low_profile_code_idx ON public.payment_card_verifications (low_profile_code);

-- Add saved_payment_method column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS saved_payment_method jsonb DEFAULT NULL;

-- Index for faster lookups of profiles with saved payment methods
CREATE INDEX IF NOT EXISTS profiles_saved_payment_method_idx
ON public.profiles USING gin (saved_payment_method);

-- Comment for clarity
COMMENT ON COLUMN public.profiles.saved_payment_method IS 'Saved payment method for 1-click checkout (verified via 1 agora charge)';
COMMENT ON TABLE public.payment_card_verifications IS 'Card verification attempts via 1 agora Cardcom Low Profile charge';
