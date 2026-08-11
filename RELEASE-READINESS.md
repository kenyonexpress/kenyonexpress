# RELEASE-READINESS

מוכנות שחרור: איכות, אבטחה, כסף, תפעול.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
GO-LIVE.md
docs/ARCHITECTURE-TESTING.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-BACKUP-DR.md
```

מודל כסף: **No Escrow**.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| R1 | Release = docs+code+ops gates; לא רק build ירוק. |
| R2 | כסף: test + type-check + lint על מסלולי checkout/redeem. |
| R3 | אין כתיבת כסף מלקוח (RLS). |
| R4 | Backup/PITR מאומת לפני GA. |
| R5 | Runbook תקריות + ntfy/Sentry מחוברים. |
| R6 | No Escrow בכל קופי שחרור. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| שחרור בלי E2E כסף | סיכון פרוד. |
| שחרור עם מדדי escrow_held | מודל שגוי. |
| דילוג על webhook tests | כפילויות תשלום. |

---

## 2. סכמת DB

אימות migrations שהוחלו + RLS. אין DDL בשחרור בלי אישור.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `ci_red` | חוסם שחרור |
| `drift_docs_money` | גובר No Escrow docs; לתקן קוד |
| `missing_cron_secret` | חוסם expire/retry |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | סף coverage מדויק | שערי E2E כסף מספיקים ל-GA |
| O2 | load test חובה | מומלץ; לא חוסם soft-open קטן |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING תמציתי batch-2 |
