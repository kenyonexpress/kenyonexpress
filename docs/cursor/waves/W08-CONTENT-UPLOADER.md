# W08 Content uploader

Code-agent spec. Live role `content_uploader`. Catalogue write. **No money.** Existing tests: `uploader-prohibitions.test.ts`, `uploader-policy.test.ts`, `permissions.test.ts`.

---

## What it builds

1. Uploader reaches catalogue admin sections only (`requireSection`). Products, categories, images, homepage CMS.
2. Cannot: refund, redeem, change `platform_percent` / `coupon_price_ils` / wallet, open payouts, apply migrations, toggle kill switches that close checkout.
3. Image pipeline: signed R2 PUT, MIME allowlist, Hebrew alt required before publish.

---

## Tables

`products` (non-money columns if split; if one row, money columns must be admin-only at the action layer even if the table is shared), `categories`, `product_images`, `media_assets`, `homepage_sections`, `banners`.

---

## RLS

Policies that allow `content_uploader` UPDATE on money columns are **gaps** (`docs/cursor/rls/GAPS.md` if present; else `RLS-CATALOG.md`). Actions must `requireSection` even if RLS is loose.

---

## Money invariants

Uploader must not save a product that becomes sellable with a missing percent or a float price. If the form includes money fields, 403. Prefer two-step: uploader drafts, admin sets money and publishes.

---

## Tests before close

Every money server action lists uploader as 403. Cannot call `refundOrder`, `redeemAdminVoucher`, `beginCheckout` as staff bypass. Audit on any product status change.

---

## Feature flag

None. Role is the gate.

---

## Docs updated

`ROLE` docs, `ADMIN-HANDBOOK.md`, `RLS-CATALOG.md`, `CONTENT-UPLOAD` flow if written.

---

## Edge cases

- Uploader shopping as customer: normal `customer` policies on the storefront client. Do not use staff JWT on catalogue public reads (`createPublicClient` stays anon).
- Bulk CSV: uploader cannot import `platform_percent`.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Nav money hidden | (section omitted, not "אין הרשאה" on every link) |
| 403 | אין הרשאה לפעולה הזו |
| Alt required | חובה טקסט חלופי בעברית לפני פרסום |
| Draft | טיוטה |

---

## Open questions

| Q | Best answer |
|---|---|
| Can uploader set stock? | **No** by default (fraud via infinite coupon stock). Admin only unless product reverses W24 leftover. |
| Can uploader publish? | **No.** Status `active` is admin. |

---

## Second pass (after contracts)

- Role: `content_uploader` is not vendor, not till (`contracts/ROLE-VENDOR.md`).
- Cache: new images invalidate catalogue CDN; never cache signed upload URLs (`contracts/CACHE-POLICY.md`).
- Rate limit: MIME allowlist plus size cap; no money fields on the form (`contracts/RATE-LIMITS.md`).
- Audit every publish/reject (`contracts/AUDIT-LOG.md`).
- Alt text Hebrew required before `active` (`quality/A11Y-CHECKLIST.md`).
