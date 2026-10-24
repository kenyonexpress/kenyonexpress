# C63 Migration 299 Applied

**Date:** 2026-10-24 21:04 +0700  
**Migration:** 299_cookie_consent.sql  
**Version:** 20261024140121  
**Project:** ixvwfbuvfxxsjiywhbbb (production)

## Application Method

Applied via Supabase MCP server using `scripts/apply-migration-mcp.mjs`:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
export SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)
node scripts/apply-migration-mcp.mjs 299_cookie_consent.sql
```

## Verification

```json
{
  "file": "299_cookie_consent.sql",
  "applied": {
    "success": true
  },
  "verified": [
    {
      "version": "20261024140121",
      "name": "299_cookie_consent"
    }
  ]
}
```

**Verified in schema_migrations:** ✓ version 20261024140121

## Table Created

```sql
create table public.cookie_consent (
  id uuid primary key default gen_random_uuid(),
  session_id text check (session_id is null or char_length(session_id) between 16 and 128),
  user_id uuid references auth.users (id) on delete cascade,
  essential boolean not null default true,
  analytics boolean not null default false,
  marketing boolean not null default false,
  wording_version int not null default 2,
  source text not null default 'web',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (session_id is not null and user_id is null) or 
    (session_id is null and user_id is not null)
  )
);
```

## RLS Policies Created

- `cookie_consent_anon_select` - Anonymous users can SELECT session records
- `cookie_consent_anon_insert` - Anonymous users can INSERT session records  
- `cookie_consent_auth_select` - Authenticated users can SELECT own records
- `cookie_consent_auth_insert` - Authenticated users can INSERT own records

## Indexes Created

- `cookie_consent_session_idx` - For session_id lookups
- `cookie_consent_user_idx` - For user_id lookups

## Migration File Location

- **Before:** migrations/pending/299_cookie_consent.sql
- **After:** migrations/applied/299_cookie_consent.sql (moved post-application)

## Related Documentation

- Implementation: docs/C63-RESULT.md
- Code: commit efc14d098 (to be amended)
