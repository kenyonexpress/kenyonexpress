# W03 Reviews

Code-agent spec. Worktree `ke-cursor`, branch `ke-cursor-docs`. This file is the brief the **code** worktree reads before touching reviews. Markdown only here.

**Queue origin.** This pack reconstructs waves W03–W49 toward `v7.0.0-rc1` from the 10.08 STATE.md product queue (items 21–40), `docs/cursor/POST-LAUNCH-ROADMAP.md` P1, and what the tree already ships. This worktree's `STATE.md` has no labeled "MASTER QUEUE W3–W49" block. If a later STATE.md row disagrees with this file, STATE.md plus the live tree win.

**Status on this branch.** Actions, admin moderation page, and rating math exist. PDP as a product is unfinished. Reviews are an empty museum until launch H6 produces paid `order_items`. Do not advertise reviews on the commercial homepage.

---

## What the wave builds

1. PDP Hebrew list of **published** reviews, average to one decimal, empty state `עדיין אין ביקורות`.
2. Write form only for a signed-in buyer who owns a **paid-or-later** `order_items` row for that product. One review per `order_item_id`.
3. Moderation: pending → published / rejected. Public SELECT is published only.
4. Rate limit 5 submits per user per hour (already in `submitReview`).
5. Optional later: photo reviews on R2 (same MIME allowlist as catalogue). Out of this wave.

**Out of scope.** YITH compare bar (W19). Ratings that change `kenyon_price` or `coupon_price_ils`. Staff reviewing via `has_role('customer')`.

---

## Tables

| Table | This wave |
|---|---|
| `reviews` | Insert by buyer (user client). Admin updates status. Public read published. Migration comments still say 154; `submitReview` treats `PGRST205` as "not open yet". |
| `order_items` | Read-only join for verification. Never updated by a review. |
| `orders` | Read-only: status must be paid-or-later. |
| `products` | Display. Soft-delete / inactive products still keep historical reviews; PDP hides the form. |
| `audit_log` | Admin moderate must write an audit row (existing admin pattern). |

No money tables. No `notification_outbox` kind for "review published" in v1 (CHECK list is closed; adding a kind is W45).

---

## RLS

Enforcement is the INSERT policy, **not** TypeScript. `submitReview` runs on the **user** client on purpose. An admin-client insert would reopen everything the policy closes.

Required policy shape (already named in `src/lib/reviews/reviews.ts`):

- `reviews_owner_insert_verified`: INSERT only when `order_item_id` belongs to `auth.uid()`, the order is paid-or-later, and the line's `product_id` matches.
- UNIQUE `(order_item_id)` → `23505` / `ALREADY_REVIEWED`.
- Public SELECT: `status = 'published'` (or equivalent). Pending is staff-only.
- UPDATE/DELETE: admin / super_admin via `requireSection`. `support` read-only. `content_uploader` must not moderate.

`profiles.role = vendor` does not grant review write. A restaurant member shopping as a customer uses the same paid-order rule.

---

## Money invariants

- Ratings are **not** prices. `summarizeRatings` sums integers 1–5, then one division for display (`Math.round((sum * 10) / n) / 10`). Empty list is `null`, never 0.
- Do not store an average column that checkout reads.
- Do not apply a "high rating" discount. Deals stay `coupon_price_ils` / `kenyon_price`.
- JSON-LD `aggregateRating` stays off until there is a published count (existing architecture test: we have no public ratings product yet).

---

## Tests that must exist before close

| Test | If deleted |
|---|---|
| Policy: unpaid / other user's `order_item` → `42501` | Fake reviews |
| UNIQUE one review per `order_item_id` → `23505` | Duplicate spam |
| Public SELECT excludes pending | Unmoderated copy on PDP |
| `summarizeRatings([]) === null` | "0.0" empty state |
| `submitReview` uses `createClient()`, not `createAdminClient()` | RLS bypass |
| content_uploader cannot moderate | Catalogue staff publishes libel |
| Rate limit 5/hour | Flood |
| `TABLE_MISSING` Hebrew, not a 500 | Pending 154 not applied |

Existing files to extend, not replace: `src/server/actions/reviews.ts`, admin reviews tests if present.

---

## Feature flag

No new flag. Kill switch `KILL_SWITCH_RECS` is recommendations, not reviews. Do not reuse it.

If the table is missing, the action already returns Hebrew "not open yet". That is the off state.

---

## Docs to update (code branch)

- `docs/cursor/POST-LAUNCH-ROADMAP.md` P1 (mark shipped vs remaining photos).
- `docs/cursor/RLS-CATALOG.md` reviews row.
- `docs/cursor/TEST-MAP.md` (close the review-policy gap if still listed).
- `docs/ERROR-COPY.md` strings this wave adds.
- JSON-LD / SEO doc if `aggregateRating` is turned on.

---

## Edge cases

- Guest: form hidden, no cookie review.
- Mixed cart: review the coupon line and the physical line separately (per `order_item_id`).
- Refunded order: INSERT policy must refuse (consumed/refunded value is not a verified purchase for a public star). If 154 currently allows paid-then-refunded, close that in SQL, not in the action.
- Deleted product: keep the row; PDP 404; admin can still see it.
- HTML in body: strip / reject. No PII requirement in v1 beyond the 1000 char cap (DB CHECK 2000).
- `is_coupon_enabled` physical rows (barbecue and the five live mismatches): the product the shopper bought is the cart-resolved type; the review still keys on `product_id`.

---

## Depends on / blocks

- **Depends:** launch H6 (or staging paid orders). RLS 154 applied, or the action stays on `PGRST205`.
- **Does not block** W49 commercial launch. Launch copy must not claim "ביקורות מאומתות" until this wave is closed **and** H6 has real rows.
- **Blocks:** W24 supplier NPS must not reuse `reviews` for business-level scores.

## Close

PDP shows only published stars, unpaid users cannot insert, admin can reject, tests above green, no money path touched.
