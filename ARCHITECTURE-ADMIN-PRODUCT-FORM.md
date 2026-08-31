# ARCHITECTURE-ADMIN-PRODUCT-FORM.md

The admin product form: every field, which product type it belongs to, what
validates it, who may see it, and where its bytes live.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed.
Code this describes: `src/server/actions/admin/products.ts` (the Zod schema and
the save action), `src/components/admin/ProductForm.tsx`,
`src/lib/admin/product-fields.ts`, `src/lib/commerce/product-money.ts`,
`src/lib/storage/r2.ts`.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-MEDIA-R2.md`,
`ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` (what consumes these fields).

---

## 0. The one rule this form exists to enforce

**There is no default percentage anywhere.** Not in code, not in the database,
not in a config file, not in a seed. An empty percentage field is a validation
error, never a fallback.

```ts
platform_percent: z.coerce
  .number({ invalid_type_error: 'עמלת פלטפורמה נדרשת' })
  .min(0, 'עמלה לא יכולה להיות שלילית')
  .max(100, 'עמלה לא יכולה לעלות על 100')
```

Note what is missing: `.nullable()`, `.optional()`, `.default()`. This field is
**required**, on every product, of every type. It is the only split handle in
the system, and since 2026-07-27 it governs coupons as well as physical goods. A
product without it cannot be priced, so the storefront hides it rather than
guessing.

The same shape governs `coupon_expiry_days`, for the same reason: an unset value
used to become a silent 90 days inside `finalizeOrder`, which is a
consumer-facing promise nobody made.

---

## 1. Product types, as the form and the database actually see them

| Form label | `type` value | Database enum member | State |
|---|---|---|---|
| מוצר פיזי | `physical` | ✔ | live |
| קופון | `coupon` | ✔ | live |
| שירות | `service` | ✔ | **in the enum, not in the form** |
| חיוב חודשי קבוע | `recurring` | ✘ | **in the form, not in the enum** |

Two discrepancies, both real, both recorded rather than fixed here.

### 1.1 `recurring` ships as code before it ships as schema

`135_recurring_subscriptions.sql` is unapplied and applying it is Ofir's
call. Until then, an admin who picks "חיוב חודשי קבוע" and saves gets one of two
raw PostgREST messages, both of which read like a crash:

```
invalid input value for enum product_type: "recurring"
column products.recurring_amount_agorot does not exist   (PGRST204)
```

`src/lib/commerce/recurring-schema-error.ts` turns both into one Hebrew sentence
that names the migration file. That module is the difference between "the admin
is broken" and "this needs the migration applied". It matches on the **four
specific markers** (`invalid input value for enum product_type`,
`recurring_amount_agorot`, `billing_interval_count`, `billing_interval`) rather
than a loose `/recurring/`, so an unrelated failure that happens to contain the
word is not swallowed and misreported.

### 1.2 `service` is in the enum and not in the form

`product_type` has been `(coupon, physical, service)` since the enum was created,
and `AGENTS.md` names it as the binding spelling. Nothing in the admin form can
produce a `service` product today. Consequences, stated plainly:

- A service coupon can only be created by direct SQL.
- The 2-day and 7-day pre-service cancellation cuts in
  `ARCHITECTURE-REFUNDS-CANCELLATIONS.md` §1.1 have no product to attach to.
- The service booking date has no column.

This is queued in `MASTER-ARCHITECTURE-v3.md`, not invented here.

---

## 2. The field inventory

Legend for **Type**: **P** physical, **C** coupon, **S** service (when it lands),
**R** recurring (pending 109), **·** all types.

### 2.1 Identity and taxonomy

| Field | Type | Validation | Notes |
|---|---|---|---|
| `name_he` | · | `min(2)`, `'שם חייב להכיל לפחות 2 תווים'` | required |
| `name_en` | · | nullable | optional, not shown to shoppers |
| `slug` | · | unique, generated from `name_he`, editable | changing it needs a redirect; see `099_seo_redirects_and_wp_maps` |
| `description_he` | · | nullable text | **the single description field.** See §2.2 |
| `supplier_id` | · | uuid, nullable | required before publish; see §5 |
| `category_id` | · | uuid, nullable | |
| `brand` | P | nullable | |
| `sku` | P·C | nullable | |
| `barcode` | P | nullable | |
| `condition` | P | `enum('new','refurbished','used')` | |
| `tags` | · | `array(string.min(1))`, default `[]` | indexed for search |

### 2.2 One description field, and why the others are not descriptions

The binding rule is: **product description is one field, `description_he`.**

`short_description_he` (max 300) exists and is **not** a second description. It
is the card and meta-preview line, a summary with a length budget, and it is
never rendered as the product's body text. `highlights` is an array of bullet
strings, also not prose. `seo_description` (max 170) is a meta tag.

The rule that matters: **an admin fills in exactly one box that means "what this
product is".** Anything that tempted a second one, and the WordPress import in
particular carries both `post_content` and `post_excerpt`, collapses into
`description_he` plus a derived `short_description_he`. See
`ARCHITECTURE-WP-IMPORT-PIPELINE.md`.

### 2.3 Money and the split

| Field | Type | Validation | Notes |
|---|---|---|---|
| `kenyon_price` | · | `min(0)`, `'מחיר בקניון נדרש'` | the site price |
| `full_price` | · | `min(0)`, nullable | must be `>= kenyon_price` |
| `platform_percent` | · | `0..100`, **required** | §0. No default, ever |
| `supplier_split_percent` | · | `0..100`, nullable | the admin may type either side; the pair is completed by `completeSplitPair` |
| `discount_percent` | P·C | `0..100`, nullable | physical: reduces the charge. coupon: **badge only**, recomputed from the two prices |
| `coupon_price_ils` | C | `positive()`, nullable | **absolute shekels**, not a percent. Required on a coupon |
| `min_purchase_ils` | C | `min(0)`, nullable | till condition, disclosed to the customer |
| `vat_exempt` | · | boolean, default `false` | absent column reads as false: VAT applies unless exempted |
| `recurring_amount_ils` | R | `positive()`, required when `type='recurring'` | never a column; the column is `recurring_amount_agorot` |
| `billing_interval` | R | `enum('monthly','yearly')`, required when recurring | |
| `billing_interval_count` | R | `int().min(1)` | |

Four cross-field rules, in `superRefine`:

```ts
full_price < kenyon_price
  -> 'מחיר מלא חייב להיות גדול או שווה למחיר בקניון'

