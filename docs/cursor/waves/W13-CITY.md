# W13 City landing

Code-agent spec. `/city/[slug]` and seventeen regions already exist (`src/lib/regions.ts`). This wave is **content honesty**, not a new geo stack.

---

## What the wave builds

1. Each city page lists only suppliers/products that actually serve that region (existing geo fields). No invented density.
2. `hreflang` stays `he-IL`. These URLs must survive W32 without becoming `/en/city/...` accidentally without a decision.
3. Map/Waze links from real `lat/lng`. Missing coords: omit the button, do not drop a pin on Tel Aviv.

---

## Tables

`suppliers`, `supplier_branches` (133), `products`. Read-only.

---

## RLS

Public catalogue predicate. Branches: public read of published addresses only. Do not expose scanner PINs (`supplier_staff`).

---

## Money invariants

City pages render the same `ProductCard` money as home. No city-specific platform percent.

---

## Tests

`src/lib/regions.test.ts`, `src/lib/geo/distance.test.ts`. Seventeen slugs stable. Unknown slug 404.

---

## Feature flag

None.

---

## Close

Seventeen pages, no fake pins, pixel gate still Hebrew Electro (do not add English city names in this wave).
