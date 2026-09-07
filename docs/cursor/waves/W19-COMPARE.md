# W19 Compare page

Code-agent spec. Wishlist architecture **explicitly deferred** YITH compare. Pixel leftover only. **Do not ship as a launch feature.**

---

## What the wave builds (if product insists)

1. Side-by-side of at most 4 **active** products. `noindex`.
2. Display-only prices. Add-to-cart still goes through the cart pricer.
3. Electro compare bar pixel fight is 8–12 days. Do not ride W04 or W03.

**Default recommendation.** Skip this wave until after W49. Document skip in WAVE-INDEX.

---

## Tables

None required (client list). Do not create `compare_lists` that store prices.

---

## RLS

If a table is added: owner only, same cap rules as wishlist.

---

## Money invariants

Compare must show coupon on-site price, not face. Mixing face and on-site in one column is a quote-vs-charge bug.

---

## Tests

If skipped: a test that `/compare` 404s so it cannot appear from a leftover WP redirect. If built: no money columns, cap 4, inactive pruned.

---

## Feature flag

If built: off by default. Off: 404, in-flight localStorage lists ignored.

---

## Close

Either 404 forever or a display-only grid with tests. Never a third price list.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
