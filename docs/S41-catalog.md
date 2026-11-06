# S41: catalogue cleanup against the 25-entry ledger (06.11.2026)

Queue item S41: apply the operator's decisions to the 25 findings in `supabase/catalogue-known-issues.json`, rewrite the ledger to `[]`, regenerate the snapshot in the same commit, keep the gate green.

**RESULT: BLOCKED ledger-not-empty.** The cleanup of the 25 entries is applied in production and verified. The ledger is not `[]` and cannot honestly be: 94 findings fire on the re-measured catalogue, 90 of them on rows the item gives no decision for. The gate is green on a truthful snapshot and a truthful ledger.

## What changed in production

One transaction through `~/ke-goals/db.sh`, dry-run with `ROLLBACK` first.

| rule in the item | rows | action |
|---|---|---|
| `-copy` and `העתק` slugs | `טיפול-פנים-copy` (413efed9), `צימר-מאסטר-copy` (97a3edc0), `צימר-מאסטר-copy-copy` (50957e5b), `חיתולי-פמפרס-העתק` (85bff155) | deleted (archived) |
| currency symbol in slug | `עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪` (50f60a63), `עיסוי-משולב-מפנק-לגבר-רק-108₪` (6dc25c0a) | deleted (archived) |
| bare import number | `6253` (aa8b918d) | deleted (archived) |
| sample product row | `מוצר-לדוגמא` (47b075be) | deleted (archived) |
| duplicate title, keep the row with an image and the most non-null fields | `טיפול פנים`: ec291362 kept (image, 48 non-null fields, short description, approved), adc894ba (image, 46) deleted (archived) | 1 deleted |
| name/slug contradiction, slug from name | ec291362: `ארוחת-שף-במסעדת-אולטרה` -> `טיפול-פנים` | 1 slug |
| the 9 and 20 priced rows | `עיסוי מאסטר` 92151d5b (9), `מבחר עיסויים לבחירה` f43d32ab (20) | `status = 'draft'` |
| `is_demo = true` | none of the 25 entries is on an `is_demo` row | 0 rows |

The other two duplicate pairs (`עיסוי מאסטר`, `מבחר עיסויים לבחירה`) each lost their `₪` row to the currency rule; the surviving row of each has an image and went to draft under the price rule.

## Three places the item could not be followed as written

1. **Hard `DELETE` is refused by the database, so "delete" is the admin's own delete.** All nine rows have `price_history`, and `fn_price_history_append_only` (migration 193) refuses the cascading delete for every role: `price_history is append-only: DELETE refused`. That guard is deliberate and was not bypassed. The nine rows got what `softDeleteProduct` in `src/server/actions/admin/products.ts` writes: `deleted_at = now(), status = 'archived'`. They are out of the storefront, out of the snapshot predicate and out of `status = 'active'`, and can be restored by clearing the two columns.
2. **`coupon_products` and `physical_products` do not exist.** Only `product_images` does, and it has no foreign key to `products`. Because nothing was hard-deleted there are no orphans: 0 orphan `product_images`, 0 orphan `product_variants` (measured after the commit).
3. **`is_demo = true` was read as scoped to the 25 entries, and it matches none of them.** 47 active rows carry `is_demo = true`: the 44 `demo-*` rows seeded on 02.11 and the three `launch-*` coupons G4 seeded on 05.11. None is in the ledger, which the item names as the source of truth. Deleting them would remove yesterday's G4 deliverable and take the catalogue from 82 active to 35, below the gate's own floor of 40. They were left alone. If the intent was a blanket delete, `scripts/remove-demo-catalog.ts` and `scripts/seed-launch.ts --remove` do exactly that.

## Why the ledger is 94 and not `[]`

The committed snapshot was last measured on 10.09 with 44 products. Production had 93 active before this item. Re-measuring, which the item requires, brought every row added since into the gate for the first time.