coupon_price_ils > kenyon_price
  -> 'מחיר הקופון לא יכול לעלות על המחיר הרגיל'
     // mirrors products_coupon_price_within_price, which was added NOT VALID
     // and therefore cannot be relied on alone for rows predating it

platform_percent + supplier_split_percent !== 100
  -> 'עמלת פלטפורמה ואחוז לספק חייבים להסתכם ב-100%. כרגע N%.'
     // backed by the DB CHECK products_split_pair_sums_to_100

type='recurring' with a null amount or interval
  -> refused. A subscription with no amount is not free, it is unconfigured.
```

**`discount_percent` on a coupon is a badge, not a price.** It is recomputed
from `kenyon_price` and `coupon_price_ils` rather than trusted, so the page
cannot quote a saving that checkout will not honour. That distinction was a real
defect; `src/lib/commerce/coupon-offer.ts` carries its history.

### 2.4 Coupon specifics

| Field | Validation | Notes |
|---|---|---|
| `is_coupon_enabled` | boolean, default `false` | a physical product may also be sold as a coupon |
| `coupon_expiry_days` | `int().min(1)`, **required when coupon** | no default. §0 |
| `offer_valid_until` | date string, nullable | **consumer protection.** §4 |
| `coupon_terms_he` | nullable text | the terms at the till |
| `redemption_instructions_he` | nullable text | how to redeem |

The face value the customer sees at the till is `kenyon_price`; what they pay
here is `coupon_price_ils`; the difference is what the cashier collects. The form
shows all three side by side with the arithmetic spelled out, because an admin
who mistypes `coupon_price_ils` mis-sets a customer's out-of-pocket cost at a
counter they cannot argue with.

### 2.5 Inventory and logistics

| Field | Type | Validation |
|---|---|---|
| `stock_quantity` | P | `int().min(0)`, nullable |
| `low_stock_threshold` | P | `int().min(0)`, default `5` |
| `max_per_order` | · | `int().min(1)`, nullable |
| `requires_shipping` | P | boolean, default `true` |
| `weight_grams` | P | `int().min(0)`, nullable |
| `length_mm`, `width_mm`, `height_mm` | P | `int().positive()`, nullable |
| `warranty_months` | P | `int().min(0)`, nullable |
| `whatsapp_enabled` | · | boolean, default `false` |

**Dimensions are whole millimetres.** The `*_cm` columns are superseded by
migration 112 and are no longer written. `readDimensionMm` still reads them,
converting `cm * 10` and rounding, so a row written before 112 shows the right
number in the form instead of an empty box that silently discards it on the next
save. Measured at migration time: **zero of the 80 products carried any
dimension**, so the fallback has no rows to act on today and exists for what a
restore could bring back.

`src/lib/admin/product-fields.ts` reads `vat_exempt`, `tags` and the three
dimensions **defensively**, because `src/types/database.ts` has not been
regenerated since 112 and the generated `Product` type does not carry them even
though the columns exist. Those readers are deleted when the types are
regenerated, and that is written in the file so nobody has to guess.

### 2.6 Media

| Field | Validation | Notes |
|---|---|---|
| `images` | jsonb array | §3 |
| `video_url` | `url()`, nullable, `'כתובת וידאו לא תקינה'` | |
| `product_images` | separate table | ordered gallery |

### 2.7 SEO

| Field | Validation |
|---|---|
| `seo_title` | `max(70)`, `'כותרת SEO עד 70 תווים'` |
| `seo_description` | `max(170)`, `'תיאור SEO עד 170 תווים'` |
| `seo_keywords` | nullable |

The limits are the real SERP truncation points, not round numbers, which is why
they are 70 and 170 rather than 60 and 160.

### 2.8 Location

| Field | Notes |
|---|---|
| `city` | overrides `suppliers.city`. `NULL` means "wherever the supplier is" |
| `latitude`, `longitude` | `numeric(9,6)`, **a pair or nothing** |

Applied by migration `113_products_geo`, in reduced form: the columns, the three
CHECKs and `products_city_idx` landed; the `cube`/`earthdistance` extensions and
the GiST index did not, because extension creation needs privileges the MCP
connection does not have. See `ARCHITECTURE-GEO-LOCATION.md`.

The pair constraint is worth restating here because it is a form-level rule too:
**half a coordinate is not partial data, it is wrong data.** Latitude 32 with a
null longitude reads as `{32, 0}`, which is in the Atlantic off Ghana, and it
would sort as the nearest deal to nobody while looking like a real row. The form
disables one input until the other is filled.

### 2.9 Status and approval

| Field | Values |
|---|---|
| `status` | `draft | active | paused | sold_out | archived` (the form offers four; `sold_out` is set by stock logic) |
| `approval_status` | `draft | pending | approved | rejected` |
| `approval_note`, `approved_at`, `approved_by`, `submitted_at` | audit of the approval |
| `is_featured` | boolean |
| `published_at` | set on first activation |

---

## 3. Images: R2, presigned, and the bytes that never touch our server

`src/lib/storage/r2.ts` signs an **S3-compatible presigned PUT** with AWS SigV4,
using Web Crypto HMAC-SHA256. **No AWS SDK.** The browser receives a short-lived
URL and PUTs the file straight to Cloudflare R2.

```
admin picks a file
   -> server action: validate (type, size, count), build the key, sign a PUT
   -> browser PUTs the bytes DIRECTLY to R2      <- never through Next.js
   -> browser reports the key back
   -> server writes product_images / products.images
