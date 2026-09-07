# W40 Tiers and segments

Code-agent spec. Do not add a VIP percent that bypasses per-product `platform_percent`.

---

## What it builds (v1 recommendation: **skip**)

If built: segments for **marketing** (who gets a campaign), never a second price list. Discount still W23 engine funded from platform.

---

## Tables

If added: `customer_segments` with human migration. Until then use newsletter tags only.

---

## RLS

Staff only. Segments must not SELECT other users' orders as `authenticated`.

---

## Money invariants

Forbidden: gold tier 5% off face of coupons. Forbidden: tier-specific `platform_percent` at pay (snapshot would still be per product; a live join is the bug).

---

## Tests before close

If skipped: no `tier` column on checkout input. If built: checkout ignores tier for prices.

---

## Feature flag

Off. Off: everyone is the same price.

---

## Docs updated

`PRICING-EXAMPLES.md` (no tier column).

---

## Edge cases

Staff accounts must not auto-enter a "0% commission" segment.

---

## Hebrew UX strings

Skip: no UI. If built: מועדון (marketing only).

---

## Open questions

| Q | Best answer |
|---|---|
| Ship tiers for v7? | **No.** |
