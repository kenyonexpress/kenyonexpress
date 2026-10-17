# Secret Rotation Procedures — Q4 2026

This document describes the mechanics and rollback procedures for Q4 2026 secret rotations.

**Date**: 2026-10-18  
**Secrets Rotated**: CRON_SECRET, VOUCHER_QR_SECRET

---

## CRON_SECRET Rotation

### Purpose
Authentication token for Vercel cron routes and the `/api/cron/health` endpoint.

### Affected Routes
- `src/app/api/cache/purge/route.ts` — cache invalidation (Bearer token)
- `src/app/api/cron/reconcile/route.ts` — payment reconciliation (Vercel cron)
- `src/app/api/cron/search-report/route.ts` — search metrics (Vercel cron)
- `src/app/api/cron/p95-monitor/route.ts` — performance monitoring (Vercel cron)
- `src/app/api/cron/invoices/route.ts` — invoice generation (Vercel cron)
- `src/app/api/cron/retention/route.ts` — retention analytics (Vercel cron)
- `src/app/api/sms/unsubscribe/route.ts` — SMS unsubscribe (Bearer token)
- `/api/cron/health` — health check endpoint (Bearer token)

### Local Rotation (Development)
```bash
# Generate new secret locally
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Location: .env.local (gitignored, never committed)
CRON_SECRET=<generated-32-byte-hex-string>
```

### Production Rotation (When Needed)
1. Generate new 32-byte hex string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Add new value to Vercel environment variables
3. Deploy (no code changes needed)
4. Verify cron routes still authenticate
5. Remove old value from Vercel (optional — can keep for rollback window)

### Rollback
If cron routes fail authentication after rotation:
```bash
# Revert to old CRON_SECRET in Vercel
CRON_SECRET=<previous-value>

# Redeploy
```

### Testing
```bash
# Test the health endpoint locally (requires CRON_SECRET in env)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/health
```

---

## VOUCHER_QR_SECRET Rotation

### Purpose
HMAC-SHA256 key for signing and verifying QR code tokens on vouchers.

### Affected Routes
- `src/server/domain/vouchers/qr.ts` — signing and verification
- `src/app/api/supplier/vouchers/redeem/route.ts` — QR verification
- `src/app/redeem/[token]/page.tsx` — token verification

### How Rotation Works

The verification function (`verifyVoucherQrPayload`) supports key rotation:

```typescript
function verificationSecrets(): string[] {
  const secrets = [primarySecret()]                           // Current: VOUCHER_QR_SECRET
  const previous = process.env.VOUCHER_QR_SECRET_PREVIOUS     // Previous: for grace period
  if (previous && previous.length >= 16) secrets.push(previous)
  return secrets
}
```

**New tokens** are always signed with `VOUCHER_QR_SECRET` (primary).  
**Existing tokens** can be verified with either the current or previous secret.

### Local Rotation (Development)
```bash
# Optional: Save old value (only if you have in-flight tokens)
# VOUCHER_QR_SECRET_PREVIOUS=<old-value>

# Generate and set new value
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Location: .env.local (gitignored, never committed)
VOUCHER_QR_SECRET=<generated-32-byte-hex-string>
```

### Production Rotation (When Needed)

**Grace Period Approach** (recommended):

1. Generate new 32-byte hex string
2. Set `VOUCHER_QR_SECRET_PREVIOUS` to current value (in Vercel)
3. Set `VOUCHER_QR_SECRET` to new value (in Vercel)
4. Deploy (both variables active)
5. Wait 24-48 hours for in-flight tokens to be redeemed
6. Remove `VOUCHER_QR_SECRET_PREVIOUS` from Vercel
7. Deploy again

**Immediate Rotation** (if not concerned about in-flight tokens):

1. Generate new 32-byte hex string
2. Set `VOUCHER_QR_SECRET` to new value only (in Vercel)
3. Deploy
4. Old tokens will fail verification (users must re-request QR)

### Rollback

If QR redemption fails after rotation:

```bash
# Revert VOUCHER_QR_SECRET
VOUCHER_QR_SECRET=<old-value>

# Keep VOUCHER_QR_SECRET_PREVIOUS unset (or empty)
VOUCHER_QR_SECRET_PREVIOUS=

# Redeploy
```

### Testing

```bash
# Unit tests verify signing and verification
pnpm test -- src/server/domain/vouchers/qr.test.ts

# Integration test for redemption
pnpm test -- src/app/api/supplier/vouchers/redeem/route.test.ts
```

---

## Verification Checklist

After deploying new secrets to production:

- [ ] Cron routes respond with 200 and auth required error without secret
- [ ] Cron health endpoint returns full status with correct secret
- [ ] QR code generation produces valid tokens
- [ ] QR code verification accepts new tokens
- [ ] QR code redemption flow completes end-to-end
- [ ] Old QR tokens still verify (if using grace period)

---

## Key Rotation Policy

### Recommended Schedule
- **CRON_SECRET**: Quarterly (Q4 2026 ✓, Q1 2027 due)
- **VOUCHER_QR_SECRET**: Quarterly (Q4 2026 ✓, Q1 2027 due)
- **CARDCOM_***: Semi-annual or after incident (next: Q1 2027)

### When to Rotate
- Quarterly maintenance window
- After suspected compromise
- Before major infrastructure changes
- Before staff departures

### Storage
- **Development**: `.env.local` (gitignored, never committed)
- **Production**: Vercel Environment Variables (web UI or CLI)
- **CI/Tests**: `.env.test` (placeholders only) or Vercel CI env vars

---

## Compromised Key Registry

No compromises detected during Q4 2026 review.

Active compromised key on record:
- Internal documentation only (no reference in code)
- Rotation procedure defined in `docs/RUNBOOK.md`

---

## Automation and Monitoring

**Current state**: Manual rotation via `docs/QUARTERLY-ACCESS-REVIEW-2026Q4.md`

**Future considerations**:
- Automate via CI/CD pipeline (not yet implemented)
- Rotation notifications via Sentry/ntfy
- Automatic grace period management for VOUCHER_QR_SECRET_PREVIOUS
- Key age tracking and alerts
