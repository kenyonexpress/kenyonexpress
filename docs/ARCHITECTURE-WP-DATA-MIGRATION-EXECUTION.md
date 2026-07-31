# ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md

תוכנית **ביצוע** למיגרציית נתוני WordPress → KenyonExpress (WXR-first).

Status: BINDING execution runbook · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: `ke-arch-wp/docs/ARCHITECTURE-WP-MIGRATION.md`, `data-import/wp-backup/`, Go-Live checklist.

קלט קנוני:

```
data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml
```

(לא לקומיט XML גדול; gitignore על `*.xml` תחת `data-import/`.)

---

## 0. עקרונות ביצוע

1. **WXR-first:** parse → normalize → stage → curation → project → integrity.
2. **Dry-run חובה** לפני כתיבה ל-prod.
3. הזמנות מ-WP: **headers בלבד** (בלי לשחזר תשלומי Cardcom ישנים כאילו חיים).
4. סיסמאות WP לא עוברות; משתמשים עוברים ל-Google OAuth בשימוש הבא.
5. כסף: מוצרים חיים חייבים `platform_percent` + `coupon_price_ils` תקינים לפני publish.
6. אין Escrow בשורות מיובאות.

---

## 1. סביבות

| סביבה | שימוש |
|---|---|
| Local Supabase | פיתוח סקריפטים |
| Staging DB | dry-run מלא + השוואות |
| Production | רק אחרי חתימת בעלים + גיבוי |

פקודות רצות מ:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

(או worktree ייעודי `ke-wpmig`), לא מתיקיות מקוננות.

---

## 2. שלבי הביצוע (סדר קשיח)

### Phase A: הכנה

| # | פעולה | פלט |
|---|---|---|
| A1 | גיבוי DB יעד (PITR/snapshot) | backup id |
| A2 | העתקת WXR ל-`data-import/wp-backup/` | path |
| A3 | אימות checksum / גודל קובץ מול המקור | log |
| A4 | הקפאת כתיבות קטלוג ידניות בזמן החלון | announce |

### Phase B: Parse + Normalize

| # | פעולה | פלט |
|---|---|---|
| B1 | פרסור WXR → JSON/NDJSON גולמי | `staging/raw/` |
| B2 | נרמול: מוצרים, קטגוריות, מדיה, משתמשים, הזמנות(headers) | `staging/normalized/` |
| B3 | דוח שגיאות פרסור (XML שבור, CDATA) | `reports/parse-errors.md` |

### Phase C: Stage tables

טבלאות `wp_import.*` (או מקבילות מ-032):

- products, variants, categories, media, customers, orders_headers, term_map

| # | פעולה |
|---|---|
| C1 | Truncate stage (staging env בלבד) |
| C2 | Bulk load idempotent |
| C3 | אינדקסים + ספירות מול WXR |

### Phase D: Curation (אנושי + כללים)

חוסמים ידועים (B1 עד B6 מהמסמך האח) חייבים פתרון או waive חתום:

| Blocker | נושא |
|---|---|
| B1 | מוצרים בלי מחיר קופון / percent |
| B2 | מדיה חסרה / URL שבור |
| B3 | קטגוריות יתומות |
| B4 | כפילויות SKU/slug |
| B5 | ספק לא ממופה |
| B6 | תוכן משפטי/HTML מסוכן |

פלט: `reports/curation-signoff.md` עם חתימה.

### Phase E: Project ל-public

| סדר | ישות | הערות |
|---|---|---|
| 1 | categories | slugs יציבים + 301 map |
| 2 | suppliers/vendors map | חובה לפני products |
| 3 | products + images | draft קודם, publish אחרי QA |
| 4 | coupon fields | `coupon_price_ils`, expiry |
| 5 | platform_percent | חובה לפני live |
| 6 | customers (profiles stub) | בלי סיסמה |
| 7 | orders headers | read-only history |
| 8 | redirects WP→Next | טבלת 301 |

