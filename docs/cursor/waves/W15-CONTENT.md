# W15 Content pages

Code-agent spec. `/about`, `/faq`, `/contact`, `/blog`, legal group already routed. This wave is **copy and contact**, not a CMS rewrite.

---

## What the wave builds

1. Contact action stays rate-limited (`src/server/actions/contact.ts`). Anon cannot insert `notification_outbox`.
2. Blog MDX stays build-time. No staff HTML in the DB in v1.
3. Legal: returns copy must **not** say escrow / נאמנות (cutover trust risk). Code branch edits TSX; this pack does not.

---

## Tables

None required. Optional `contact_messages` if already present: service_role + admin SELECT.

---

## RLS

Contact: server action + service insert. Do not add anon INSERT.

---

## Money invariants

FAQ must not teach a global 10% commission or escrow hold. Point at coupon absolute prepay + cash at till.

---

## Tests

`src/server/actions/contact.test.ts`, `src/content/blog/blog.test.ts`, `src/content/legal/legal-duplication.test.ts`, `legal-pages.test.ts` cookie list.

---

## Feature flag

None.

---

## Close

Contact works, legal duplicates stay in sync, no escrow sentence on `/legal/returns`.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
