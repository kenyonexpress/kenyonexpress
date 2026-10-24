# KenyonExpress Manual Intervention Items

**Date:** 2026-10-24  
**Purpose:** Comprehensive list of items requiring Ofir's manual intervention, organized by criticality

---

## 🔴 CRITICAL - Production Launch Blockers

These items must be completed before production can serve real customers.

### 1. Cardcom Production Credentials ⚠️ HIGHEST PRIORITY

**Status:** BLOCKED - Production is using mock/sandbox Cardcom  
**Impact:** Real payments cannot be processed  
**Complexity:** Low (15-30 minutes)

**Current State:**
- Code uses `CARDCOM_USE_MOCK=true` or sandbox credentials
- All payment infrastructure is code-complete and tested
- Awaiting real terminal credentials from Cardcom

**Required Actions:**
1. Obtain production Cardcom terminal credentials:
   - Terminal Number
   - API Name
   - API Password  
   - Webhook Secret
2. Set in Vercel production environment:
   ```bash
   vercel env add CARDCOM_TERMINAL_NUMBER production
   vercel env add CARDCOM_API_NAME production
   vercel env add CARDCOM_API_PASSWORD production
   vercel env add CARDCOM_WEBHOOK_SECRET production
   vercel env rm CARDCOM_USE_MOCK production  # Remove mock flag
   ```
3. Redeploy production
4. Test checkout with real card (use test terminal first)
5. Verify webhook delivery

**Verification:**
- Real checkout completes successfully
- Cardcom dashboard shows transaction
- Webhook writes to `payment_events` table
- Money moves through system correctly (integer agorot)

**Next After This:** Meilisearch provisioning

**References:**
- STATE.md line 38: "Cardcom-prod-creds: set production credentials in the host env, then re-run checkout E2E on live"
- STATE.md line 54: "BLOCKED cardcom-prod-creds: production is still CARDCOM_USE_MOCK=true / sandbox"

---

### 2. Vercel Production Deployment Resolution

**Status:** BLOCKED - Vercel platform error  
**Impact:** Cannot deploy to production  
**Complexity:** Medium (requires Vercel support)

**Current State:**
- All code quality gates pass (type-check, lint, build)
- GitHub Actions workflow created but untested
- Deployment blocked by Vercel API error: "Internal Server Error" after 200s file upload
- Archive mode (--archive=tgz) permanently enabled in run-final.sh

**The Error:**
```
POST https://api.vercel.com/v2/files
SyntaxError: Unexpected token 'I', "Internal S"... is not valid JSON
```

This is a Vercel infrastructure issue, not code/configuration.

**Required Actions:**

**Option A: Wait and Retry**
1. Wait 24-48 hours for Vercel platform issue to clear
2. Retry deployment from main repo:
   ```bash
   cd /Users/ofir/kenyonexpress-web/kenyonexpress
   git checkout closeout/v1-final
   git pull
   pnpm build  # Verify build succeeds
   vercel deploy --prod --archive=tgz
   ```

**Option B: Contact Vercel Support**
1. Open ticket at https://vercel.com/support
2. Reference: "Internal Server Error on POST /v2/files after 200s upload"
3. Include project ID, timestamp, error message
4. Request investigation

