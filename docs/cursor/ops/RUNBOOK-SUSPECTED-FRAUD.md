# Runbook: suspected fraud

1. Freeze: `CHECKOUT_ENABLED` if ongoing card testing. Do not disable scan for everyone unless codes leak.
2. Referral: SQL already refuses self/fingerprint; do not "fix" with a wallet grant.
3. Master ₪1 SKU: confirm guard + 172 stock.
4. Redeem spike: rate_limited outcomes; check `voucher_redemptions` IPs (not aged by 157).
5. Leaked service_role: rotate immediately (`RUNBOOK-SECRET-ROTATION.md`), denylist hash.
6. Support must not refund without admin. Audit actor must be the human.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
