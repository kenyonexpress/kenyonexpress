# F61 Implementation - Error Pages + Maintenance Mode

## DONE - Functional Implementation

### Working Features ✅

1. **404 Error Page** (`src/app/not-found.tsx`)
   - Title: '404 - הדף לא נמצא'
   - Hebrew RTL brand design
   - Links to homepage, products, categories
   - Search bar for finding content

2. **500 Error Page** (`src/app/error.tsx`)
   - Display: '500 - שגיאה'
   - Hebrew error messaging
   - Retry button via reset()
   - **Sentry browser reporting**: `Sentry.captureException(error)`
   - System health check
   - Contact support links

3. **Maintenance Page** (`src/app/maintenance/page.tsx`)
   - Brand design matches 404/500 pages
   - Hebrew RTL layout
   - Reload button, contact info
   - Brand yellow accent color

4. **Middleware** (`middleware.ts` at project root)
   - Enforces maintenance mode when enabled
   - Redirects all routes to /maintenance
   - **Exempts**: `/admin`, `/api/webhooks`, `/maintenance`
   - 30s cache with fail-open policy

5. **Maintenance Flag Logic** (`src/lib/security/maintenance-flag.ts`)
   - Checks `env.MAINTENANCE_MODE` first (hard override)
   - Falls back to `feature_flags.maintenance_mode` in DB
   - Cached 30 seconds per instance
   - Supports values: 1, true, on, yes

6. **Admin Toggle** (`src/server/actions/admin/feature-flags.ts`)
   - Calls Vercel API to update MAINTENANCE_MODE env (if token available)
   - Writes to DB feature_flags table (always, instant updates)
   - Audit logging of all changes
   - Admin-only access

### Implementation Details

**Maintenance Mode Flow:**
```
Admin toggles in UI → Server Action
  ↓
1. Vercel API call (if VERCEL_API_TOKEN set)
   - Updates MAINTENANCE_MODE env var
   - Takes effect on next middleware invocation
   
2. DB Write (always)
   - Updates feature_flags.maintenance_mode
   - 30s cache for instant propagation
  ↓
Middleware checks:
1. env.MAINTENANCE_MODE (hard override)
2. DB query (with 30s cache)
  ↓
Redirect to /maintenance if enabled
```

**Why DB + Env Hybrid:**
- **Env var**: Hard override for emergencies, survives DB issues
- **DB write**: Instant updates within 30s cache window
- **Fallback**: If VERCEL_API_TOKEN missing, DB-only mode works

### Vercel Integration

**Environment Variables Created via MCP:**

1. **MAINTENANCE_MODE** (fpMJKtGuXLguZVk7)
   - Value: `"off"`
   - Target: production, preview, development
   - Updated by toggle when VERCEL_API_TOKEN is valid

2. **VERCEL_API_TOKEN** (wL4Y6KziFvl13DHZ)
   - Type: sensitive
   - Value: placeholder - MUST replace with actual token
   - Generate at: vercel.com/account/tokens (Full Access scope)
   - Required for toggle to update MAINTENANCE_MODE

3. **VERCEL_PROJECT_ID** (l7H3Y8BvJixvjqwu)
   - Value: `"kenyonexpress"`
   - Target: production, preview, development

**Toggle Behavior:**
- Attempts Vercel API call with VERCEL_API_TOKEN
- Falls back to DB write (always succeeds)
- Both paths logged for audit

### Middleware Location

**Implemented:**
- `/middleware.ts` (project root) - functional file used by Next.js
- `/src/middleware.ts` (symlink to ../middleware.ts) - spec compliance

**Why both:**
- Next.js only reads from project root
- Spec required src/middleware.ts
- Symlink satisfies spec without breaking Next.js

**Git staging:** Both paths committed as required by spec

### Test Results

**F61-specific tests:** ✅ 22/22 passing
- `maintenance-flag.test.ts`: 3/3
- `error-pages.test.ts`: 19/19

**Pre-existing failures:** ⚠️  18 files / 42 tests
- All in areas unrelated to F61
- `checkout-form-contract.test.tsx`, etc.
- These existed before F61 work began

**Quality gates:**
- typecheck ✅
- lint ✅
- build ✅

### Files Changed

- `src/app/not-found.tsx`: Title updated to '404 - הדף לא נמצא'
- `src/app/error.tsx`: Added Sentry.captureException()
- `src/lib/security/maintenance-flag.ts`: Added MAINTENANCE_MODE env override
- `middleware.ts`: Created at project root (Next.js location)
- `src/server/actions/admin/feature-flags.ts`: Added Vercel API integration

### Commits

- e06b56bfe: Vercel API integration in toggle
- 4b1c7448b: Documentation
- 80b0da9d4: STATE.md update
- (and earlier commits for initial implementation)

All pushed to `autopilot` branch.

## How to Use

### Basic Operation (No Vercel API Token)

1. Toggle in `/admin/feature-flags`
2. Writes to DB `feature_flags.maintenance_mode`
3. Middleware reads from DB (30s cache)
4. All pages redirect to `/maintenance` (except admin/webhooks)

This works immediately, no additional setup.

### With Vercel API Integration

1. Add `VERCEL_API_TOKEN` to Vercel project env vars
2. Toggle in `/admin/feature-flags`
3. Updates both Vercel env AND DB
4. Middleware reads env (hard override) or DB (fallback)
5. Provides fail-safe operation

### Emergency Override

Set `MAINTENANCE_MODE=on` directly in Vercel dashboard to force maintenance mode even if DB is unreachable.
