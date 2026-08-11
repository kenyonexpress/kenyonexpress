# ארכיטקטורה: WP Data Migration

חוזה שדות, SEO, כסף, ומה נשאר בארכיון. מימוש ETL ב-WP-MIGRATION.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-MIGRATION.md
docs/ARCHITECTURE-WP-MIGRATION-PLAN.md
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
```

פירוט עמודה ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| DM1 | ייבוא: products, categories, suppliers, images, redirects. לא orders/users WP. |
| DM2 | `platform_percent`: null בייבוא; publish חסום עד admin. |
| DM3 | קופון: `product_type=coupon`; `coupon_price_agorot` מ-meta; face = `price_agorot`. |
| DM4 | פיזי: `price_agorot` + percent admin post-import. |
| DM5 | SEO: `seo_title`, `seo_description` מ-Yoast/meta; enrichment AI אופציונלי. |
| DM6 | Slug יציב; 301 מכל variant URL של WP. |
| DM7 | No Escrow: לא לייבא held/escrow meta כחוב. |
| DM8 | תמונות: alt-text ריק → enrichment queue. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| import wallet balances WP | ledger חדש; לא מקור. |
| map Yoast score ל-ranking | SEARCH: לא boost margin. |
| keep WP permalinks `/shop/` | 301 ל-`/category/`. |
| auto-publish all imports | DM2: draft until %. |
| float prices in DB | agorot integer. |

---

## סכמת DB

יעדי import (קיים + id_map):

```text
products (name_he, slug, description_he, product_type, price_agorot,
          coupon_price_agorot, platform_percent NULL, status draft)
categories (name_he, slug, parent_id)
suppliers (name, wp_vendor_id via id_map)
seo_redirects (from_path, to_path)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | WP sale price expired | use regular; log. |
| CE2 | product_type ambiguous | default physical; flag review. |
| CE3 | Hebrew HTML entities in title | decode + strip. |
| CE4 | orphaned gallery images | skip; images_incomplete. |
| CE5 | vendor without legal name | supplier stub + pending. |
| CE6 | duplicate wp_post_id re-run | upsert idempotent. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | full ACF matrix | WP-IMPORT-MAPPING. |
| O2 | multilingual (en) products | v2. |
| O3 | WP order archive format | CSV only. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | data migration contract |
| 2026-08-12 | batch-2: BINDING קצר |
