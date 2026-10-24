# C51: Supabase 2FA Recovery Request

**Date:** 2026-10-24  
**Status:** BLOCKED - Awaiting Supabase Support Response  
**Priority:** CRITICAL - Blocks database migrations and MCP operations

## Summary

The Supabase project (ID: `ixvwfbuvfxxsjiywhbbb`) requires 2FA authentication but access is currently blocked at the 2FA screen. This blocks all database operations including:

- Migration application (162, 289, and future migrations)
- Database verification via MCP
- Production database queries
- Database performance audits
- RLS policy verification

## Project Details

- **Project URL:** https://ixvwfbuvfxxsjiywhbbb.supabase.co
- **Organization:** Kenyon Express
- **Project Name:** kenyonexpress (production)
- **Account Email:** kenyonexpress@gmail.com

## Current Impact

### Critical Blockers (Require Database Access)
1. **M13 Money Constraints** - Cannot verify UNIQUE constraints on payment tables (double-charge protection)
2. **M14 Role Separation** - Cannot verify RLS policy separation
3. **M05 DB Performance** - Cannot run performance audits
4. **Migration 162+289** - Cannot apply pg_cron HTTP jobs

### Production Database URL
The production database connection string is needed for:
- Direct SQL queries via psql
- Migration application via Supabase CLI
- Database backups and verification

## Recovery Steps

### 1. Email Supabase Support (IMMEDIATE)

**To:** support@supabase.com  
**Subject:** 2FA Recovery Request - Project ixvwfbuvfxxsjiywhbbb  

**Email Body:**

```
Hello Supabase Support Team,

I need help recovering access to my Supabase project due to 2FA issues.

Project Details:
- Project ID: ixvwfbuvfxxsjiywhbbb
- Project URL: https://ixvwfbuvfxxsjiywhbbb.supabase.co
- Organization: Kenyon Express
- Account Email: kenyonexpress@gmail.com

Issue:
I am unable to access the Supabase dashboard due to 2FA authentication screen. I need to regain access to manage migrations and database operations for our production e-commerce platform.

Verification:
I can provide verification via:
- Account email: kenyonexpress@gmail.com
- Project service role key (available)
- GitHub repository: kenyonexpress/kenyonexpress

Urgency:
This is blocking critical production database migrations including payment constraint verification and cron job setup.

Please advise on the 2FA recovery process or reset the 2FA for this account.

Thank you,
Ofir
Kenyon Express
kenyonexpress@gmail.com
```

### 2. Alternative: Supabase Support Form

Visit: https://supabase.com/support

Fill in:
- **Email:** kenyonexpress@gmail.com
- **Subject:** 2FA Recovery Request - Project ixvwfbuvfxxsjiywhbbb
- **Description:** Use email body above
- **Priority:** High
- **Category:** Account/Authentication

### 3. Temporary Workarounds

While waiting for support response:

#### A. Use Management API (Currently Working)
```bash
# Get database URL via Management API
supabase projects get ixvwfbuvfxxsjiywhbbb --output json

# Run queries via Management API
curl -X POST "https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query" \
  -H "Authorization: Bearer $(supabase auth token)" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT version();"}'
```

#### B. Use Service Role Key (Limited)
The service role key in `.env.local` can be used for:
- REST API calls (limited schema access)
- realtime subscriptions
- client-side Supabase operations

**Cannot use for:**
- Dashboard access
- Migration application
- Database settings
- Team management

## Resolution Timeline

**Expected Response:** 24-48 hours (Supabase support SLA)  
**If No Response by:** 2026-10-26 00:00 UTC → Escalate via:
1. Supabase Community Discord: https://discord.supabase.com
2. GitHub Issues: https://github.com/supabase/supabase/issues
3. Twitter: @supabase

## Evidence of Issue

### System Reminders Show OAuth Block
```
The following MCP servers require authentication before their tools can be used:
...
claude.ai Supabase

This session is non-interactive, so Claude cannot run the OAuth flow here.
```

### Recent Blocked Operations (from STATE.md)
- Line 11: "BLOCKED F31 pg_cron apply: claude.ai Supabase MCP still needs OAuth"
- Line 20-22: "280/282/283/284 unverified; Supabase MCP needs OAuth"
- Line 234: "BLOCKED C49-M13: Supabase MCP requires OAuth (unavailable in non-interactive session)"

## Post-Recovery Actions

Once 2FA access is restored:

1. **Configure MCP OAuth** in claude.ai connector settings
2. **Apply pending migrations:** 162, 289
3. **Verify money constraints:** Run audit-money-constraints.mjs
4. **Test database backups:** Verify PITR settings
5. **Document 2FA backup codes:** Store in secure location
6. **Consider 2FA alternatives:** Authenticator app backup, recovery codes

## References

- **Supabase Support:** https://supabase.com/support
- **Supabase Docs - 2FA:** https://supabase.com/docs/guides/platform/2fa
- **Migration Blocker Details:** docs/C47-SUPABASE-MCP-BLOCKER.md
- **Database Architecture:** docs/BACKUP-RESTORE-DATABASE.md

---

**Status Updates:**

- 2026-10-24: Recovery request prepared, awaiting user to send email
- Waiting for: User to email support@supabase.com with recovery request
