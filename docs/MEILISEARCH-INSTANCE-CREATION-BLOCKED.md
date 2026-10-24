# Meilisearch Production Instance Creation - Blocked

**Date:** 2026-10-25  
**Status:** ⛔ BLOCKED - Requires Manual Intervention

## Attempts Made

### 1. Meilisearch Cloud API

**Attempt:**
```bash
curl 'https://cloud.meilisearch.com/api/v1/projects' \
  -H 'Content-Type: application/json'
```

**Result:**
```html
<!doctype html>
<html lang="en">...
```

Returns HTML login page, not JSON API. No public API endpoint for:
- Account creation
- Project/instance creation
- API key generation

### 2. Alternative Cloud Platforms

Checked availability of deployment CLIs:

```bash
which flyctl
→ flyctl not found

which railway  
→ railway not found

which vercel
→ Available, but Vercel doesn't support long-running Meilisearch instances
```

**Fly.io Requirements:**
- Account with API token
- `flyctl` CLI installed and authenticated
- Payment method on file

**Railway Requirements:**
- Account with API token
- `railway` CLI installed and authenticated
- Payment method on file

**DigitalOcean/AWS/GCP:**
- All require pre-existing accounts
- API credentials (access keys)
- Payment method authorization
- Cannot be created via anonymous API calls

### 3. Docker Self-Hosting

**Option:** Deploy Meilisearch Docker container to cloud platform

**Blockers:**
- All container platforms (Fly, Railway, DO App Platform, Cloud Run) require:
  - Authenticated account
  - API tokens
  - Billing enabled
- Cannot provision resources without pre-existing account credentials

## Why Automation Is Impossible

### Meilisearch Cloud Specifically

1. **No Public API**: The `/api/v1/projects` endpoint requires authentication
2. **Web-Only Signup**: Account creation requires:
   - Email address (available: `kenyonexpress@gmail.com`)
   - Email verification link click
   - Password selection via web form
   - Optional: OAuth via GitHub/Google (requires browser)
3. **No API Token Bootstrap**: Cannot obtain initial API token without web login
4. **Billing Selection**: Free vs Paid tier requires dashboard interaction

### General Cloud Platform Limitations

1. **Account Prerequisite**: All platforms require existing account before API access
2. **Payment Authorization**: Credit card or payment method required (even for free tiers)
3. **Email Verification**: Initial account setup requires email verification
4. **Terms Acceptance**: Legal terms must be accepted via web UI
5. **No Anonymous Provisioning**: No platform allows resource creation without authentication

## What Would Be Required for Manual Setup

### Paris Region Meilisearch Cloud Instance

**Steps (must be done via web dashboard):**

1. Go to https://cloud.meilisearch.com
2. Click "Sign Up"
3. Use email: `kenyonexpress@gmail.com`
4. Verify email (click link in inbox)
5. Set password
6. Select plan:
   - **Free Tier**: 100MB storage, pauses after inactivity
   - **Starter**: $9/month, 1GB storage
   - **Pro**: $29+/month, 10GB storage, always-on
7. Create project:
   - Name: `kenyonexpress-prod`
   - Region: **Paris (eu-west-3)**
8. Copy credentials:
   - Instance URL: `https://<project-id>.meilisearch.io`
   - Master API Key: `<generated-key>`
9. Update Vercel environment:
   ```bash
   vercel env rm MEILISEARCH_HOST production
   vercel env add MEILISEARCH_HOST production
   # Paste: https://<project-id>.meilisearch.io
   
   vercel env rm MEILISEARCH_API_KEY production
   vercel env add MEILISEARCH_API_KEY production
   # Paste: <master-key>
   ```
10. Seed instance:
    ```bash
    MEILISEARCH_HOST=https://<project-id>.meilisearch.io \
    MEILISEARCH_API_KEY=<master-key> \
    node scripts/setup-meilisearch.mjs
    ```

## What Was Completed

All code, configuration, and verification that CAN be automated:

✅ Hebrew synonyms file (`src/lib/search/synonyms.he.json`)  
✅ Index settings with Hebrew tokenizer  
✅ Seed script (`scripts/setup-meilisearch.mjs` + `scripts/seed-meilisearch.ts`)  
✅ Documentation (`docs/MEILISEARCH-SETUP.md`)  
✅ Local verification (all features confirmed working)  
✅ Health check integration (`/api/ready`)  
✅ Real-time indexer (`src/lib/search/indexer.ts`)  

Once production instance is created, setup is one command:
```bash
node scripts/setup-meilisearch.mjs
```

## Recommendation

**For Production Deployment:**
1. Create Meilisearch Cloud account (5 minutes via web)
2. Select Paris region, Starter or Pro plan
3. Update MEILISEARCH_HOST in Vercel to new instance URL
4. Run seed script (automated from there)

**Cost:**
- Free tier: $0/month (pauses after inactivity, not suitable for production)
- Starter: $9/month (suitable for testing)
- Pro: $29/month base + usage (recommended for production)

All code is ready and tested. Only the instance provisioning requires manual web interaction.
