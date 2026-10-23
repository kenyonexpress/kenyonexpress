-- Passkeys (WebAuthn) credentials storage
-- Stores user authentication credentials for passwordless login via biometrics/security keys

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  credential_device_type TEXT NOT NULL, -- "singleDevice" | "multiDevice"
  credential_backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[] NOT NULL DEFAULT '{}', -- ["usb", "nfc", "ble", "internal"]
  friendly_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX passkey_credentials_user_id_idx ON passkey_credentials(user_id);

-- RLS policies for passkey_credentials
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only read their own credentials
CREATE POLICY "Users can read own passkey credentials"
  ON passkey_credentials FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all credentials (for server-side verification)
-- No direct INSERT/UPDATE/DELETE for users - managed via server actions only

-- Auth attempt tracking for fallback logic
CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  attempt_type TEXT NOT NULL, -- "passkey" | "whatsapp_otp" | "email_otp" | "password"
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_attempts_user_id_idx ON auth_attempts(user_id);
CREATE INDEX auth_attempts_email_idx ON auth_attempts(email);
CREATE INDEX auth_attempts_phone_idx ON auth_attempts(phone);
CREATE INDEX auth_attempts_created_at_idx ON auth_attempts(created_at);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

-- Users can only read their own auth attempts
CREATE POLICY "Users can read own auth attempts"
  ON auth_attempts FOR SELECT
  USING (auth.uid() = user_id);

-- OTP code storage for WhatsApp/Email/SMS verification
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email or phone number
  code TEXT NOT NULL,
  channel TEXT NOT NULL, -- "whatsapp" | "email" | "sms"
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX otp_codes_identifier_idx ON otp_codes(identifier);
CREATE INDEX otp_codes_expires_at_idx ON otp_codes(expires_at);

-- No RLS needed - accessed via service role only

COMMENT ON TABLE passkey_credentials IS 'WebAuthn passkey credentials for passwordless authentication';
COMMENT ON TABLE auth_attempts IS 'Authentication attempt tracking for fallback logic and security monitoring';
COMMENT ON TABLE otp_codes IS 'Temporary OTP code storage for WhatsApp/Email/SMS verification with expiration';
