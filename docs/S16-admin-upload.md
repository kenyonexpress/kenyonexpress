# S16: admin product upload (04.11.2026)

Result: **done.** The single form had every field already. The CSV import
was missing three of them. Production refused every save that set a
shipping fee or a cancellation window, and migration 256 fixes that.

## What already existed, and was verified, not rebuilt

`/admin/products/new` (`src/app/(admin)/admin/products/new/page.tsx`, guarded by
`requireSection('catalog', 'write')`) renders `src/components/admin/ProductForm.tsx`,
which already carries every field S16 names:

| S16 field | where |
|---|---|
| coupon or physical subtype | `name="type"`: `coupon`, `physical`, `recurring` |
| `platform_percent` | `name="platform_percent"`, required, `productSchema`, snapshotted to `order_items` at purchase (S09) |
| validity days | `CouponExpirySelect`, `name="coupon_expiry_days"`, 30/60/90 default 90 (S10, `lib/vouchers/validity.ts`) |
| shipping fee | `name="shipping_price_ils"`, converted to `shipping_price_agorot` through `ilsToAgorot` (`productTermsFromForm`) |
| cancel window | `name="cancellation_window_days"`, floor 14 (חוק הגנת הצרכן 14ג), max 365 |
| images via S04 | `ImageUploader` -> `processAndUploadImage` (`server/actions/admin/images.ts`) -> `lib/storage/r2.ts` (S04), Supabase Storage fallback while the R2 key pair is absent (S04 smoke blocked) |

`/admin/products/import` renders `ProductImportClient`, which reads its
column list from `IMPORT_COLUMNS`. Rows go through the same `productSchema`
and `buildProductMoneyWrite` as the form, and every row lands as `draft`.

Under the design freeze no file in `src/components/**` was edited. The new
CSV columns show up in the client because `IMPORT_COLUMNS` drives its list.

## The gap found on production

Measured before writing anything (`supabase db query --linked`):

```
cancellation_window_days:integer:-:YES | coupon_expiry_days:integer:90:YES | ...
payout_cadence:text:-:YES | shipping_price_agorot:integer:-:YES | supplier_transfer_days:integer:-:YES
products_payout_cadence_check = CHECK (payout_cadence IS NULL OR payout_cadence = ANY (ARRAY['weekly','biweekly','monthly']))
```

`refund_policy` was **absent**. The form writes the five terms as one optional
group (`lib/admin/optional-column-groups.ts`), so a save with any non-default
term got PGRST204 on `refund_policy` and was refused with the 243 notice. In
practice an admin could not set a shipping fee or a cancel window on any
product. `per_order`, a form option, also violated the live cadence CHECK.

Data before: 126 products, cadence 126 NULL, window 44 at 14 and 82 NULL,
shipping 11 at 0, 11 at 2900 and 104 NULL.

## Changes

| file | change |
|---|---|
| `migrations/pending/256_product_terms_live_completion.sql` | New, **applied**. Adds `refund_policy text NOT NULL DEFAULT 'statutory'` with its CHECK and the anon/authenticated column grant. Widens `products_payout_cadence_check` to per_order/weekly/biweekly/monthly. Adds `products_cancellation_window_statutory_floor` (NULL or 14..365). 243 must not be applied on production after this. |
| `src/lib/admin/product-import/import-rows.ts` | Three new CSV columns: `shipping_price_ils` (דמי משלוח), `cancellation_window_days` (חלון ביטול בימים), `images` (URLs separated by `\|`). The two terms are validated by the form's own `productExtrasSchema` and converted by `productTermsFromForm` (agorot via money.ts). A coupon with a shipping fee above 0 is refused. Images: deduped, max 8 (the form's cap), and each one must pass `isAllowedImageUrl`. The template gains the three cells. |
| `src/server/actions/admin/product-import.ts` | The insert now writes `images` (it was always `[]`) and the five terms through `writeWithOptionalColumns`, the same ladder the form's save uses. |
| `src/lib/admin/product-import/s16-terms-images.test.ts` | New, 17 tests. |
| `src/server/actions/admin/product-import-s16.test.ts` | New, 5 tests: the insert payload (2900 agorot, window 30, images, draft, platform_percent), the drop-and-retry on an un-migrated DB, the refusal with the 243 notice when the terms are set, no insert on an invalid row, and the admin guard. |
| `src/__tests__/pending-migrations-inventory.test.ts`, `migrations/pending/README.md`, `APPLY-ORDER.md` | Rows for 256. |

