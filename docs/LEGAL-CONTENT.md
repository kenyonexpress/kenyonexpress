# תוכן משפטי (טיוטה)

תקציר BINDING לנוסח אתר. **לא ייעוץ משפטי.** פירוט:

```
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/LEGAL-TERMS-SUPPLIERS.md
```

Status: **BINDING (draft copy)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; agorot; platform_percent פר מוצר.

Routes:

```
/terms
/cancellation
/accessibility
/cookies
```

---

## החלטה

| # | הכרעה |
|---|---|
| LG1 | הפלטפורמה **לא הספק**; אחריות שירות על הספק. |
| LG2 | קופון: `coupon_price` באתר; יתרה בעסק; **100% prepaid לפלטפורמה**; **No Escrow**. |
| LG3 | פיזי: מחיר מלא באתר; split פנימי לפי percent (לא משנה מחיר לקוח). |
| LG4 | ארנק: קרדיט פנימי; לא משיכה החוצה. |
| LG5 | ביטולים: לפי חוק + `REFUNDS-CANCELLATION-POLICY.md`. |
| LG6 | `[דורש עו"ד]` לפני publish. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| "כסף בנאמנות לספק" | No Escrow |
| עמלה קבועה בטקסט | C1 |
| KE אחראית לטיב שירות בעסק | LG1 |

---

## סכמת DB

```text
legal_page_versions (if used): slug, wording_version, published_at
consent_events
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | נוסח |
|---|---|---|
| CE1 | redeemed coupon dispute | ספק ראשון |
| CE2 | expired unredeemed | wallet/policy |
| CE3 | physical refund post-ship | supplier + KE policy |
| CE4 | minor user | age gate counsel |
| CE5 | marketing unsubscribe | 30א |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | full Hebrew terms body (counsel) |
| O2 | cookie categories + Consent Mode |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING pointer; mega dump → ARCHITECTURE-LEGAL |
