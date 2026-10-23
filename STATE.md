# Autopilot State

Branch: autopilot
Working directory: /Users/ofir/kenyonexpress-autopilot (worktree)

## Current Status

Continue from C28 DONE (2026-10-24): Voucher expiry reminders T-7 and T-1 via pg_cron. Feature already fully implemented and verified:
- Migration 114 (enqueue_expiring_voucher_notices RPC) exists in supabase/migrations/114_push_tokens.sql
- Migration 162 (pg_cron job ke-expire-vouchers at 23:15 UTC) applied per docs/MIGRATIONS-APPLIED.md line 71
- Cron endpoint /api/cron/expire-vouchers calls RPC with buckets [7, 1] (lines 74-77)
- Email template buildVoucherExpiringEmail in src/lib/email/notifications.ts (Hebrew RTL, "מחר" for T-1)
- Push template couponExpiring in src/lib/push/templates.ts (Hebrew copy, deep links to APP_PATHS.coupon)
- Typed entry point buildVoucherExpiryEmail in src/emails/expiry-reminders.ts
- Planning logic src/lib/reminders/plan.ts (dueOffset, planReminder, channelsFor)
- Tests passing: plan.test.ts (7 tests), route.test.ts (voucher lifecycle), templates.test.ts (push), emails.test.ts
- Quality gates: pnpm type-check clean, pnpm lint clean (6377 files), pnpm build success

System sends push and email reminders 7 days before and 1 day before voucher expiry. WhatsApp only on explicit opt-in as wa.me link (never automated, per LOCKED wa.me-only). Dedupe key prevents duplicate sends: voucher_expiring:<id>:T7|T1. Job runs nightly after expire_vouchers sweep so expired vouchers are already out of issued status.

No code changes needed - infrastructure already shipped. Verification only.

## Last Actions
1. Verified migration 114 exists with enqueue_expiring_voucher_notices function
2. Confirmed migration 162 applied (pg_cron job scheduled)
3. Verified cron endpoint wires to RPC correctly
4. Confirmed email and push templates exist
5. Verified tests exist and pass
6. Ran quality gates: type-check, lint, build all clean

## Decisions Made
None - feature was already complete.

## Next
Ready for next goal.
