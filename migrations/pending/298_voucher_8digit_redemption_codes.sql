-- 8-digit numeric redemption codes for vouchers
-- Adds signed redemption codes as alternative to 10-char alphanumeric codes

ALTER TABLE vouchers
  ADD COLUMN redemption_code TEXT,
  ADD COLUMN redemption_code_signature TEXT;

-- Redemption codes are 8 ASCII digits exactly
ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_redemption_code_format
    CHECK (redemption_code IS NULL OR redemption_code ~ '^[0-9]{8}$');

-- Signature is base64url-encoded HMAC-SHA256 (43-44 chars typically)
ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_redemption_code_signature_format
    CHECK (redemption_code_signature IS NULL OR LENGTH(redemption_code_signature) >= 40);

-- Both columns must be set together or both null
ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_redemption_code_complete
    CHECK (
      (redemption_code IS NULL AND redemption_code_signature IS NULL) OR
      (redemption_code IS NOT NULL AND redemption_code_signature IS NOT NULL)
    );

-- Redemption codes must be unique when present
-- Unlike the 10-char code which has a unique index, 8-digit codes have higher
-- collision probability (~0.05% over 10k codes), so uniqueness is enforced
CREATE UNIQUE INDEX vouchers_redemption_code_unique
  ON vouchers(redemption_code)
  WHERE redemption_code IS NOT NULL;

COMMENT ON COLUMN vouchers.redemption_code IS
  '8-digit numeric code for phone/SMS entry, simpler than 10-char alphanumeric code';

COMMENT ON COLUMN vouchers.redemption_code_signature IS
  'HMAC-SHA256(code:voucher_id, VOUCHER_QR_SECRET) as base64url, for verification';
