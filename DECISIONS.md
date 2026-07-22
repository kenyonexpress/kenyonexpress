# DECISIONS.md — Checkout Foundation

Branch: `phase6/checkout-foundation`
Living ADR log. Newest entries at the top.

---

## 2026-07-23 — ADR-008: Recovery cron every 15 minutes

**Context:** Abandoned pending orders and stale carts.

**Decision:** `POST /api/cron/checkout-recovery` with `CRON_SECRET` bearer auth; Vercel cron `*/15 * * * *`. Expires `pending` orders past `expires_at` to `cancelled` with audit. Counts carts idle > 24h (enqueue later).

**Consequences:** Requires `CRON_SECRET` in production. Without it, route is open only in non-production.

---

## 2026-07-23 — ADR-001: Stripe first, Payoneer stub, Cardcom deferred behind same interface

**Context:** Prior docs bind checkout to Cardcom Low Profile. Task asks for a swappable `PaymentProvider` with Stripe now and Payoneer stub.

**Decision:** Ship Stripe PaymentIntents as the foundation green path. Payoneer is a compile-time stub. Existing Cardcom modules remain in tree but are not the factory default; they will be wrapped to the new interface in a later ADR.

**Consequences:** Local/dev can run without Cardcom credentials. IL production cutover still needs an explicit provider choice (see ARCHITECTURE-CHECKOUT §8 Q1).

---

## 2026-07-23 — ADR-002: Simple order lifecycle separate from settlement machine

**Context:** Domain already has settlement states (`split_executed`, `escrow_held`, …). Task requires `cart -> pending -> paid -> fulfilled -> refunded`.

**Decision:** Introduce `order_lifecycle_status` for the customer/payment lifecycle. Keep settlement as a parallel concern on lines after `paid`. Do not delete settlement code.

**Consequences:** Two vocabularies exist (`lifecycle` vs `settlement`). Finalize only flips lifecycle to `paid`; settlement jobs run after.

---

## 2026-07-23 — ADR-003: VAT-inclusive ILS, 18%, server-only split

**Context:** Israeli B2C prices include VAT. LEGAL §1.6. Task requires 18% VAT server-side.

**Decision:** Store VAT-inclusive `total_agorot`. Derive `vat_agorot = round(total * 18 / 118)`. Never accept tax from the client.

**Consequences:** Invoice/net reporting uses derived fields. Catalog stays tax-in.

---

## 2026-07-23 — ADR-004: Agorot integers only

**Context:** Floating ILS causes Stripe/accounting drift.

**Decision:** All provider amounts and DB money columns for this foundation use integer agorot. Branded `Agorot` type in TS.

**Consequences:** Display layer formats to ₪X.XX; DB never stores decimal money for new columns.

---

## 2026-07-23 — ADR-005: Webhook is the only path to paid

**Context:** Browser return URLs are forgeable.

**Decision:** Success/cancel redirects are read-only. Only verified Stripe webhook (or mock equivalent in tests) may call finalize.

**Consequences:** UX polls order status after return. Matches prior Cardcom architecture principle.

---

## 2026-07-23 — ADR-006: Idempotency key = payment_attempt id

**Context:** Double-click and Stripe retries.

**Decision:** `idempotency_key = pi:{payment_attempt_id}` is UNIQUE in DB and sent as Stripe Idempotency-Key.

**Consequences:** Re-entry returns the same PaymentIntent client_secret.

---

## 2026-07-23 — ADR-007: Worktree base

**Context:** `phase6/checkout-foundation` was behind `phase6/checkout` WIP.

**Decision:** Merge `phase6/checkout` into foundation before Stripe work so cart/domain helpers exist.

**Consequences:** Foundation tip includes Cardcom WIP files; new Stripe modules sit beside them.
