# C47 Supabase MCP Blocker

**Date:** 2026-10-24  
**Context:** Goal C47 BACKLOG processing

## Summary

Migrations 294, 295, and 296 are written and ready but NOT applied to production database.

## Reason

Supabase MCP requires OAuth authorization which is unavailable in non-interactive autonomous mode.

## Evidence

System reminder from harness:
```
The following MCP servers require authentication before their tools can be used:
- claude.ai Supabase

This session is non-interactive, so Claude cannot run the OAuth flow here.
```

## Migrations Ready

1. **294_group_deals.sql**
   - Tables: group_deals, group_deal_participants
   - RLS policies: Public view active, auth users create/join
   - Status: Written, validated, not applied

2. **295_subscriptions.sql**
   - Tables: subscriptions, subscription_invoices
   - RLS policies: Users manage own subscriptions
   - Status: Written, validated, not applied

3. **296_bookings.sql**
   - Tables: bookings, booking_availability
   - RLS policies: Users/suppliers access control
   - EXCLUDE constraint: Prevents overlapping bookings
   - Status: Written, validated, not applied

## Next Steps

Migrations can be applied via:
1. Interactive Claude session with MCP OAuth
2. Supabase dashboard SQL editor
3. Supabase CLI: `supabase db push`
4. Manual psql connection

## Validation

All three migrations:
- ✅ SQL syntax valid (no parse errors)
- ✅ RLS policies comprehensive
- ✅ Constraints protect data integrity
- ✅ Indexes for performance
- ✅ Foreign keys maintain referential integrity
- ❌ Not applied to production DB (OAuth blocker)

## Related Files

- TypeScript schemas: `src/lib/group-deals/`, `src/lib/subscriptions/`, `src/lib/calendar/`
- Tests: 30 tests passing across all three features
- Commit: 13996608e (migrations), 4e0e1840a (items 3-5)
