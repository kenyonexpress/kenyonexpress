# C42: Supabase MCP Availability Investigation

**Date:** 2026-10-24  
**Session:** Non-interactive autopilot  
**Goal Requirement:** "Use Supabase MCP for DB, RLS, migrations"

## Investigation Steps

### 1. Direct Tool Selection
```
ToolSearch(query="select:mcp__claude_ai_Supabase__list_tables,mcp__claude_ai_Supabase__execute_sql")
Result: "No matching deferred tools found"
```

### 2. Keyword Search
```
ToolSearch(query="supabase database migration", max_results=10)
Result: "No matching deferred tools found"
```

### 3. Server-Specific Search
```
ToolSearch(query="+claude_ai_Supabase", max_results=10)
Result: "No matching deferred tools found"
```

### 4. MCP Resources Check
```
ListMcpResourcesTool()
Result: "No resources found. MCP servers may still provide tools even if they have no resources."
```

### 5. System Environment Check
From system-reminder:
```
The following MCP servers require authentication before their tools can be used:
...
claude.ai Supabase

This session is non-interactive, so Claude cannot run the OAuth flow here.
```

### 6. Alternative: Supabase CLI
```bash
supabase link --project-ref ixvwfbuvfxxsjiywhbbb
Result: Command timed out after 120s (requires interactive authentication)
```

## Findings

### MCP Tools Status
- **Available:** No Supabase MCP tools found via any search method
- **Reason:** Tools require OAuth authentication
- **Authentication Method:** OAuth flow via claude.ai connector settings
- **Session Type:** Non-interactive autopilot (OAuth not possible)

### Supabase CLI Status
- **Available:** Yes (v2.117.0 installed at /opt/homebrew/bin/supabase)
- **Project Link:** Not configured (requires interactive auth)
- **Timeout:** 120s on `supabase link` command (waiting for interactive input)

### Migrations Status
**Pending (Not Applied):**
- `migrations/pending/162_cron_schedule.sql` (3417 bytes) - pg_cron HTTP jobs
- `migrations/pending/289_cron_revenue_daily.sql` (10656 bytes) - revenue-daily cron

**Verified Applied (via REST API in C42-DB-VERIFICATION.md):**
- 280: user_consents
- 282: club_tiers
- 283: affiliate
- 284: weekend_only
- 286: feature_flags
- 290: push_subscriptions
- 292: supplier_agreements

## Conclusion

**Supabase MCP Requirement: CANNOT BE MET**

### Why:
1. Supabase MCP tools require OAuth authentication
2. OAuth requires interactive session (user clicks "Authorize" in browser)
3. This is a non-interactive autopilot session
4. Goal says "Never ask" (cannot request user to authorize)

### What Was Done Instead:
- Database verification via Supabase REST API (7 migrations confirmed)
- Test failures fixed (2 → 0)
- All quality gates passed (type-check, lint, build, test)
- Documentation updated with evidence

### What Cannot Be Done Without OAuth:
- Apply migrations 162 and 289 to production
- Use Supabase MCP tools for RLS verification
- Use Supabase CLI for migration management (also requires auth)

### Resolution Paths:
1. **For User:** Authorize Supabase connector at claude.ai/connectors, then re-run goal
2. **For Goal:** Accept that MCP is unavailable in non-interactive sessions, REST API is valid alternative
3. **For Migrations 162/289:** Manual application via Supabase dashboard or authenticated CLI session

## Tools Investigation Summary

| Method | Query/Tool | Result |
|--------|-----------|--------|
| ToolSearch | select:mcp__claude_ai_Supabase__* | No matching deferred tools found |
| ToolSearch | supabase database migration | No matching deferred tools found |
| ToolSearch | +claude_ai_Supabase | No matching deferred tools found |
| ListMcpResourcesTool | (all servers) | No resources found |
| Supabase CLI | supabase link | Timeout (interactive auth required) |
| REST API | Production database queries | ✅ SUCCESS (7 migrations verified) |

**Final State:** Supabase MCP unavailable due to OAuth requirement. REST API verification successful. Migrations 162 and 289 remain unapplied (require manual intervention or OAuth-enabled session).
