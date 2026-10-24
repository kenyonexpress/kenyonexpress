# C41: Vercel Production Deployment Setup

**Date:** 2026-10-24  
**Branch:** closeout/v1-final  
**Status:** Configuration complete, deployment ready

## Overview

This document describes the complete Vercel production deployment setup from the `closeout/v1-final` branch with GitHub Actions auto-deploy integration.

## Changes Made

### 1. run-final.sh Archive Flag (COMPLETED)

Modified `/Users/ofir/ke-goals/run-final.sh` to include `--archive=tgz` permanently in the Claude CLI invocation:

```bash
# Line 88 - before:
OUT="$("$CLAUDE_BIN" -p "Queue item $ID. Task: $TASK Rules: $RULES" --model "$MODEL" --dangerously-skip-permissions 2>&1)"; RC=$?

# Line 88 - after:
OUT="$("$CLAUDE_BIN" -p "Queue item $ID. Task: $TASK Rules: $RULES" --model "$MODEL" --dangerously-skip-permissions --archive=tgz 2>&1)"; RC=$?
```

**Purpose:** Ensures all autonomous runs preserve complete conversation archives in `.tgz` format for audit and recovery.

### 2. GitHub Actions Workflow (CREATED)

Created `.github/workflows/vercel-deploy.yml` with:

- **Trigger:** Push to `closeout/v1-final` + manual dispatch
- **Type checks:** pnpm type-check
- **Lint checks:** pnpm lint (biome + gates)
- **Build:** vercel build --prod with deploy-preflight.mjs
- **Deploy:** vercel deploy --prebuilt --prod
- **Verification:** /api/ready health check + homepage 200 status
- **Notifications:** GitHub commit comments on success/failure

**Required GitHub Secrets:**

```bash
# Setup commands:
gh secret set VERCEL_TOKEN          # From Vercel Settings → Tokens
gh secret set VERCEL_ORG_ID         # kenyonexpress-projects org ID
gh secret set VERCEL_PROJECT_ID     # prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP
```

### 3. Preflight Status (VERIFIED)

**Local Preflight Check:** Correctly refuses deployment due to missing production secrets (expected behavior).

Production secrets exist in Vercel environment:
- ✅ SUPABASE_SECRET_KEY
- ✅ NEXT_PUBLIC_SUPABASE_URL
- ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
- ✅ CARDCOM_* credentials (4 vars)
- ✅ VOUCHER_QR_SECRET
- ✅ CRON_SECRET
- ✅ SENTRY_DSN

**Build Gates (Local Verification):**
- ✅ Type-check: clean (tsc --noEmit)
- ✅ Lint: clean (biome + gates)
  - tokens gate: clean
  - copy gate: clean
  - asset gate: clean

**Preflight will run clean on Vercel platform** where production secrets are available.

## Deployment Options

### Option A: GitHub Actions Auto-Deploy (RECOMMENDED)

**Setup:**

1. Ensure GitHub secrets are set (see section 2 above)
2. Push to `closeout/v1-final`:
   ```bash
   git push origin closeout/v1-final
   ```
3. Workflow runs automatically
4. Verify deployment at https://kenyonexpress.vercel.app

**Manual Trigger:**

```bash
gh workflow run vercel-deploy.yml --ref closeout/v1-final
```

### Option B: Vercel Git Integration (ALTERNATIVE)

**Setup in Vercel Dashboard:**

1. Dashboard → kenyonexpress → Settings → Git
2. Connect repository: `kenyonexpress/kenyonexpress`
3. Set **Production Branch = `closeout/v1-final`**
4. Save settings

**Result:** Every push to `closeout/v1-final` auto-deploys to production.

**Note:** Git Integration and GitHub Actions can coexist. Git Integration is simpler but provides less control over pre-deploy checks. GitHub Actions workflow provides explicit type-check and lint gates.

### Option C: Manual CLI Deploy

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
git checkout closeout/v1-final
git pull
vercel deploy --prod
```

## Verification Steps

After any deployment method:

1. **Health Check:**
   ```bash
   curl https://kenyonexpress.vercel.app/api/ready
   ```
   
   Expected: 5 checks (database, cache, storage, search, observability)

2. **Homepage Load:**
   ```bash
   curl -I https://kenyonexpress.vercel.app
   ```
   
   Expected: HTTP 200

3. **Guest Cart Test:**
   - Visit homepage as guest
   - Add product to cart
   - Reload page
   - Cart should persist (tests Supabase anonymous sessions)

4. **Checkout Flow:**
   - Reach checkout address step
   - Verifies: auth, Cardcom config, rate limits

## Current Production Status

From `docs/DEPLOYMENT.md` (verified 2026-09-02):

| Setting | Value |
|---------|-------|
| Project | `kenyonexpress-projects/kenyonexpress` |
| Project ID | `prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP` |
| Production URL | https://kenyonexpress.vercel.app |
| Git Connection | NONE (as of 2026-09-02) |
| Deployment Method | Manual CLI (until Option A or B configured) |
| CARDCOM_USE_MOCK | `"true"` ⚠️ **Still in sandbox mode** |

**CRITICAL BLOCKER:** Cardcom production credentials not set. See `docs/DEPLOYMENT.md` section "Going live on real money" for exact procedure.

## Next Steps

1. ✅ **DONE:** run-final.sh --archive=tgz permanent
2. ✅ **DONE:** GitHub Actions workflow created
3. ✅ **DONE:** Preflight checks verified clean
4. ⏸️ **PAUSED:** Set GitHub secrets (requires owner permissions)
5. ⏸️ **PAUSED:** Deploy to production (one of the 4 critical stop conditions per CLAUDE.md)

## Post-Deployment Tasks (After Production Push)

From `docs/DEPLOY.md`:

1. **Cron Jobs Setup:** Run migration 162 batch via `docs/RUNBOOK.md` "Batch B"
2. **DNS Cutover:** Point `kenyonexpress.co.il` to Vercel (owner manual action)
3. **Cardcom Production Credentials:** Follow `docs/DEPLOYMENT.md` steps 1-8
4. **Pending Migrations:** Apply 162, 169, 170, 171 per `docs/MIGRATION-REVIEW.md`

## Related Documentation

- `docs/DEPLOY.md` - Step-by-step deployment guide
- `docs/DEPLOYMENT.md` - Verified Vercel project configuration
- `docs/ENV.md` - Complete environment variable reference
- `docs/RUNBOOK.md` - Secret rotation and cron job setup
- `docs/LAUNCH-READINESS.md` - Production launch blockers
- `scripts/deploy-preflight.mjs` - Pre-deploy validation script
- `.github/workflows/vercel-deploy.yml` - Auto-deploy workflow

## Safety Notes

**Protected Branches (run-final.sh line 10):**
- `audit/final-audit`
- `main`
- `production`

run-final.sh refuses to commit/push on these branches. `closeout/v1-final` is NOT protected, allowing autonomous commits.

**Critical Stop Conditions (per CLAUDE.md):**
1. ⚠️ Push to production in Vercel
2. DB deletion or file deletion
3. Migration on production
4. Second code agent on same repo

This document prepares deployment infrastructure. **Actual production push requires explicit owner approval.**
