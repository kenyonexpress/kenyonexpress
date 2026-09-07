# Runbook: reconciliation discrepancy

1. Source of truth: Cardcom terminal vs `payments` via GetLpResult / reconcile cron, **not** webhook POST.
2. `reconciliation_gap` outbox kind should ntfy (if CHECK allows).
3. Classify: extra Cardcom charge (stranded finalize), extra local paid (investigate double finalize), amount mismatch (do not auto-refund).
4. Manual: admin refund planner or wallet goodwill with audit. Never UPDATE `payment_events`.
5. Israel day buckets if using 170 reports.
