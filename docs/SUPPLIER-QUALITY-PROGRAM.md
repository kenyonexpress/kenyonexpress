# תוכנית איכות ספקים

תקציר BINDING. פירוט:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/DISPUTE-RESOLUTION.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

Status: **BINDING (policy)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
`platform_percent` לא משתנה כעונש; boost נפרד.

---

## החלטה

| # | הכרעה |
|---|---|
| SQ1 | `supplier_quality_score` 0-100; חלון 90 יום. |
| SQ2 | רכיבים: redeem success 30%, disputes 25%, response 15%, no-show 15%, ratings 15%. |
| SQ3 | ספי: ≥80 boost; 30-49 warning; <30 or 3 P1 disputes → suspend listings. |
| SQ4 | שימוע: notice → response 5bd → decision → one appeal 7d → audit_log. |
| SQ5 | fraud/double redeem → immediate suspend. |
| SQ6 | **לא** משנים `platform_percent` אוטומטית. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| penalty percent | SQ6; pricing separate |
| public NPS mandatory MVP | internal score |
| delete supplier history on suspend | money audit |
| Escrow in dispute copy | No Escrow |

---

## סכמת DB

```text
suppliers.status
audit_log (appeals)
disputes / support tickets (sources for score)
products.status (pause on suspend)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | new supplier <10 redeems | probation, no auto suspend |
| CE2 | sold coupons during suspend | DISPUTE policy |
| CE3 | false dispute spike | fraud review |
| CE4 | boost abuse | paid FEATURED separate |
| CE5 | score without PII leak | portal aggregate only |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | automated score job |
| O2 | customer rating post-redeem |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
