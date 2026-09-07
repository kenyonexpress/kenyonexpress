# W04 Wishlist

Code-agent spec. Binding architecture: `docs/ARCHITECTURE-WISHLIST.md`. Route `/account/wishlist` already exists. Guest list is **localStorage** key `ke_wishlist`, not a cookie.

**Status.** Toggle action exists (`runToggleWishlist` on the user client). Heart on `ProductCard` and header badge are the product gap. Do not invent `wishlist_items` if production already uses one table with a unique pair (see RLS-CATALOG trap 15).

---

## What the wave builds

1. Heart on catalogue card + PDP `הוסף למועדפים` / `הסר ממועדפים`.
2. Header count badge. Empty copy: `עדיין אין מוצרים במועדפים`.
3. Auth: owner RLS, one default list per user, cap **100**, Hebrew reject when over cap (do not silently drop oldest).
4. Guest: `localStorage` `ke_wishlist`. Merge on login next to `mergeGuestCart` without duplicating `product_id`.
5. `/wishlist` `noindex`. Prune inactive / `deleted_at` products on read.

**Out of scope.** Share URLs. Price alerts. YITH compare (W19). Writing prices into wishlist jsonb.

---

## Tables

| Table | This wave |
|---|---|
| `wishlists` and/or a single wishlist table | Owner CRUD. Confirm live shape before a second migration. |
| `wishlist_items` | Only if live schema is two-table. UNIQUE `(wishlist_id, product_id)`. |
| `products` | Read public predicate `status = 'active' AND deleted_at IS NULL` on the page. |
| `carts` | Merge is a sibling of cart merge, not a cart write. |

---

## RLS

User client only (same comment as reviews: admin-client writes reopen the policy).

- SELECT/INSERT/UPDATE/DELETE own rows: `user_id = auth.uid()`.
- Anon: no Postgres writes. Guest state is localStorage.
- Partners (`supplier_members`) do not see shoppers' lists.

---

## Money invariants

Wishlist is **not a cart**. No agorot columns. PDP prices on the page are display-only. Checkout re-resolves via `calculateCommission`. Do not snapshot `platform_percent` onto a heart.

---

## Tests that must exist before close

| Test | If deleted |
|---|---|
| Guest merge does not duplicate product ids | Double heart, cap lie |
| Cap 100 returns Hebrew, does not drop oldest | Silent data loss |
| Toggle uses user client | RLS bypass |
| Inactive products pruned on read | Ghost cards |
| `noindex` on `/wishlist` | Indexed empty lists |
| Prices not stored on the row | Stale ₪ at checkout |

Existing: `src/server/actions/reviews.ts` (wishlist half). Cart merge tests are the pattern (`cart-merge-never-duplicates.test.ts`).

---

## Feature flag

None. Logged-out heart works on vercel.app without H6.

---

## Docs to update

`POST-LAUNCH-ROADMAP.md` P2, `GLOSSARY.md` (`ke_wishlist`), `ARCHITECTURE-WISHLIST.md` status line, `RLS-CATALOG.md`.

---

## Edge cases

- CSP: do not add a guest cookie "to match cart". Architecture forbids it.
- `is_coupon_enabled` products: heart the `product_id`, not a resolved type.
- Merge after login must run in the same callback as cart merge or hearts vanish.
- Variant: v1 is product-level, not variant-level (YITH default). Do not key on `variant_id` unless the architecture doc is amended first.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Add | הוסף למועדפים |
| Remove | הסר ממועדפים |
| Empty | עדיין אין מוצרים במועדפים |
| Need login | צריך להתחבר כדי לשמור מוצרים. |
| Bad id | מוצר לא תקין. |
| Cap | אפשר לשמור עד 100 מוצרים במועדפים. |
| Inactive prune (silent) | (no toast; card simply absent) |
| Header badge | count only, `aria-label` מועדפים |

---

## Open questions

| Q | Best answer |
|---|---|
| One table or `wishlists` + `wishlist_items`? | Read live schema first. Do not add the second table if a unique pair already exists (RLS trap 15). |
| Guest storage? | **localStorage** `ke_wishlist`. Not a cookie. |
| Variant-level hearts? | **No** in v1. Product id only. |
| Share URL? | **No.** |

---

## Depends on / close

Depends on `mergeGuestCart` behaviour. Does not block W49. Close: heart, badge, merge, cap, tests, no money columns.

---

## Second pass (after contracts)

- Guest identity stays `localStorage`. Do not invent a wishlist cookie; cart already splits `ke_session_id` vs constructed `session_id=` (`contracts/ROLE-VENDOR.md` cookie note in ARCHITECTURE).
- Cache: wishlist page is private. `noindex` plus `Cache-Control: private` (`contracts/CACHE-POLICY.md`).
- Rate limits: toggle must share a user-keyed limiter so a script cannot flood unique pairs (`contracts/RATE-LIMITS.md`).
- Consent: hearts are not marketing. Abandoned-cart later must not harvest wishlist emails (`contracts/CONSENT-MODEL.md`).
- `profiles.role = vendor` does not list other shoppers' hearts. Owner RLS only.
