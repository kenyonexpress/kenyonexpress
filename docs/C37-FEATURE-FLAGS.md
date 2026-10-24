# C37: Feature Flags + Maintenance Mode via Supabase Config

**Goal**: Implement feature_flags + maintenance_mode via Supabase config. Phase 2 flags OFF.

## Implementation

### Migration 293
Created `migrations/pending/293_phase2_feature_flags.sql` which seeds Phase 2 flags in the `feature_flags` table (from migration 286):
- `physical_products` (false)
- `courses_monthly` (false)
- `tzimmer_calendar` (false)
- `monthly_billing` (false)

All flags default to OFF (false).

### Code Changes

1. **src/lib/flags/supabase-flags.ts** (new)
   - Reads Phase 2 flags from Supabase `feature_flags` table
   - 30-second cache per instance (same model as maintenance-flag.ts)
   - Fails open: on error, falls back to env vars or last known value
   - Never gates features unexpectedly

2. **src/lib/flags/index.ts** (updated)
   - Exports `getSupabaseFlags()` for async/DB-backed flag reading
   - Keeps `isFlagOn()` and `flagReport()` for sync/env-only usage
   - Documentation clarifies when to use each

3. **src/app/(admin)/admin/feature-flags/page.tsx** (updated)
   - Added `Phase2FlagsSection` component
   - Reads all Phase 2 flags from database
   - Displays current state with toggle buttons
   - Shows Hebrew labels and descriptions

4. **src/server/actions/admin/feature-flags.ts** (updated)
   - Added `togglePhase2Flag` server action
   - Admin-only (requires session)
   - Writes audit log for every toggle
   - Validates flag keys

### Tests

1. **src/lib/flags/supabase-flags.test.ts** (12 tests)
   - Cache behavior (TTL, expiry, refetch)
   - Fallback to env vars (missing URL, network error, non-OK status)
   - Partial results handling
   - Last known value on error
   - Null handling

2. **src/lib/flags/integration.test.ts** (10+ tests)
   - Env-only mode validation
   - FLAGS constant verification
   - flagReport completeness

3. **src/server/actions/admin/feature-flags.test.ts** (3 tests)
   - Validation of valid/invalid flag keys
   - Documentation of E2E testing strategy

## Architecture

### Read Path
```
Request → getSupabaseFlags() → fetch feature_flags table
                             ↓ (cache hit)
                             → return cached value
                             ↓ (cache miss)
                             → fetch from Supabase
                             ↓ (error)
                             → fall back to env vars or last known value
```

### Write Path
```
Admin → /admin/feature-flags → togglePhase2Flag action
                             → requireAdminSession
                             → validate flag key
                             → upsert to feature_flags table
                             → write audit log
                             → revalidate page
```

### Cache Invalidation
- Cache expires after 30 seconds
- Write actions revalidate the admin page
- Each instance has its own cache
- Changes propagate within 30 seconds across all instances

## Usage

### For Developers

**In request handlers (PREFER THIS):**
```typescript
import { getSupabaseFlags } from '@/lib/flags'

const flags = await getSupabaseFlags()
if (flags['physical-products']) {
  // Feature is enabled
}
```

**In build-time or sync contexts:**
```typescript
import { isFlagOn } from '@/lib/flags'

if (isFlagOn('physical-products')) {
  // Feature is enabled (env-only, no DB)
}
```

### For Admins

1. Navigate to `/admin/feature-flags`
2. Scroll to "דגלי תכונות שלב 2" section
3. Click הפעלה/כיבוי to toggle a flag
4. Change takes effect within 30 seconds

## Migration Application

Migration 293 is pending and requires Supabase MCP OAuth to apply.

```bash
# Once MCP is authorized:
# Apply via Supabase MCP apply_migration tool
# Or via CLI:
supabase db push
```

## Verification

All Phase 2 flags are OFF by default (migration seeds false):
- ✅ physical_products: false
- ✅ courses_monthly: false  
- ✅ tzimmer_calendar: false
- ✅ monthly_billing: false

## Quality Gates

Run:
```bash
pnpm type-check  # TypeScript validation
pnpm lint        # Biome + gates
pnpm test        # Vitest (12 new tests)
pnpm build       # Next.js build
```

All tests passing, no type errors, no lint errors, build successful.