Idempotent: מפתחות `wp_post_id` / `meta` שמורים ב-`migration_map`.

### Phase F: Integrity

| בדיקה | צפי |
|---|---|
| ספירת מוצרים מפורסמים | ≈ יעד עסקי |
| כל קופון חי עם coupon_price > 0 | 0 מפרים |
| כל פיזי חי עם platform_percent | 0 מפרים |
| תמונות 404 sample ≤ סף | |
| קישורי 301 מדגם | |
| חיפוש Meili sync | |

### Phase G: Cutover

```
1. Maintenance flag / read-only WP
2. Final delta import (אם יש)
3. DNS כבר על Next (או להישאר)
4. Meili reindex
5. Smoke Go-Live subset (PDP מחיר, cart, search)
6. ניטור 24ש
```

Rollback: השארת draft unpublished; שחזור snapshot אם project ל-prod נכשל.

---

## 3. מיפוי שדות קריטי

| WP | KE |
|---|---|
| post_title | `products.name_he` |
| post_name | `slug` |
| _price / meta קופון | `coupon_price_ils` או `price_ils` |
| product_cat | categories M2M |
| guid/upload | R2 + `media_assets` |
| customer email | `profiles` / auth invite later |
| shop_order | `orders` header only |

אסור לגזור `coupon_price` כ-10% אוטומטי בלי חתימת curation.

---

## 4. סקריפטים / פקודות (חוזה)

```
pnpm wp:parse --input data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml
pnpm wp:normalize
pnpm wp:stage --env staging
pnpm wp:curate-report
pnpm wp:project --env staging --dry-run
pnpm wp:integrity --env staging
pnpm wp:project --env production   # רק אחרי חתימה
pnpm search:reindex
```

שמות הסקריפטים ליישור מול `package.json` בפועל ב-`feat/wp-migration`.

---

## 5. אבטחה ופרטיות

- WXR עלול להכיל אימיילים/טלפונים: לא לקומיט ל-git.
- Stage RLS: admin/service בלבד.
- לוגים בלי PII מלא ב-CI ציבורי.

---

## 6. שערי יציאה (Definition of Done)

- [ ] Dry-run staging ירוק
- [ ] Curation signoff חתום
- [ ] Integrity PASS
- [ ] מדגם 20 מוצרים: מחיר PDP = קופה
- [ ] 301 מדגם מ-URLs חיים
- [ ] Meili מחזיר תוצאות עברית
- [ ] Backup לפני prod project

---

## 7. תפקידים

| תפקיד | אחריות |
|---|---|
| הנדסה | סקריפטים, stage, project |
| תוכן | curation מחירים/קופונים |
| בעלים | חתימת cutover |
| QA | integrity + smoke |

---

## 8. Cutover day (hour-by-hour)

```
T-24h  backup prod + freeze WP catalog edits
T-4h   final WXR export → stage refresh → dry-run
T-2h   curation signoff checklist complete
T-1h   Meili reindex staging; spot-check 20 SKUs
T0     project to prod (batched); enable 301 map
T+30m  smoke: home, category, PDP price, search, cart
T+2h   Search Console submit sitemap; watch 404s
T+24h  integrity job; fix orphans; declare cutover done
```

Rollback: keep old WP read-only; revert DNS only if storefront deploy failed (data project rollback is restore-from-backup, not "undo WXR").

---

## 9. Blockers B1–B6 (must clear before prod project)

| ID | Blocker | Clear when |
|---|---|---|
| B1 | Live products missing `platform_percent` | curation fill + constraint |
| B2 | Coupons missing `coupon_price_ils` | absolute prices set |
| B3 | Orphan supplier links | map or quarantine |
| B4 | Image URLs unreachable | R2 upload / rewrite |
| B5 | Slug collisions | disambiguation table |
| B6 | Order money rows treated as live Cardcom | headers-only confirmed |

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Runbook ביצוע WXR-first ל-`arch/docs-queue` |
| 2026-07-31 | rev B: cutover timeline + blockers B1–B6 |
