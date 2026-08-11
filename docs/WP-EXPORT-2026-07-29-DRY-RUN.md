# WP-EXPORT Dry Run (2026-07-29)

סיכום BINDING לריצת ייצוא WordPress. הפירוט הגולמי ב-git history.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

מסמכים קשורים:

```
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
docs/ARCHITECTURE-WP-MIGRATION.md
```

מודל כסף: **No Escrow**. בייבוא לא ליצור held.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| W1 | Dry-run לא כותב לפרוד. |
| W2 | מיפוי מוצרים חייב `platform_percent` לפני publish. |
| W3 | קופון: `coupon_price` מוחלט; לא אחוז ניחוש. |
| W4 | מדיה דרך pipeline ייעודי; לא hotlink לנצח. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ייבוא ישיר לפרוד בלי dry-run | סיכון קטלוג. |
| default 5% עמלה בייבוא | CONTRADICTIONS C1. |

---

## 2. סכמת DB

Staging `wp_import.*` + מיפוי ל-`products`/`categories`. אין DDL כאן.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `missing_coupon_price` | לא publish |
| `orphan_media` | תור תיקון |
| `duplicate_slug` | rename/map |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | האם כל ה-WXR בגיבוי מקומי | כן לפי data-import |
| O2 | ספקים חסרים ב-export | יצירה ידנית לפני publish |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | קיצור BINDING; dump מלא ב-history |