**Decisions I made on my own:**
1. I wrote 256 instead of applying 243. 243 was written for a database that
   had none of the five columns. On this database its cadence CHECK would
   AND with the live one and drop `biweekly`.
2. `cancellation_window_days` stays nullable. The code reads NULL as 14, and
   82 rows are NULL.
3. The CSV images column takes URLs that are already hosted. Uploading files
   in bulk is the existing `/admin/products/images` screen (filename
   matching), and the CSV path does not duplicate it.

## Proof

### Migration 256: rehearsal, apply, verify

```
$ supabase db query --linked -f /tmp/s16-rehearse.sql      # the file with COMMIT -> count + ROLLBACK
"rows": [ { "n": 126 } ]                                    # all 126 rows read refund_policy='statutory'
$ (column count after the rollback)                         "count": 0
$ supabase db query --linked -f migrations/pending/256_product_terms_live_completion.sql
"rows": []
$ (verify)
"col": "refund_policy:'statutory'::text:NO",
"cons": "products_cancellation_window_statutory_floor=CHECK (((cancellation_window_days IS NULL) OR ((cancellation_window_days >= 14) AND (cancellation_window_days <= 365)))) || products_payout_cadence_check=CHECK (((payout_cadence IS NULL) OR (payout_cadence = ANY (ARRAY['per_order'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text])))) || products_refund_policy_known=CHECK ((refund_policy = ANY (ARRAY['statutory'::text, 'fee_waived'::text])))",
```

### The five-column write the code sends, on production, rolled back

```
BEGIN; update products set shipping_price_agorot=2900, supplier_transfer_days=null,
  payout_cadence='per_order', cancellation_window_days=30, refund_policy='statutory' where id=<oldest>;
"rows": [ { "updated_rows": 1 } ]
ROLLBACK;

BEGIN; update products set cancellation_window_days=7 ...; ROLLBACK;
ERROR:  23514: new row for relation "products" violates check constraint "products_cancellation_window_statutory_floor"
```

### Tests

```
$ pnpm vitest run src/lib/admin/product-import src/server/actions/admin/product-import-s16.test.ts
 Test Files  4 passed (4)
      Tests  65 passed (65)
$ pnpm vitest run src/__tests__/pending-migrations-inventory.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

```
$ pnpm vitest run
 Test Files  660 passed | 1 skipped (661)
      Tests  7929 passed | 13 skipped (7942)
exit=0
```

### Type-check and lint

```
$ pnpm type-check
$ tsc --noEmit
tsc exit=0
$ npx biome check src scripts migrations messages data next.config.ts docs
Checked 2069 files in 615ms. No fixes applied.
tokens-gate exit=0  copy-gate exit=0  asset-gate exit=0  raw-html-gate exit=0
postgrest-or-gate exit=0  cache-invalidation-gate exit=0  rtl-logical-gate exit=0
i18n-gate exit=0  locale-format-gate exit=0  input-dir-gate exit=0
```

A bare `pnpm lint` (`biome check .`) reports 101 errors, every one of them in
the untracked `.lighthouseci/` folder (Lighthouse JSON from 25 to 27.10). That
folder is not this item's and is not in the repo. The scoped run above covers
every tracked source directory.

### Design freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
$ git diff --name-status design-locked-2026-10-19 -- <same paths> | awk '{print $1}' | sort | uniq -c
   2 A
```

Both are new files from S05 that did not exist at the tag. S16 touched no
frozen path.

## Open

- The shipping fee is now stored per product. Charging it at checkout is
  `lib/shipping/zones.ts` (S06 left it free by design).
- `cdn.kenyonexpress.co.il` still is not R2 (S04). Until then the form's
  uploads go to Supabase Storage.
