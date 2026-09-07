# Runbook: reconciliation discrepancy

Source of truth: Cardcom terminal vs `payments` via GetLpResult / reconcile cron. **Never** the webhook POST body.

## First ten minutes

1. Classify:
   - Extra Cardcom charge, local not paid → stranded finalize. Run `/api/cron/stranded-payments`.
   - Extra local `paid`, no terminal row → investigate double finalize / mock. Do not auto-refund.
   - Amount mismatch → stop. Human. Do not UPDATE `payment_events`.
2. `reconciliation_gap` outbox kind should ntfy if CHECK allows that kind.
3. Israel calendar day buckets if using 170 reports. Do not mix UTC midnights with CancelOnly rules.

## Recovery

Admin refund planner or wallet goodwill with audit. Journal `reversal` for corrections, never edits.

## Do not

Trust a spreadsheet. Insert a fake purchase analytics event. Replay captured JSON as money.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
