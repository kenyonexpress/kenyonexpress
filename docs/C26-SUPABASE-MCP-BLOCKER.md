# C26: Supabase MCP Blocker

**Date**: 2026-10-24  
**Goal**: "C26|Affiliate /affiliate + per-campaign commission + wallet payout + 30d cookie. Tables affiliate_campaigns + clicks + payouts. RESULT.. Work autonomously in current repo. Use Supabase MCP for DB, RLS, migrations."

## Blocker

**Cannot satisfy**: "Use Supabase MCP for DB, RLS, migrations"

### Evidence

1. **ToolSearch for Supabase tools**: No matching deferred tools found
   ```
   ToolSearch("select:mcp__claude_ai_Supabase__query,mcp__claude_ai_Supabase__list_tables,mcp__claude_ai_Supabase__get_table_schema")
   → "No matching deferred tools found"
   ```

2. **ToolSearch with keywords**: Returned only Vercel tools, no Supabase
   ```
   ToolSearch("supabase database table schema migration")
   → 9 Vercel tools (schema-related), 0 Supabase tools
   ```

3. **ListMcpResourcesTool**: No resources available
   ```
   ListMcpResourcesTool(server="claude.ai Supabase")
   → "No resources found. MCP servers may still provide tools even if they have no resources."
   ```

4. **System Reminder** (from session start):
   ```
   "The following MCP servers require authentication before their tools can be used:
   ...
   claude.ai Supabase
   ...
   
   This session is non-interactive, so Claude cannot run the OAuth flow here. If the user's 
   request depends on one of these servers (even if they didn't name it explicitly), or they 
   ask about it, tell them that it needs to be authorized — for claude.ai connectors, via 
   their claude.ai connector settings; for other servers, via `claude mcp` or /mcp in an 
   interactive session — and that the capability is unavailable until they do."
   ```

### Root Cause

**Supabase MCP requires OAuth authentication** which is only available in interactive sessions. This autopilot session is non-interactive, so the OAuth flow cannot be completed.

### What Was Attempted

- ✅ ToolSearch for explicit Supabase tool names (query, list_tables, get_table_schema)
- ✅ ToolSearch with relevant keywords (supabase, database, table, schema, migration)
- ✅ ListMcpResourcesTool to check for available resources
- ❌ **All attempts returned no Supabase tools/resources**

### Impact

While the affiliate system exists and is fully functional (verified via file reads, tests, build):
- Cannot verify database schema via Supabase MCP
- Cannot check RLS policies via Supabase MCP
- Cannot verify migration application status via Supabase MCP
- Cannot query production data via Supabase MCP

The goal explicitly requires "Use Supabase MCP for DB, RLS, migrations" - this requirement **cannot be satisfied** in a non-interactive session.

### What Works (Without Supabase MCP)

All functionality is implemented and working:
- ✅ Migration 283 exists in `migrations/applied/`
- ✅ 5 tables defined in SQL (campaigns, links, clicks, attributions, payouts)
- ✅ RLS policies defined in migration file
- ✅ Frontend routes exist and render
- ✅ Backend logic exists and tests pass (7/7)
- ✅ Build succeeds with affiliate routes

But verification was via **file reading**, not Supabase MCP as required.

### Resolution Options

1. **User authorizes Supabase MCP** via claude.ai connector settings in an interactive session
2. **Goal is rewritten** to remove the Supabase MCP requirement
3. **Goal is accepted** with the understanding that Supabase MCP is unavailable in autopilot

### Similar Blockers

Same blocker affected:
- **C25**: Club tiers (BLOCKED on Supabase MCP)
- **C22**: CSV import (PARTIAL, Supabase MCP unavailable)
- **C17**: Meilisearch (BLOCKED on external provisioning)
- **C16**: Not listed but likely same blocker

All autopilot goals requiring Supabase MCP hit this OAuth blocker.

### Recommendation

**Mark C26 as BLOCKED** (not COMPLETE) because the goal's explicit requirement "Use Supabase MCP for DB, RLS, migrations" cannot be satisfied, even though the affiliate system exists and works.

Alternatively, if the goal's intent was to verify the affiliate system exists (which it does), then:
- Change status to **PARTIAL** (system exists, but Supabase MCP verification skipped)
- Or **accept the blocker** and mark DONE with a caveat

## Conclusion

**Supabase MCP authentication unavailable in non-interactive autopilot sessions.**

Cannot satisfy: "Use Supabase MCP for DB, RLS, migrations"

The affiliate system is complete and working, but the verification method required by the goal is blocked by OAuth requirements.
