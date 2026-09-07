# Runbook: customer data request (SAR / delete)

1. Delete: `deleteAccount` + phrase `מחק את החשבון שלי`. Prefer `fn_anonymize_user` (150); fallback TS loop if `PGRST202`.
2. Soft-delete auth. Hard-delete `auth.users` orphans money FKs. Forbidden.
3. Keep orders, payments, invoices, audit (books). Erase A-class PII per `DELETION_EFFECTS`.
4. Gift columns: conservative hash (Q24) if 150 does not.
5. Export: staff via admin, not a self-serve dump of other people.
6. 157: IPs in audit after 365 days NULL. Redemption IPs not in 157.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
