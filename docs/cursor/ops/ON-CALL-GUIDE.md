# On-call guide

**What wakes a human (ntfy + Sentry money):** charged not finalized; voucher issue failed after pay; refund provider error after decide; redeem RPC failed after valid QR.

**Sentry only:** catalogue 500.

**Not a page:** single 429, empty search, admin webhooks tab empty (zero-policy), guest empty cart after cookie rename (dev bug).

## Thresholds

- Cron health fail twice in a row (10 min).
- Stranded payment count > 0.
- Reconcile critical rows > 0.
- Checkout error rate: if `CHECKOUT_ENABLED` and Cardcom timeouts cluster, close till.

## First ten minutes

1. Read ntfy (no amounts). Grab order id.
2. `OBSERVABILITY-MAP.md` grep `event`.
3. Classify: Cardcom / DB / Resend / RLS 42501 / 42703 column generation.
4. Open the matching `RUNBOOK-*.md`.
5. Do not apply migrations. Do not mock Cardcom. Do not forward guest Cookie jar as a "fix".

Topic must be unguessable in production. `ALERTS_ENABLED` must not be false.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