```

Why direct: image bytes never pass through the Next.js server, so a 12 MB upload
does not occupy a serverless function for its duration, and the request body
limit stops being a constraint on catalogue quality.

### 3.1 Required environment

```
R2_ACCOUNT_ID          Cloudflare account id
R2_ACCESS_KEY_ID       R2 API token access key
R2_SECRET_ACCESS_KEY   R2 API token secret
R2_BUCKET              target bucket
R2_PUBLIC_BASE_URL     public CDN base, e.g. https://cdn.kenyonexpress.co.il
```

`isR2Configured()` requires **all five**. When any is missing, `requestUploadUrl`
falls back to Supabase Storage. The fallback is real and tested, not a stub, and
it exists so a developer without R2 credentials can still work on the form.

### 3.2 Key layout

```
products/<product_id>/<uuid>.<ext>
```

Content-addressed by a fresh uuid rather than by filename: two admins uploading
`image.jpg` must not collide, and a filename from a WordPress import must not
become a path.

### 3.3 Validation, all of it server-side

| Rule | Enforced where |
|---|---|
| MIME allow-list (`image/jpeg`, `image/png`, `image/webp`, `image/avif`) | the signing action, before the URL is issued |
| max bytes per file | the signing action, and again by the presigned policy |
| max images per product | the signing action, counted against existing rows |
| dimensions and re-encode | not done. R2 stores what was PUT |

The last row is a real limitation. There is **no server-side image processing**,
so an admin can upload a 6000px original and it is served as-is through
`/_next/image`. Two consequences, both measured in this repo before:

1. `/_next/image` **serves the source byte-for-byte when sharp cannot decode
   it**, silently, with a 200. A "resized" image is not proof of resizing.
   Verify byte counts, never assume.
2. Very large originals make the optimizer the slowest thing on the product
   page.

The mitigation is a size cap at upload time, not a promise of resizing.

### 3.4 What is never uploaded through this path

Anything that is not an image for a product. Supplier documents, invoices and
identity papers are a different bucket with a different policy, because the
product bucket is **public-read by design** and those are not.

---

## 4. Consumer-protection fields, and why they are not optional decoration

| Field | Obligation |
|---|---|
| `offer_valid_until` | A limited offer must state when it ends. Shown on the PDP, the cart line, the checkout summary, the voucher and the email. Expires automatically |
| `coupon_terms_he` | The conditions the customer will meet at the till |
| `redemption_instructions_he` | How, where and when the coupon is redeemed |
| `min_purchase_ils` | A minimum spend is a condition and must be disclosed before payment, not discovered at the counter |
| `coupon_expiry_days` | Determines `vouchers.expires_at`, which is immutable once issued |
| supplier identity | Name, address, phone on every product page. The customer is buying from a named business |
| `warranty_months` | Warranty term, where one is given |
| `vat_exempt` | Whether the displayed price includes VAT |

Two rules the form enforces beyond field presence:

1. **`offer_valid_until` expires the offer automatically.** It is not a label. A
   product past its window stops being purchasable, and the voucher expiry is
   `min(issued_at + coupon_expiry_days, offer_valid_until)`, the **earlier** of
   the two.
2. **The till remainder is shown as an arithmetic line**, in the admin form and
   on the customer page both: `face_value - coupon_price = what you pay at the
   business`. Both audiences see the same three numbers, which is how they stay
   consistent.

---

## 5. The publish gate

`status = 'active'` is refused unless every one of these holds:

| Requirement | Why |
|---|---|
| `platform_percent` present | no split handle, no price. §0 |
| `platform_percent + supplier_split_percent = 100` | DB CHECK, and the form checks first so the error is Hebrew |
| `supplier_id` set, and the supplier row carries name, phone and address | the snapshot copied onto every order line comes from here. `supplierIdentityOf` returns an id-only identity when the row is missing **rather than throwing**, because a checkout must not fail on a display detail, which means the gate is the only thing guaranteeing those fields are filled |
| at least one image | a product card with no image breaks the grid and the search result |
| `description_he` non-empty | §2.2 |
| coupon: `coupon_price_ils` and `coupon_expiry_days` present | §0 |
| coupon: `coupon_price_ils <= kenyon_price` | otherwise the "saving" is negative |
| `offer_valid_until` in the future, when set | §4 |
| `slug` unique | |

**The gate is the reason `supplierIdentityOf` is allowed to be forgiving.** Those
two behaviours are a pair, and weakening the gate breaks the order snapshot
silently rather than loudly.

---

## 6. Visibility layers

Three audiences, one row. The layer decides what each may read and write.

| Layer | Who | Reads | Writes |
|---|---|---|---|
| **PUBLIC** | `anon`, `authenticated` shoppers | published fields of `active` products only | **nothing.** `111_revoke_anon_writes` |
| **SUPPLIER** | `supplier_members` of `products.supplier_id` | own products, all fields except platform economics | content, media, stock, logistics; submit for approval |
| **ADMIN** | `admin`, `super_admin` | everything | everything |

### 6.1 Field visibility

| Field group | PUBLIC | SUPPLIER | ADMIN |
|---|---|---|---|
| `name_he`, `description_he`, images, `highlights` | read | read/write | read/write |
| `kenyon_price`, `full_price`, `discount_percent` | read | read | read/write |
| `coupon_price_ils`, `coupon_expiry_days`, `offer_valid_until` | read | read | read/write |
| **`platform_percent`, `supplier_split_percent`** | **hidden** | **read only** | read/write |
| `cost_ils`, `profit_share_cap_percent` | hidden | hidden | read/write |
| `stock_quantity`, `low_stock_threshold` | derived only (in stock / low) | read/write | read/write |
| `sku`, `barcode`, dimensions, weight | hidden | read/write | read/write |
| `approval_status`, `approval_note`, `approved_by` | hidden | read | read/write |
| `city`, `latitude`, `longitude` | read | read/write | read/write |
| SEO fields | as meta tags | read/write | read/write |
| `created_by`, `deleted_at` | hidden | hidden | read |

Three rules underneath:

1. **A supplier reads their split but cannot change it.** The percentage is a
   commercial agreement, not a product attribute, and a supplier who could edit
   it could re-price the platform's revenue on a Sunday.
2. **`cost_ils` is admin-only, in both directions.** A supplier must not see
   what another supplier's margin implies, and the public must not see it at all.
3. **PUBLIC sees stock as a state, not a number.** "3 left" is a growth tactic
   and also a competitor's inventory report.

### 6.2 How it is enforced

Defence at three layers, because any one of them alone has been wrong before:

- **RLS**, by `auth.uid()` and `current_user_role()`. **No `tenant_id` anywhere.**
  Supplier scoping goes through `supplier_members`.
- **The server action** re-checks the role and **strips** fields outside the
  caller's layer before the row spread. Stripping, not rejecting: a supplier form
  that posts a `platform_percent` it read for display should save the rest, not
  fail.
- **The component** hides what the layer cannot write, so nobody is invited to
  type into a field that will be discarded.

---

## 7. The save path

```
1. parse FormData
2. productSchema.safeParse
      failure -> field-level Hebrew errors, nothing written
