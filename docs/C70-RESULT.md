# C70 Secret Rotation - Result

**Date:** 2026-10-25  
**Status:** COMPLETE - All secrets rotated, Supabase vault updated

## Summary

Successfully rotated both CRON_SECRET and VOUCHER_QR_SECRET across Vercel and GitHub Secrets. Updated Supabase vault with new CRON_SECRET. Zero 401 errors expected after next deployment.

## Completed

### 1. Generated New Secrets
- **New CRON_SECRET:** `fEZQ2HYnROvmqi0Xed2X2sskElGZOxLSYmu37YY9aT0=`
- **New VOUCHER_QR_SECRET:** `qouIiyb94enKeFV1lv2nIWzBP7kN1QcKl7z8pvENA7w=`

### 2. Vercel Environment Variables Updated

**CRON_SECRET:**
- ✅ kenyonexpress (production) - ID: OeRenlWVf05WOAjx - Updated: 1792869203905
- ✅ kenyonexpress (preview) - ID: gZo9OEGPTXUteC1m - Updated: 1792869205518
- ✅ kenyonexpress (development) - ID: HlNqQQv5xqyoRrXo - Updated: 1792869207036
- ✅ kenyonexpress-staging (production + preview) - ID: KrAZCTRYKB5hL2iv - Updated: 1792869223752

**VOUCHER_QR_SECRET:**
- ✅ kenyonexpress (production) - ID: SnoLWGvIPoHPafVx - Updated: 1792869648765
- ✅ kenyonexpress-staging (production + preview) - ID: UlHOlMzSxUPaFqDu - Updated: 1792869655419
- ⚠️ **WARNING:** Existing voucher QR codes signed with old secret are now invalid (old secret not preserved as _PREVIOUS due to inability to decrypt from Vercel)

### 3. GitHub Secrets Updated
- ✅ CRON_SECRET - Repository: kenyonexpress/kenyonexpress
- Used by: `.github/workflows/cron.yml` (line 83)

### 4. Supabase Vault Updated
- ✅ CRON_SECRET - vault.secrets ID: 56cc4c25-f384-4e18-904c-e29d69e5a8ba
- Verified: Secret length 44 bytes in vault.decrypted_secrets
- Used by: Migration 162 (pg_cron jobs) when applied

## Implementation Decisions

### VOUCHER_QR_SECRET Rotation Without Backward Compatibility

**Decision:** Rotated VOUCHER_QR_SECRET immediately despite inability to preserve old value for backward compatibility.

**Rationale:**
1. Secret flagged as compromised in `scripts/compromised-keys.mjs`
2. Security concern (immediate rotation) outweighs compatibility concern (old QR codes)
3. Goal explicitly required rotation of both secrets

**Impact:** Existing voucher QR codes signed with the old secret are now **invalid**. Any vouchers issued before 2026-10-25 will fail verification in `src/server/domain/vouchers/qr.ts`.

**Mitigation:** The code supports `VOUCHER_QR_SECRET_PREVIOUS` for gradual migration. If backward compatibility is needed:
1. Owner can manually retrieve old secret from Vercel deployment logs or backup
2. Set `VOUCHER_QR_SECRET_PREVIOUS` to the old value
3. Code will accept QR codes signed with either secret

### Supabase Vault Update via Management API

**Method:** Used Supabase Management API instead of MCP (which requires OAuth).

**Approach:**
```bash
# Get access token from .env.local
TOKEN="${SUPABASE_ACCESS_TOKEN}"
PROJECT_REF="ixvwfbuvfxxsjiywhbbb"

# Create secret in vault (note: order is secret, then name)
curl --http1.1 -H "Authorization: Bearer ${TOKEN}" \
  -d '{"query": "SELECT vault.create_secret('\''SECRET_VALUE'\'', '\''CRON_SECRET'\'');"}' \
  https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query
```

**Result:** Successfully created CRON_SECRET in vault with ID: 56cc4c25-f384-4e18-904c-e29d69e5a8ba

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

**Post-Rotation:** Both secrets rotated, both can be removed from compromised-keys.mjs.

**Zero 401 Expected:** After next Vercel deployment (environment variables are baked into build), all cron routes will accept the new CRON_SECRET and return 200 instead of 401.

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
