# W22 Categories

Code-agent spec. Categories public read. Pending `171_category_name_shekel_order.sql` fixes `under-99` name bidi. `getAllCategories` already repairs on read.

---

## What it builds

1. Apply 171 shekel-order **or** keep read-time repair; feeds/export should match the page.
2. Soft-delete remainder 149 if unapplied: `deleted_at` filter on categories.
3. Admin category CRUD; uploader may draft names, admin publishes.
4. No money on category rows.

---

## Tables

`categories`, `products` category fk, `homepage_sections`.

---

## RLS

Public SELECT active. Staff write. Anon cannot INSERT.

---

## Money invariants

Category name containing ₪ is typography, not a price. Merchant feed still uses product agorot.

---

## Tests before close

`e2e/price-bidi.spec.ts` if present. Category page e2e. Soft-delete hidden.

---

## Feature flag

None.

---

## Docs updated

`MIGRATION-PLAYBOOK.md` (171 filename), `HEBREW-QA.md`.

---

## Edge cases

Duplicate 171 numbers. Full filename. `wp_import.categories` shadow.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| All | כל המוצרים |
| Empty cat | אין מוצרים בקטגוריה הזו |

---

## Open questions

| Q | Best answer |
|---|---|
| Apply 171 now? | Human. Page works without it; exports may disagree until apply. |

---

## Second pass (bidi)

- `171_category_name_shekel_order.md` is a **name** fix for under-99, not FTS. Do not apply the wrong 171.
- Categories are not prices. Soft-delete hides; historical `order_items` keep the name snapshot if present.
- Empty state: אין מוצרים בקטגוריה הזו. Do not show the ₪1 master as a deal.

