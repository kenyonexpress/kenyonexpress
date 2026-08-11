# מפרט ארנק קאשבק

מפרט מוצר/זרימה לארנק פנימי באגורות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. **No Escrow**; agorot integer בלבד.

מסמכים קשורים (מקור מימוש):

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-MONEY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| W1 | אשראי פנימי בלבד; **אין** משיכה לבנק/כרטיס. |
| W2 | צבירה (earn): על `paid_on_site_agorot` אחרי order `paid`; idempotency `cashback:{order_id}`. |
| W3 | מימוש (spend): `min(יתרה, סכום_באתר, cap)`; Cardcom = on-site − wallet. |
| W4 | קופון: צבירה על חלק האתר בלבד; לא על יתרת העסק. |
| W5 | כשל תשלום אחרי spend: reverse/hold+release; יתרה לא נעלמת. |
| W6 | ביטול הזמנה: reverse earn אם כבר נזקף. |
| W7 | EXECUTE wallet: service-role בלבד (SEC-WALLET). |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| cash-out לבנק | W1: לא מוצר. |
| float ביתרה | agorot integer. |
| Escrow על מקדמת קופון | No Escrow. |
| ארנק לאורח | הרשמה חובה. |
| העברה בין משתמשים | out of scope MVP. |

---

## סכמת DB

```text
wallet_accounts
  user_id, balance_agorot bigint

wallet_ledger
  id, user_id, amount_agorot, kind (earn|spend|reverse)
  idempotency_key, order_id nullable, created_at

cashback_rules
  percent / fixed_agorot, active
```

פירוט RLS: `ARCHITECTURE-WALLET-LEDGER.md`.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | earn כפול לאותה הזמנה | idempotency חוסם |
| CE2 | spend > יתרה | דחייה ב-checkout |
| CE3 | refund מלא אחרי earn | reverse ledger |
| CE4 | velocity earn חשוד | manual_review |
| CE5 | אורח מנסה spend | אין ארנק |
| CE6 | כשל Cardcom אחרי hold | release יתרה |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | תוקף נקודות | phase 2. |
| O2 | המרה לקופון מתנה | out of scope. |
| O3 | earn async retry | NOTIFICATIONS. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | rev A: earn/spend UI |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
