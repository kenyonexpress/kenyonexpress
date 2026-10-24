# L6 Admin product upload (manual + CSV), C07

Date: 2026-10-25. Branch: closeout/v1-final. Result: DONE.

Run against the live Supabase project (`ixvwfbuvfxxsjiywhbbb`) from a local `next dev`, driven by Playwright in a real browser. Anon and service-role keys both answered 200 this time (the C04/C06 401 is gone).

## Method

- Session: a magic-link token for the existing `e2e-admin@kenyonexpress.co.il` fixture (role `admin`, no MFA factor) minted with the service role and exchanged for session cookies. No password changed, no email sent.
- Test supplier: every real supplier is flagged "חסרים פרטים", so none can publish (see findings). A temporary complete supplier "C07 ספק בדיקה זמני" was inserted for the run and deleted afterwards. No real supplier row was edited.
- Test products used slugs `c07-dummy-manual-*` and `c07-dummy-csv-*`.

## Results

| Step | Outcome |
|---|---|
| Manual: `/admin/products/new`, physical, active, 100 NIS, 10/90 split, discount 33 | Failed before the fix (finding 1). Created after it. Row: status active, approval approved. |
| `/product/<slug>` for the manual product | 200. Title "מוצר בדיקה C07 ידני \| קניון EXPRESS", JSON-LD price 100.00 ILS. |
| CSV dry-run, bad file (`bogus_type`, price `abc`) | Reported as valid before the fix (finding 3). Rejected after it. |
| CSV dry-run, good file | "1 שורות תקינות. שום דבר עוד לא נשמר." |
| CSV commit | Did nothing before the fix (finding 2). After it: row created as draft, 80.50 NIS, 10/90 split, supplier and stock carried over. |
| Draft CSV product at `/product/<slug>` | 404 (drafts are not public). |
| Publish CSV product via the edit form (active, discount 33) | Saved. `/product/<slug>` 200, JSON-LD price 80.50 ILS, present in sitemap.xml. |
| Delete both through the admin list ("מחיקה" then "כן, מחיקה") | Rows soft-deleted (`status=archived`, `deleted_at` set), gone from the admin list, `/product/<slug>` back to 404. |
| Cleanup | Both test products and the temporary supplier hard-deleted through the service role. A re-query returns no `c07-dummy*` products and no `C07*` suppliers. |

Note: the task text says `/p/<slug>`. That route does not exist (404 even for a live product). The product route is `/product/<slug>`, which is what was verified.

## Findings fixed

1. **Manual create always failed.** `upsertProduct` wrote `free_shipping`, but the column does not exist (migration 193 was cancelled; free shipping is `shipping_price_agorot = 0`, migration 278). PostgREST rejected every insert: "Could not find the 'free_shipping' column". Fix: `free_shipping` is stripped from the write payload in `src/server/actions/admin/products.ts`.
2. **CSV commit was unreachable from the UI.** React resets an uncontrolled form after a form action, which cleared the file input. The `required` attribute then silently blocked the commit button. The `mode` hidden input also depended on `setState` timing. Fix in `ImportForm.tsx`: the chosen file is kept in a ref and re-attached to each submit, `required` is dropped (the server already answers "לא נבחר קובץ"), and the mode travels on the submit buttons (`name="mode"`).
3. **Dry-run accepted rows the write path rejects.** `validateRow` did not check `type` or `kenyon_price`. It now requires `type` in `physical|coupon|recurring` and a non-negative decimal price with at most two decimals. The existing 185 fixture used `type=product`, which the schema never accepted; it now uses `physical`. New unit test added in `product-csv.test.ts`.

## Findings not fixed (recorded)

- **No supplier can publish.** All 13 real suppliers lack phone, address or logo, so "active" is refused by `assertPublishable`. Operational data gap, not code.
- **CSV cannot carry `discount_percent`.** Publishing requires it, so every imported row needs an edit pass before it can go live.
- **Bulk activate skips the publish gate.** `runBulkUpdateProductStatus` only checks role, not `assertPublishable`, so bulk "active" can publish a product the form would refuse.
- **"משלוח חינם" checkbox is now a no-op on save.** It has no column to land in. A proper fix maps it to `shipping_price_agorot = 0`.
- **Money columns are `numeric`.** `products.kenyon_price` and related columns come back as 100.00 / 80.50, against the integer-agorot rule. Existing schema, out of scope here.
- **Admin list rounds prices** (80.50 shows as "81 ₪").
- Unrelated: 6 pre-existing vitest failures in `src/lib/admin/import/parseProductsCsv.test.ts` and `src/lib/admin/vendor-form.test.ts` (same failures with these changes stashed).

## Gates

- `tsc --noEmit`: clean. `biome check` on touched dirs: clean.
- `vitest src/lib/admin`: 256 pass, 6 fail (the pre-existing ones above).
- No visual change: no storefront component touched, so compare.mjs is not affected. No forbidden files touched. No migration written or applied.
