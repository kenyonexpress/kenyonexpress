# WordPress Import Mapping (2026-08-07)

דוח מיפוי ומה נכתב בפועל.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מקור:

```
data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml
```

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| I1 | **19 products** נוספו כ-`draft` בלבד. |
| I2 | **61→61 active** (אין שינוי storefront). |
| I3 | **0** `platform_percent` על imports (C1). |
| I4 | `emit-missing-products.mjs` במקום project עם default 10%. |
| I5 | תמונות: legacy origin עד R2 upload. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| `04-project-public.mjs` defaults | 10% / 15% / 365 אסורים |
| publish on import | assertPublishable |
| delete 34 demo rows | stop-and-ask |
| slug rename silent | breaks links |

---

## 3. סכמת DB

| מדד | before → after |
|---|---|
| products | 61 → 80 |
| imported draft | 19 |
| active | 61 → 61 |
| with platform_percent (new) | 0 |
| demo flagged | 34 |

עמודות: `attributes.imported_from`, `slug_title_mismatch`, `demo`.

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | dead SUPABASE_SECRET_KEY locally |
| E2 | 13/19 no category |
| E3 | 5 slug/title mismatch |
| E4 | apex image host allowlist |
| E5 | coupon-test excluded manually |

---

## 5. פתוחות

| # | פעולה |
|---|---|
| O1 | upload 66 images (service key) |
| O2 | set percent+supplier per draft |
| O3 | fix 5 slug mismatches before publish |
| O4 | WC REST for redirect parity |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2 |
| 2026-08-07 | mapping report |
