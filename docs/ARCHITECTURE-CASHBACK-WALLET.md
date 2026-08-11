# ארכיטקטורה: ארנק קאשבק (חוזה C1-C7)

חוזה BINDING תמציתי לארנק פנימי: צבירה, מימוש, ledger, בלי cash-out.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-REFERRAL.md
```

מסמך זה הוא **החוזה הקצר**. אם יש סתירה עם טיוטות ישנות: C1-C7 כאן + WALLET-LEDGER גוברים.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| C1 | הארנק הוא אשראי פנימי לשימוש באתר/באפ בלבד. |
| C2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס/מזומן. |
| C3 | יתרות ותנועות: integer **agorot** (1 ₪ = 100). אין float בנתיב הכסף. |
| C4 | כל תנועה = journal כפול-רישום דרך `fn_wallet_transfer` בלבד. |
| C5 | צבירה מ-`paid_on_site_agorot` לפי `cashback_rules`, **אחרי** `paid` בלבד. |
| C6 | מימוש: הפחתה מסכום החיוב באתר בקופה (לפני Cardcom). |
| C7 | מקדמת קופון עצמה לא נכנסת לארנק כ-escrow (No Escrow). |
| C8 | Idempotency: `order:{order_id}:cashback` ו-`order:{order_id}:spend`. |
| C9 | Append-only; תיקון = journal נגדי. |
| C10 | קופון: מימוש רק על חלק האתר; לא על יתרת בית העסק. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| cash-out לבנק "ל-VIP" | C2: אסור לצמיתות; סיכון רגולטורי. |
| ארנק כ-Escrow למקדמת קופון | C7/No Escrow; מקדמה = הכנסת פלטפורמה. |
| earn לפני `paid` (ב-beginCheckout) | chargeback לפני אימות; C5 דוחה. |
| P2P העברה בין משתמשים | C2; fraud + AML. |
| float ILS ב-cashback calc | C3; floor באגורות בלבד. |
| INSERT ישיר ל-wallet מ-client | C4; `fn_wallet_transfer` + service_role. |

---

## 3. סכמת DB

**אין DDL חדש.** שימוש בטבלאות קיימות:

| טבלה | תפקיד |
|---|---|
| `wallet_accounts` | חשבון משתמש `available` + חשבונות פלטפורמה |
| `wallet_entries` | שורות debit/credit append-only |
| `cashback_rules` | אחוז/סכום פעיל לפי סוג מוצר / עדיפות |

```text
balance = sum(credit) - sum(debit)
user available >= 0 תמיד אחרי transfer
```

חשבונות פלטפורמה: `platform:cashback_reserve`, `platform:revenue`, `platform:adjustments`.

נתיב כתיבה יחיד:

```
fn_wallet_transfer
```

EXECUTE: `service_role` בלבד. פירוט: `ARCHITECTURE-WALLET-LEDGER.md`.

---

## 4. צבירה (earn)

```text
הזמנה paid
  → cashback_agorot = floor(paid_on_site_agorot * percent / 100)
  → fn_wallet_transfer(
       from: platform:cashback_reserve → to: user available,
       reason: order_cashback,
       idempotency: order:{order_id}:cashback
     )
```

| כלל | פירוט |
|---|---|
| בסיס | snapshot `paid_on_site_agorot` בלבד |
| בלי rule | 0 |
| כשל אחרי paid | retry אותו מפתח; לא מבטל תשלום |
| Referral | reason נפרד; לא `order_cashback` |

---

## 5. מימוש בקנייה (spend)

```text
cart on-site total = T
wallet apply = W  (0 ≤ W ≤ balance, W ≤ T)
charge Cardcom = T - W
if paid:
  confirm order_spend (idempotency order:{order_id}:spend)
  then earn if rule applies (order:{order_id}:cashback)
```

| כלל | פירוט |
|---|---|
| מתי | ב-checkout, לפני יצירת חיוב Cardcom |
| קופון | W רק מול `coupon_price` |
| כשל Cardcom | reverse / אל תאשר; לא לאבד יתרה בשקט |
| תצוגה | "ימומש מהארנק: ₪X · לתשלום בכרטיס: ₪Y" (RTL) |

---

## 6. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | W > balance ב-UI | server reject; `FOR UPDATE` + cap |
| E2 | paid + earn fail | retry idempotency; alert |
| E3 | spend לפני paid (race) | spend רק ב-finalize אחרי paid |
| E4 | refund מלא אחרי earn | journal נגדי earn/spend |
| E5 | קופון: W על face_value | C10: רק `coupon_price` |
| E6 | replay spend key | journal קיים |
| E7 | אורח עם יתרה (impossible) | ארנק רק למשתמש מחובר |
| E8 | rule expired בין cart ל-paid | snapshot percent ב-order |

---

## 7. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | cap מימוש ארנק פר הזמנה | אין cap v1; min(balance, T) | 2026-08-12 |
| O2 | referral earn timing | reason נפרד; אחרי paid | 2026-08-12 |
| O3 | cutover agorot | WALLET-INTEGER | 2026-08-12 |

---

## 8. Acceptance

- [ ] C1-C7 מיושמים ומתועדים  
- [ ] Earn אחרי paid עם `order:{id}:cashback`  
- [ ] Spend מפחית חיוב Cardcom עם `order:{id}:spend`  
- [ ] אין API משיכה  
- [ ] No Escrow מפורש  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | צבירה + מימוש; ארנק פנימי בלבד |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
