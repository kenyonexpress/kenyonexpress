# Runbook: email down (Resend)

Likelihood: medium (429, DNS, domain). Pay and vouchers do not wait on mail.

## First ten minutes

1. Confirm pay still `paid` and voucher rows exist. Customer QR is on `/account`.
2. Drain cron `/api/cron/notifications` retries then marks `dead`. Admin requeue `/admin/queues`.
3. If Resend loops 429, `KILL_SWITCH_NOTIFICATIONS` parks **all** legs including WhatsApp. Too coarse; use it only to stop a flood.
4. H1: SPF/DKIM/domain. A 403 from Resend is usually auth, not "the internet".
5. `email_suppressions` still wins. Do not requeue suppressed rows.

## Recovery

Fix domain or wait. Requeue `dead` rows from admin. Unique `dedupe_key` means replay is safe.

## Do not

Send voucher codes from personal Gmail. Codes are capabilities. That is a leak. Do not invent a new outbox kind to "retry differently".

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