3. superRefine cross-field rules (§2.3)
4. completeSplitPair(platform_percent, supplier_split_percent)
      -> the missing side is computed, and the pair is checked against 100
5. money conversion at the boundary:
      ilsToAgorot(value.toFixed(2))   <- string, never a float multiply
6. strip fields outside the caller's visibility layer (§6.2)
7. strip form-only fields that are NOT columns
      recurring_amount_ils is not a column; the column is recurring_amount_agorot
8. upsert products
9. reconcile product_images / variants
10. audit_log row: actor, entity, changes
11. revalidate the PDP, the category page, the search index job
```

### 7.1 Money at the boundary

```ts
ilsToAgorot(recurringAmountIls.toFixed(2))
```

`.toFixed(2)` first, then parse as a **string**. Multiplying a float by 100 is
how `19.99` becomes `1998.9999999999998` and then `1998`. Every money field on
this form goes through `src/lib/money.ts` and lands in the database as an
integer number of agorot.

### 7.2 Error translation

Raw PostgREST errors are translated before they reach the screen:

- `whatsappSchemaError` and `recurringSchemaError` each turn a missing-migration
  error into one Hebrew sentence naming the file to apply.
- Both build their message from **one template literal**, not three joined with
  `+`. Concatenating template literals has already corrupted a production build
  in this repo once: the served bundle lost text and shipped broken JS with a
  200 and no log entry.

---

## 8. RTL

The form is Hebrew and RTL throughout. The parts that are not merely
`dir="rtl"`:

- **Numeric inputs stay LTR** inside an RTL form. A price typed right-to-left is
  a price typed wrong.
- **Currency is a suffix in the reading order**, `₪ 149.00`, matching `he-IL`.
- **Validation messages are Hebrew**, written in the schema itself so the message
  and the rule cannot drift apart.
- **Dates are `he-IL`**, and `offer_valid_until` is entered as a date, never as a
  free string.
- **Slug and SKU inputs are LTR**, because they are identifiers and a mixed
  bidirectional identifier is unreadable and un-copyable.

---

## 9. Gaps this document found

| Gap | Consequence | Where it belongs |
|---|---|---|
| `service` is unreachable from the form | service coupons cannot be created; the 2-day/7-day cancellation cuts have nothing to attach to | add the option, plus a booking-date column |
| `recurring` is in the form and not in the enum | every recurring save fails until 135 is applied; the error is translated but the feature is dark | apply 109, or hide the option behind a flag |
| Generated types predate migration 112 | five columns are read through defensive helpers that exist only for that reason | regenerate `src/types/database.ts`, delete `product-fields.ts` |
| No image processing | a 6000px upload is served as-is; `/_next/image` fails open | a size cap at upload, and a measured decision about resizing |
| `compare_at_price` and `compare_at_price_ils` both exist | one fact, two columns, on the money path | `142_money_integer_fix_in_place.sql` |
| No `delivered_at` | the goods cancellation window is computed from `paid_at`, which is earlier than the law allows | `ARCHITECTURE-REFUNDS-CANCELLATIONS.md` §6 |

None of these are fixed by this document. They are listed in
`MASTER-ARCHITECTURE-v3.md` in dependency order.
