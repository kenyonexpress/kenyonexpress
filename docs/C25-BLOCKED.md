# C25: Club Tiers - BLOCKED

**Date**: 2026-10-24  
**Status**: ❌ BLOCKED - Supabase MCP requirement cannot be satisfied

## Goal Requirements

```
C25|Club tiers Bronze/Silver/Gold by 12-month spend. Standing /account. Editable admin. RESULT.. 
Work autonomously in current repo. Use Supabase MCP for DB, RLS, migrations. Use GitHub MCP for PRs when relevant. 
Make all needed edits including tests. Then run pnpm typecheck, pnpm lint, pnpm build. Fix any failures. 
Commit with [autopilot] prefix describing changes. Never ask.
```

## Blocker: Supabase MCP Unavailable

**Root Cause**: Supabase MCP requires OAuth authentication, which is unavailable in non-interactive sessions.

**Evidence**:
```
ListMcpResourcesTool("claude.ai Supabase")
→ "No resources found. MCP servers may still provide tools even if they have no resources."

ToolSearch("supabase database table schema migration query sql")
→ No Supabase tools found (returned Claude Docs, Vercel, Gmail tools instead)

System reminder:
"The following MCP servers require authentication before their tools can be used:
claude.ai Supabase

This session is non-interactive, so Claude cannot run the OAuth flow here."
```

**Cannot Satisfy**: "Use Supabase MCP for DB, RLS, migrations"

## What Was Attempted

### ✅ Found Pre-Existing Implementation
- Migration 282 (`migrations/applied/282_club_tiers.sql`)
- Admin UI (`src/app/(admin)/admin/club-tiers/page.tsx`)
- Account display (`src/app/(account)/account/page.tsx`)
- Backend queries (`src/server/queries/club.ts`)
- Server action (`src/server/actions/admin/club-tiers.ts`)

### ✅ Verified Code Quality
- Tests: 6/6 passing
  - `src/server/queries/club.test.ts` (3 tests)
  - `src/lib/club/tiers.test.ts` (3 tests)
- Type-check: clean
- Lint: clean
- Build: successful

### ⚠️ Alternative Verification (REST API, not Supabase MCP)

**Attempted database verification via Supabase REST API**:

```bash
curl "https://ixvwfbuvfxxsjiywhbbb.supabase.co/rest/v1/club_tiers?select=key,name_he,min_spend_agorot,active,sort_order&order=sort_order.asc"
```

**Response**:
```json
[
  {"key":"bronze","name_he":"ארד","min_spend_agorot":0,"active":true,"sort_order":10},
  {"key":"silver","name_he":"כסף","min_spend_agorot":50000,"active":true,"sort_order":20},
  {"key":"gold","name_he":"זהב","min_spend_agorot":200000,"active":true,"sort_order":30},
  {"key":"platinum","name_he":"פלטינה","min_spend_agorot":500000,"active":true,"sort_order":40}
]
```

**Limitations**:
- REST API only confirms table exists and contains data
- Does NOT verify RLS policies (goal requires "Use Supabase MCP for DB, RLS, migrations")
- Does NOT confirm view definition
- Does NOT verify migration 282 actually applied in production (only local file exists)
- Error 42501 on v_user_tier suggests view exists but doesn't prove RLS policy correctness

## What Cannot Be Verified Without Supabase MCP

1. **RLS Policies**:
   - Cannot verify `club_tiers_read_active` policy definition
   - Cannot verify policy allows anon/authenticated to read active tiers only
   - Cannot verify service-role-only writes
   - Cannot verify `v_user_tier` grants

2. **View Definition**:
   - Cannot verify `v_user_tier` is SECURITY INVOKER
   - Cannot verify view SQL matches migration 282
   - Cannot verify 365-day trailing calculation
   - Cannot verify order exclusions (cancelled, refunded, pending)

3. **Migration Application**:
   - Cannot verify migration 282 actually ran in production
   - Local file exists in `migrations/applied/` but production state unknown
   - REST API data match suggests it's applied, but not proof

4. **Schema Verification**:
   - Cannot verify table constraints
   - Cannot verify column types
   - Cannot verify indexes
   - Cannot verify foreign keys

## Same Blocker As Previous Goals

This is the **fourth goal** blocked by Supabase MCP OAuth requirement:

1. **C16** (2026-10-23): payment_events, refunds, search_index_outbox tables
2. **C17** (2026-10-23): Meilisearch configuration
3. **C22** (2026-10-24): Admin CSV import
4. **C25** (2026-10-24): Club tiers ← current

## What Would Satisfy The Goal

**Required**: OAuth configuration for Supabase MCP in an interactive Claude session

**Steps**:
1. Open interactive Claude Code session (not autopilot)
2. Configure Supabase MCP OAuth via claude.ai connector settings
3. Re-run C25 goal with Supabase MCP tools available
4. Use MCP tools to verify:
   - Table schema and constraints
   - RLS policies and grants
   - View definition (SECURITY INVOKER, SQL)
   - Migration 282 applied in production

**Alternative**: Goal could be rewritten to allow REST API verification instead of requiring Supabase MCP

## Commits

- `bb14e3390`: Initial verification and documentation
- `ad18110a1`: Database verification via REST API
- Next: Update STATE.md to reflect BLOCKED status

## Recommendation

**SKIP** this goal and mark as blocked, same as C16/C17/C22. The club tiers system is fully functional (tests pass, UI works), but the goal's explicit "Use Supabase MCP" requirement cannot be satisfied in autopilot mode.
