# ארכיטקטורה: הפניות ושותפים (Referrals & Affiliates)

מסמך **תמציתי** ל-affiliate tracking (`?ref=`) לצד referral פנימי (`ARCHITECTURE-REFERRAL.md`).

Status: **BINDING (lite)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. קופון prepaid לא משתנה.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/BUSINESS-MODEL.md
```

Schema sketch: migrations `010_referrals_*`. הפעלה רק עם fraud rules.

---

## 0. החלטה (RA1 עד RA6)

| # | הכרעה |
|---|---|
| RA1 | Referrer (customer): בונוס ארנק על הזמנה paid ראשונה של invitee. |
| RA2 | Affiliate: `?ref=` tracking; payout נפרד מקופון prepaid. |
| RA3 | Attribution window: 30 יום last-click (מתועד). |
| RA4 | Credit = wallet / affiliate balance; לא cash-out לכרטיס by default. |
| RA5 | Self-referral חסום. |
| RA6 | Admin clawback על fraud/refund. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| affiliate = אותו מנוע כמו `/r/{code}` | confusion; שני surfaces |
| payout ישיר ל-PayPal affiliate | RA4; תפעול v2 |
| multi-level MLM | legal + fraud |
| affiliate משנה `platform_percent` | RA6; admin only |
| cookie ללא expiry | RA3; 30d window |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** ראה `010_referrals_*`:

| טבלה | שימוש |
|---|---|
| `affiliates` | partner account, rate |
| `affiliate_clicks` | `?ref=` attribution |
| `affiliate_commissions` | owed balance, status |
| `referrals` | customer referral (REFERRAL.md) |

---

## 3. Surfaces

| Surface | תיאור |
|---|---|
| Account | share link `/r/{code}` |
| Admin | affiliates table, approve/deny |
| Analytics KPI | referred GMV, conversion |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RA-E1 | `?ref=` + `/r/` conflict | last-touch wins; log both |
| RA-E2 | affiliate cookie + adblock | fallback query param on checkout |
| RA-E3 | refund on referred order | clawback commission |
| RA-E4 | affiliate = supplier same entity | conflict review |
| RA-E5 | expired affiliate inactive | clicks ignored |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | affiliate payout batch job | 2026-08-12 |
| O2 | חוזה affiliate legal template | 2026-08-12 |
| O3 | unify reporting with REFERRAL | 2026-08-12 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Referrals lite |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
