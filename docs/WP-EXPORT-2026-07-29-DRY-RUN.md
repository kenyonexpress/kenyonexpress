# WP Export Dry Run (2026-07-29)

**Snapshot היסטורי** של dry-run ייבוא WXR. ~513 שורות probes: git history.

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

מקור:

```
data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml
```

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| W1 | dry-run **BLOCKED** (4 gates); לא נכתב DB. |
| W2 | 625 items: 48 products, 0 shop_coupon. |
| W3 | **11** `product_cat` (לא 28; bug parser תוקן). |
| W4 | WP = מקור מיגרציה בלבד; stack = Next. |
| W5 | אין default `platform_percent` בייבוא (C1). |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| project stage עם DEFAULT 10% | C1 |
| apply בלי gates | redirect/media parity |
| REST בלי WC keys | 401; WXR fallback |
| full 625 import | attachments/nav noise |

---

## 3. סכמת DB

| entity (dry) | rows |
|---|---:|
| categories | 11 |
| products | 44-46 |
| media refs | 66 |
| redirects | 98-103 |
| orders | 0 |

טבלאות staging: `wp_import.*` (ראה ARCHITECTURE-WORDPRESS-IMPORT).

---

## 4. מקרי קצה

| # | gate |
|---|---|
| E1 | media_uploaded 0/66 dry |
| E2 | redirect_coverage 98/103 |
| E3 | live_count_parity needs WC API |
| E4 | blog terms vs product_cat |
| E5 | slug/title mismatch (5 rows) |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | service key for upload |
| O2 | WC_KEY for parity |
| O3 | 19 drafts need percent+supplier |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING snapshot |
| 2026-07-29 | dry run |
