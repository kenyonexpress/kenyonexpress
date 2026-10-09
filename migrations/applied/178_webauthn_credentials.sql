-- 178: passkey (WebAuthn) credentials: one row per authenticator a customer
-- has registered (Face ID, fingerprint, hardware key).
--
-- WHAT LIVES HERE AND WHAT DOES NOT. Only the public key material and the
-- signature counter, which is what verifying a login assertion needs. The
-- challenge for each ceremony is NOT stored in the database: it travels in an
-- HMAC-sealed, httpOnly cookie (src/lib/auth/passkeys/challenge.ts), so an
-- unmigrated or unreachable database never blocks issuing a challenge, and
-- there is no challenge table to garbage-collect.
--
-- WHY user_id REFERENCES auth.users AND NOT public.profiles. A credential
-- belongs to the auth identity, not to the storefront profile: profiles rows
-- are created lazily for phone-only accounts (see runVerifyPhoneOtp), while
-- every session that can register a passkey has an auth.users row by
-- definition. Referencing profiles would make registration fail with an FK
-- error for exactly the accounts that never got their lazy profile row.
--
-- WRITE PATH IS SERVICE ROLE ONLY, BY OMISSION. A row is only inserted after
-- verifyRegistrationResponse proves the attestation server-side, and the
-- counter is only updated after verifyAuthenticationResponse proves the
-- assertion. An INSERT or UPDATE policy for authenticated would let any
-- session write an arbitrary credential row with the anon key and skip both
-- proofs, so no such policy exists. SELECT and DELETE of one's own rows are
-- allowed: the account security page lists and revokes passkeys with the
-- caller's own session, and deleting a credential only ever locks out its
-- holder, never lets anyone in.
--
-- ROLLBACK:
--   drop trigger if exists set_updated_at on public.webauthn_credentials;
--   drop table public.webauthn_credentials;

-- Defensive, same as 005+: 001 defines this and may stop early on a live DB.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  -- The credential ID exactly as the authenticator returns it: base64url,
  -- globally unique by construction, and the natural key every WebAuthn
  -- lookup uses. A surrogate uuid would only add a second unique index.
  id            text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- COSE public key bytes, base64url. text and not bytea because every reader
  -- and writer speaks base64url end to end (PostgREST, the cookie, the
  -- library), so storing bytes would mean decode/encode at every hop.
  public_key    text        NOT NULL,
  -- Signature counter for clone detection. bigint: the spec allows 2^32 - 1.
  counter       bigint      NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports    text[]      NOT NULL DEFAULT '{}',
  device_type   text        NOT NULL DEFAULT 'singleDevice'
                            CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up     boolean     NOT NULL DEFAULT false,
  -- Authenticator model identifier, for the management UI's device label.
  aaguid        text,
  -- What the customer named this passkey ("iPhone", "מחשב בעבודה").
  friendly_name text,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
  ON public.webauthn_credentials (user_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.webauthn_credentials;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webauthn_credentials_select_own" ON public.webauthn_credentials;
CREATE POLICY "webauthn_credentials_select_own"
  ON public.webauthn_credentials
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "webauthn_credentials_delete_own" ON public.webauthn_credentials;
CREATE POLICY "webauthn_credentials_delete_own"
  ON public.webauthn_credentials
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy, no UPDATE policy: service role only, see header.