**Option C: Use GitHub Actions (After Secrets Set)**
1. Set GitHub secrets (see item #4 below)
2. Push to `closeout/v1-final`
3. Workflow `.github/workflows/vercel-deploy.yml` auto-deploys

**Verification:**
- Deployment succeeds
- Production URL serves the app
- `deploy-preflight.mjs` passes on Vercel (all 10 secrets present)
- Health check returns 200: `https://www.kenyonexpress.co.il/api/health`

**References:**
- docs/C41-ACTUAL-RESULT.md (complete error analysis)
- STATE.md line 120: "C41|Vercel production deploy - BLOCKED"

---

### 3. Meilisearch Instance Provisioning

**Status:** BLOCKED - No live Meilisearch instance  
**Impact:** Search falls back to slow Postgres ILIKE queries  
**Complexity:** Medium (30-60 minutes)

**Current State:**
- `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set in Vercel
- Values either point to non-existent instance or have invalid credentials
- All searches return `"engine": "database"` (fallback mode)
- Setup scripts ready: `scripts/setup-meilisearch.mjs`

**Evidence:**
```bash
curl https://www.kenyonexpress.co.il/api/search/facets?q=ספא
# Returns: "engine": "database"
```

**Required Actions:**

**Option A: Meilisearch Cloud (Recommended)**
1. Create account at https://cloud.meilisearch.com
2. Provision instance (Paris or Frankfurt region for EU proximity)
3. Note instance URL and API key
4. Update Vercel env:
   ```bash
   vercel env rm MEILISEARCH_HOST production
   vercel env rm MEILISEARCH_API_KEY production
   vercel env add MEILISEARCH_HOST production
   # Enter: https://<instance-id>.meilisearch.io
   vercel env add MEILISEARCH_API_KEY production
   # Enter: <search-key>
   ```
5. Redeploy production
6. Run setup script to create index:
   ```bash
   MEILISEARCH_HOST=<url> MEILISEARCH_API_KEY=<key> \
     node scripts/setup-meilisearch.mjs
   ```

**Option B: Self-Host on Railway/Fly.io**
1. Deploy Meilisearch container
2. Set `MEILI_MASTER_KEY` (minimum 16 bytes)
3. Generate search-only API key
4. Update Vercel env as above
5. Run setup script

**Verification:**
- Search returns `"engine": "meilisearch"`
- Hebrew queries work correctly
- Synonyms active (try "ספא" vs "spa")
- Typo tolerance works

**Cost:** ~$30/month (Meilisearch Cloud)

**References:**
- docs/C17-MEILISEARCH-BLOCKED.md (complete setup guide)
- Memory: production-meilisearch-silently-off.md (2026-10-14)

---

### 4. GitHub Secrets Configuration

**Status:** NOT SET - Auto-deploy workflow incomplete  
**Impact:** Cannot use GitHub Actions for deployment  
**Complexity:** Low (10 minutes)

**Current State:**
- Workflow file `.github/workflows/vercel-deploy.yml` created
- Never tested (secrets not set)
- Would enable auto-deploy on push to `closeout/v1-final`

**Required Actions:**

1. Get Vercel credentials:
   ```bash
   # Get token from Vercel dashboard: Settings → Tokens
   # Get org/project IDs:
   vercel project ls
   ```

2. Set GitHub repository secrets:
   - Go to: https://github.com/ofirsteinherz/kenyonexpress/settings/secrets/actions
   - Add three secrets:
     - `VERCEL_TOKEN` = (Vercel API token)
     - `VERCEL_ORG_ID` = (from `vercel project ls`)
     - `VERCEL_PROJECT_ID` = (from `vercel project ls`)

3. Test workflow:
   ```bash
   git checkout closeout/v1-final
   git push origin closeout/v1-final
   # Watch: https://github.com/ofirsteinherz/kenyonexpress/actions
   ```

**Verification:**
- Workflow runs successfully
- Deployment appears in Vercel dashboard
- Production URL updated

**References:**
- docs/C41-ACTUAL-RESULT.md lines 18-28
- .github/workflows/vercel-deploy.yml (workflow file)

---

## 🟡 HIGH PRIORITY - Core Functionality

These items block specific features but don't prevent basic operation.

### 5. Supabase MCP OAuth Authorization

**Status:** BLOCKED - OAuth required for multiple features  
**Impact:** Cannot apply migrations, verify DB state, or complete cron setup  
**Complexity:** Low (5 minutes, but recurring)

**Current State:**
- Supabase MCP requires OAuth
- OAuth unavailable in non-interactive sessions
- Blocks: C28 (expiry reminders cron), migration verification, RLS checks

**Blocked Features:**
1. **Voucher Expiry Reminders (C28)**
   - Migration 114: `enqueue_expiring_voucher_notices` function
   - Migration 162: pg_cron job `ke-expire-vouchers`
   - Cannot verify if applied to production

2. **Migration Verification**
   - Cannot confirm which migrations are live
   - Migration 280, 282, 283, 284, 290, 292, 293 status unknown

3. **RLS Policy Verification**
   - Cannot audit RLS policies
   - Cannot verify security boundaries

**Required Actions:**

1. **In Interactive Claude Session:**
   - Open claude.ai in browser
   - Start new session or use existing
   - Navigate to Settings → Integrations
   - Find "Supabase" connector
   - Click "Authorize"
   - Complete OAuth flow

2. **Then Run Migration Checks:**
   ```
   Use Supabase MCP to:
   1. List all migrations applied to production
   2. Verify migration 114 (enqueue_expiring_voucher_notices)
   3. Verify migration 162 (pg_cron schedule)
   4. Verify migrations 280, 282, 283, 284, 290, 292, 293
   5. Document results in docs/MIGRATIONS-APPLIED.md
   ```

**Alternative (Without MCP):**
Use Supabase Management API via CLI token:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
DEC=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)
curl -H "Authorization: Bearer $DEC" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM pg_cron.job"}' \
  https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query
```

**References:**
- docs/C28-SUPABASE-MCP-BLOCKER.md (detailed analysis)
- Memory: production-sql-via-cli-keychain-token.md

---

### 6. Lighthouse Performance > 90 Threshold

**Status:** INCOMPLETE - Cannot meet on localhost  
**Impact:** Performance scores 46% pass rate  
**Complexity:** High (requires production testing or major refactoring)

**Current State:**
- Accessibility: 100% pass ✅
- Best Practices: 100% pass ✅
- SEO: 85% pass (2 routes at 92 due to PPR timing) ⚠️
- Performance: 46% pass (6/13 routes > 90) ❌

**Performance Issues:**
- Simulated mobile LCP 3-5.4s (Lantern model)
- Localhost lacks production infrastructure (CDN, edge caching)
- Code already optimized (single CSS bundle, font strategy, PPR)

**Routes Failing:**
- Mobile: contact (72), suppliers (83), catalogue (85), search (85), accessibility (86), privacy (86), coupons (87)
- Desktop: returns (81), contact (83), coupons (84), privacy (84), catalogue (85), category (85), search (86), home (88)

**Required Actions:**

**Option A: Test on Production (After Deploy)**
1. Deploy to production (resolve item #2 first)
2. Run Lighthouse against live URL with CDN/caching
3. Measure real performance vs localhost simulation
4. If still < 90, proceed to Option B

**Option B: Architectural Refactoring**
1. Implement route-level code splitting
2. Defer non-critical JavaScript
3. Optimize LCP elements (hero images, fonts)
4. Add edge caching headers
5. Consider static generation for key routes

**Option C: Accept 46% Pass Rate**
- Document that 6/13 routes meet threshold
- Focus on critical paths (home, category, product)
- Defer non-critical route optimization

**Verification:**
Production Lighthouse scores:
- Mobile & Desktop: 90% of routes > 90 performance

**References:**
- STATE.md lines 20-96 (C33 full analysis)
- docs/C33-LIGHTHOUSE-RESULTS.md

---

## 🟢 MEDIUM PRIORITY - Quality & Testing

These items improve quality and coverage but don't block launch.

### 7. E2E Test Suite Full Coverage

**Status:** PARTIAL - 17-52 failures out of ~665 tests  
**Impact:** Some E2E scenarios untested  
**Complexity:** Medium (needs non-prod DB fixture)

**Current State:**
- Vitest: 6,658 passed, 27 skipped ✅
- Playwright: Mixed results
  - Dev server run: ~619 passed, ~52 failed
  - Prod build run: ~642 passed, ~17 failed

**Remaining Failures:**
1. **Fixture DB Required:**
   - admin-product-crud
   - physical-purchase
   - purchase-flow
   - full-purchase-redeem
   
   These need seeded test data but only production DB is accessible.

2. **UI Fixes Required:**
   - rtl-mobile 320px viewport (signup/forgot-password/reset-password render 336px wide)
   - home.spec mobile-chrome (stock reads, prerender issues)
   - touch-targets
   - mobile-gestures

**Required Actions:**

**Option A: Provision Test Supabase Project**
1. Create new Supabase project for testing
2. Apply all migrations from `migrations/applied/`
3. Seed with test data via `scripts/seed-test-db.mjs`
4. Update `.env.test` with test project URL/keys
5. Re-run Playwright suite

**Option B: Accept Current Coverage**
- 90%+ tests passing
- Critical paths covered
- Fixture-dependent tests documented as blocked
- Focus on fixing UI issues (320px, touch-targets)

**Option C: Fix UI Issues Only**
1. Fix signup/login forms at 320px viewport
2. Fix touch target sizes (<48px)
3. Fix home.spec mobile-chrome prerender
4. Re-run with production DB (non-destructive tests)

**Verification:**
- Two consecutive full Playwright runs with 100% pass rate
- Or: Document specific blockers and 90%+ pass rate

**References:**
- STATE.md lines 91-92 (F36, Z14 blocked tests)
- Memory: e2e-orders-land-in-production-db.md (9-11 orders/hour written to prod)

---

## 📋 Completion Checklist

Use this to track progress through manual items:

```
Production Launch Blockers:
[ ] 1. Cardcom production credentials set
[ ] 2. Vercel deployment succeeds
[ ] 3. Meilisearch instance provisioned
[ ] 4. GitHub secrets configured

Core Functionality:
[ ] 5. Supabase MCP OAuth authorized
[ ] 6. Lighthouse performance measured on production

Quality & Testing:
[ ] 7. E2E test suite coverage decision made
```

---

## 🔄 Maintenance Items (Post-Launch)

These can be addressed after initial launch:

### 8. Supabase Anonymous Sign-ins + Manual Linking

**For:** Guest checkout → save with Google  
**Action:** Enable in Supabase dashboard → Authentication → Providers  
**Impact:** Guests fall back to Google-first if disabled  

### 9. DMARC Tighten to Quarantine

**Current:** `p=none` (monitoring)  
**Action:** After monitoring clean, change to `p=quarantine`  
**File:** DNS TXT record for `_dmarc.kenyonexpress.co.il`

### 10. Push Notification Kinds Migration

**Blocker:** `notification_outbox_kind_check` migration  
**Action:** Apply before sending production push notifications  
**File:** TBD (not created yet)

### 11. Maintenance Mode Banner

**Code:** `src/components/maintenance/MaintenanceBanner.tsx` exists  
**Action:** Mount in layout when needed  
**Flag:** `FLAG_MAINTENANCE_BANNER=1`

---

## 🚀 Launch Sequence Recommendation

**Recommended order for unblocking production:**

1. **Set Cardcom credentials** (15 min) → Enables real payments
2. **Provision Meilisearch** (30 min) → Improves search performance  
3. **Resolve Vercel deploy** (varies) → Gets code to production
4. **Set GitHub secrets** (10 min) → Enables auto-deploy
5. **Test checkout E2E on production** → Verify end-to-end flow
6. **Authorize Supabase MCP** (5 min, interactive) → Verify migrations
7. **Lighthouse on production** → Measure real performance

**Total estimated time:** 2-4 hours (excluding Vercel support wait)

---

## 📞 Support Contacts

- **Vercel Support:** https://vercel.com/support
- **Meilisearch Cloud:** https://cloud.meilisearch.com
- **Supabase Support:** https://supabase.com/support
- **Cardcom Support:** (contact info from account manager)

---

## 📄 Reference Documentation

- STATE.md - Current project state
- docs/C41-ACTUAL-RESULT.md - Vercel deploy blocker details
- docs/C17-MEILISEARCH-BLOCKED.md - Meilisearch setup guide
- docs/C28-SUPABASE-MCP-BLOCKER.md - MCP OAuth blocker
- docs/C33-LIGHTHOUSE-RESULTS.md - Performance audit results
- CLAUDE.md - Project rules and working mode

---

**Last Updated:** 2026-10-24  
**Generated By:** Autopilot C43  
**Status:** Complete