| group | findings | what fires |
|---|---|---|
| carried from the 25, no decision in the item covers them | 4 | `! צימר מאסטר` (template name and slug), `קוסמטיקאית.   אזל המלאי` (operational text in the name), `מזקקת וויסקי` (no image) |
| demo catalogue, `demo-*` | 83 | 44 slugs carry `demo`; 39 first images point at `/images/cdn/wp/...`, which nothing serves |
| G4 launch seed, `launch-*` | 3 | `image-file-missing` on a Supabase Storage URL. The rule reads any `first_image` as a path under `public/`. G4 probed these URLs 200, so this is the rule's limit, not a broken image. The rule was not changed here |
| E2E fixtures, `e2e-test-*` | 4 | slug carries `test`, no image. 926 and 142 order items and 875 vouchers reference them; they cannot go |

21 of the original 25 entries are gone. The ledger keeps its `{ known: {...} }` shape: the gate reads `ledger.known`, and a bare `[]` would crash it.

## Verification

```
select count(*) from products where status = 'active'          -> 82   (93 before)
active and deleted_at is null                                   -> 82
status = 'archived' and deleted_at is not null                  -> 9    (0 before)
status = 'draft'                                                -> 41   (39 before)
total rows                                                      -> 132  (unchanged)
orphan product_images / product_variants                        -> 0 / 0
ec291362 slug                                                   -> טיפול-פנים
92151d5b, f43d32ab status                                       -> draft, draft
pnpm exec vitest run src/lib/catalogue                          -> 4 files, 48 tests passed
pnpm test                                                       -> 704 files passed, 1 skipped; 8303 tests passed, 13 skipped; exit 0
git diff design-locked-2026-10-19 -- <frozen paths>             -> empty
```

Snapshot: 82 products, `$measured_at` 2026-11-06. Ledger: 94 entries, each still firing; the gate fails on a new finding and on an entry that stops firing, as before.

Backup taken before the transaction, outside the repository: `~/ke-goals/backups/S41-pre-cleanup-2026-11-06.json` (the 12 touched product rows in full, their 6 `product_images`, the 9 order-item links).

## Changed files

- `supabase/catalogue-snapshot.json`: re-measured, 44 -> 82 products.
- `supabase/catalogue-known-issues.json`: 25 -> 94 entries, grouped in `$groups`.
- `docs/S41-catalog.md`, `docs/INDEX.md`, `README.md`, `STATE.md`.

No code, no migration, no rule and no test changed.

## Decisions made alone

- Archive instead of hard delete (point 1).
- `is_demo` scoped to the ledger (point 3).
- The new slug is `טיפול-פנים`, the Hebrew hyphenated form every neighbouring live row uses, not the transliteration the admin form's `slugify` would produce (`typvl-pnym`).
- Rows outside the ledger were not touched even where a rule's wording would fit them: `אבחון וטיפול רפסולוגי` and `טיפול בתזונה הוליסטית` at 9, `תספורת לגבר` at 20, `פלייסטישן 5` on `/חיתולי-האגיס`, `ארוחת בוקר זוגית בקפה גן סיפור` on `/שעון-אפל-חכם-apple-watch-series-7`. No rule in the gate catches a name that contradicts its slug.

## Found, not handled

- `aa8b918d` (`6253`) had 9 order items. All nine belong to cancelled, unpaid E2E fixture orders of 14.10. Archiving kept the links.
- `data/legacy/wp-slug-map.json` records nine of these URLs as `unchanged, served today`. Eight now answer 404 and one moved (`/product/ארוחת-שף-במסעדת-אולטרה`). `scripts/build-wp-redirects.mjs` needs a re-run. No redirect was added for the moved one: the old URL was a chef's dinner and the row is a facial.
- The homepage deals grid orders by `KE_LIVE_DEALS`, which names seven of the archived slugs. `arrangeHomeDeals` fills a missing slug with the next newest row, so there are no dead links, but those slots now show other products. Not measured: the home is frozen and under maintenance.
- `README.md` and `CLAUDE.md` still describe the ledger as 25 findings on 44 products; only the README command row was corrected.
- The comments in `catalogue-safety.test.ts` and `safety-rules.ts` still say 25 and 44.

## Left for Ofir

1. Keep or remove the demo catalogue and the launch seed (47 rows). Removing them takes 86 entries off the ledger and needs the floor of 40 in the gate lowered.
2. A decision for `! צימר מאסטר`, `קוסמטיקאית.   אזל המלאי` and the whisky distillery photo.
3. Whether E2E fixtures belong in the measured catalogue at all.
