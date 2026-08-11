# ארכיטקטורה: WP Migration Plan

חוזה מיפוי שדה-מול-שדה, סדר ייבוא, rollback.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-WP-MIGRATION.md
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
docs/WP-IMPORT-2026-08-07-MAPPING.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| MP1 | סדר: categories → suppliers → media/R2 → products → joins → seo_redirects → verify. |
| MP2 | מיפוי WP `post_name` → `products.slug`; title → `name_he`. |
| MP3 | Woo `_regular_price` / sale → agorot; coupon meta → `coupon_price_agorot`. |
| MP4 | `platform_percent`: **לא** מיובא מ-WP; admin ממלא post-import. |
| MP5 | `import_batch_id` על כל שורה מיובאת; rollback scoped. |
| MP6 | Dry-run → staging review → prod write (MCP approval). |
| MP7 | Cutover: DNS + 301 + WP read-only; לא dual-write. |
| MP8 | הזמנות WP: CSV ארכיון; לא insert ל-`orders`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| parallel import products+categories | MP1: FK category_id. |
| infer platform_percent מ-margin WP | MP4: אין default. |
| live sync WP↔Supabase | cutover חד-פעמי. |
| import users WP ל-auth | Supabase Auth נפרד. |
| skip seo_redirects | SEO parity חוסם cutover. |

---

## סכמת DB

```text
import_batches (id, started_at, status, stats jsonb)
id_map (source_type, source_id, target_table, target_id)
products.wp_legacy_id (optional via id_map)
seo_redirects
```

DDL: `import_batches` / `id_map` במיגרציות pending. לא db push.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | WP product variable | map ל-variant או skip + log. |
| CE2 | category depth >2 | flatten ל-2 ביעד. |
| CE3 | Hebrew slug broken | normalize; fallback `product-{id}`. |
| CE4 | duplicate SKU | second → draft + alert. |
| CE5 | rollback mid-batch | soft-delete by batch_id. |
| CE6 | prod write בלי dry-run OK | gate block. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | ACF fields mapping sheet | WP-IMPORT-MAPPING doc. |
| O2 | variable products v2 | out of scope v1. |
| O3 | automated verify CI | post-import script. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | mapping contract |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
