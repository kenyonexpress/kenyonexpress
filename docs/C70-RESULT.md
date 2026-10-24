# C70 CRON_SECRET Rotation - Result

**Date:** 2026-10-25  
**Status:** PARTIAL COMPLETION - Vercel + GitHub complete, Supabase vault blocked

## Summary

Rotated CRON_SECRET across Vercel and GitHub Secrets. VOUCHER_QR_SECRET rotation and Supabase vault updates require manual intervention due to technical constraints.

## Completed

### 1. Generated New Secrets
- **New CRON_SECRET:** `fEZQ2HYnROvmqi0Xed2X2sskElGZOxLSYmu37YY9aT0=`
- **New VOUCHER_QR_SECRET:** `qouIiyb94enKeFV1lv2nIWzBP7kN1QcKl7z8pvENA7w=` (not applied - see Blocked section)

### 2. Vercel Environment Variables Updated
**Project: kenyonexpress (production)**
- ✅ CRON_SECRET (production) - ID: OeRenlWVf05WOAjx - Updated: 1792869203905
- ✅ CRON_SECRET (preview) - ID: gZo9OEGPTXUteC1m - Updated: 1792869205518
- ✅ CRON_SECRET (development) - ID: HlNqQQv5xqyoRrXo - Updated: 1792869207036

**Project: kenyonexpress-staging**
- ✅ CRON_SECRET (production + preview) - ID: KrAZCTRYKB5hL2iv - Updated: 1792869223752

### 3. GitHub Secrets Updated
- ✅ CRON_SECRET - Repository: kenyonexpress/kenyonexpress
- Used by: `.github/workflows/cron.yml` (line 83)

## Blocked

### 1. VOUCHER_QR_SECRET Rotation
**Reason:** Cannot decrypt current value from Vercel (encrypted/sensitive type)

**Impact:** The code in `src/server/domain/vouchers/qr.ts` supports rotation via `VOUCHER_QR_SECRET_PREVIOUS`, but requires the current secret value to be moved to the _PREVIOUS variable before rotating. Without access to decrypt the current value, safe rotation is impossible.

**Risk:** Rotating without preserving the old value would invalidate all existing voucher QR codes.

**Manual Steps Required:**
1. Access Vercel dashboard as owner
2. Copy current VOUCHER_QR_SECRET value
3. Create new environment variable VOUCHER_QR_SECRET_PREVIOUS with the old value
4. Update VOUCHER_QR_SECRET with the new value: `qouIiyb94enKeFV1lv2nIWzBP7kN1QcKl7z8pvENA7w=`
5. Test a voucher QR code to ensure backward compatibility works

**Vercel Environment IDs:**
- Production: SnoLWGvIPoHPafVx (project: kenyonexpress)
- Staging: UlHOlMzSxUPaFqDu (project: kenyonexpress-staging)

### 2. Supabase Vault Updates
**Reason:** Supabase MCP requires OAuth authentication (unavailable in non-interactive session)

**Impact:** Migrations 162 and 289 (pg_cron jobs) read `CRON_SECRET` and `APP_BASE_URL` from `vault.decrypted_secrets` at runtime. Without updating the vault, cron jobs scheduled via pg_cron will use the old secret and receive 401 errors.

**Current Status:**
- GitHub Actions cron jobs (.github/workflows/cron.yml) will work with the new secret ✅
- Vercel cron routes will accept the new secret ✅
- pg_cron jobs (if/when migration 162 is applied) will fail with old vault secret ❌

**Manual Steps Required:**
```sql
-- Connect to production database via Supabase dashboard or psql
SELECT vault.create_secret('fEZQ2HYnROvmqi0Xed2X2sskElGZOxLSYmu37YY9aT0=', 'CRON_SECRET');
```

**Evidence of Blocker:**
- STATE.md line 236: "BLOCKED C49-M13 (Money Constraints) - CRITICAL 2026-10-24: Supabase MCP requires OAuth (unavailable in non-interactive session)"
- STATE.md multiple entries: "Supabase MCP needs OAuth (authorize in connector settings)"
- Migration 162_cron_schedule.sql lines 31-36: Checks for vault secrets CRON_SECRET and APP_BASE_URL

## Verification

### Cron Routes Protected
All cron routes verify CRON_SECRET via `bearerMatches()`:

1. `/api/cron/*` routes (fraud-monitor, etc.) - Line reference: `src/app/api/cron/fraud-monitor/route.ts:18`
2. `/api/cache/purge` - `src/app/api/cache/purge/route.ts:9`
3. `/api/sms/unsubscribe` - `src/app/api/sms/unsubscribe/route.ts:15`
4. `/api/search/index-job` - `src/app/api/search/index-job/route.ts:14`

### Compromised Keys Script
The `scripts/compromised-keys.mjs` script flags both secrets as compromised:
- Line 70: CRON_SECRET
- Line 71: VOUCHER_QR_SECRET

**Post-Rotation:** CRON_SECRET rotation complete, script will no longer flag it. VOUCHER_QR_SECRET remains flagged pending manual rotation.

## Testing

### Local Testing
```bash
# Test cron route with new secret
curl -X POST http://localhost:3000/api/cron/health \
  -H "Authorization: Bearer fEZQ2HYnROvmqi0Xed2X2sskElGZOxLSYmu37YY9aT0=" \
  -H "Content-Type: application/json"
# Expected: 200 OK

# Test with old/wrong secret
curl -X POST http://localhost:3000/api/cron/health \
  -H "Authorization: Bearer old-secret-value" \
  -H "Content-Type: application/json"
# Expected: 401 Unauthorized
```

### Production Verification
After next Vercel deployment:
1. Monitor `.github/workflows/cron.yml` runs for 401 errors (should be 0)
2. Check ntfy.sh/kenyon-ofir-limit for cron success notifications
3. Verify no 401 errors in Sentry for cron routes

## Rollback

If issues arise:

### Vercel Rollback
Use Vercel dashboard or CLI to revert to previous CRON_SECRET values:
```bash
vercel env rm CRON_SECRET production --yes
vercel env add CRON_SECRET production
# Enter old value when prompted
```

### GitHub Rollback
```bash
# Set CRON_SECRET back to old value
echo "OLD_VALUE_HERE" | gh secret set CRON_SECRET
```

## Next Actions

1. **Owner:** Manually rotate VOUCHER_QR_SECRET via Vercel dashboard (see Manual Steps)
2. **Owner:** Update Supabase vault CRON_SECRET via SQL (see Manual Steps)
3. **After vault update:** Apply migration 162 to enable pg_cron jobs
4. **After rotation:** Remove CRON_SECRET and VOUCHER_QR_SECRET from `scripts/compromised-keys.mjs`

## References

- Migration 162: `migrations/pending/162_cron_schedule.sql`
- Cron routes: `src/app/api/cron/*/route.ts`
- Voucher QR: `src/server/domain/vouchers/qr.ts`
- GitHub workflow: `.github/workflows/cron.yml`
- Compromised keys: `scripts/compromised-keys.mjs`
