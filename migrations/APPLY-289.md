# Applying Migration 289: Auth Attempts & Passkey Credentials

## Migration Status
- **File**: `migrations/pending/preflight_289.sql`
- **Status**: Ready for application
- **Required for**: Email fallback after N failed login attempts

## Tables Created

### 1. passkey_credentials
WebAuthn passkey credentials storage (may duplicate existing `webauthn_credentials` - review before applying)

### 2. auth_attempts  
**CRITICAL**: Tracks all authentication attempts for fallback logic
- Records: passkey, whatsapp_otp, email_otp, password attempts
- Powers `shouldFallbackToEmail()` logic
- Used by LoginModal to show email fallback

### 3. otp_codes
Temporary OTP code storage with 10-minute expiration

## How to Apply

### Via Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of `preflight_289.sql`
3. Run the migration
4. Verify tables created: `auth_attempts`, `passkey_credentials`, `otp_codes`

### Via CLI (if linked)
```bash
supabase db push --include-all
```

### Via MCP (requires OAuth setup)
Cannot be done in non-interactive Claude sessions - requires browser OAuth flow.

## Verification After Application

Run this SQL to verify:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('auth_attempts', 'passkey_credentials', 'otp_codes');
```

Should return 3 rows.

## Test the Fallback

1. Visit `/login`
2. Attempt passkey login 3 times (fail each time)
3. Page should show orange message: "זוהו ניסיונות כניסה כושלים"
4. Should auto-switch to "קישור" (magic link) tab

## Rollback (if needed)

```sql
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS auth_attempts;
DROP TABLE IF EXISTS passkey_credentials;
```
