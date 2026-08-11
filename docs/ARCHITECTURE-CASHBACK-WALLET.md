# ארכיטקטורה: ארנק קאשבק (חוזה C1-C7)

חוזה BINDING תמציתי לארנק פנימי: צבירה, מימוש, ledger, בלי cash-out.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #18/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.

מסמכים קשורים (פירוט מורחב):

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

מסמך זה הוא **החוזה הקצר**. אם יש סתירה עם טיוטות ישנות: C1-C7 כאן + WALLET-CASHBACK/LEDGER גוברים.

---

## 0. הכרעות (C1-C7)

| # | הכרעה |
|---|---|
| C1 | הארנק הוא אשראי פנימי לשימוש באתר/באפ בלבד. |
| C2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס/מזומן. |
| C3 | יתרות ותנועות: integer **agorot** (1 ₪ = 100). אין float בנתיב הכסף. |
| C4 | כל תנועה = journal כפול-רישום דרך `fn_wallet_transfer` בלבד. |
| C5 | צבירה מ-`paid_on_site_agorot` לפי `cashback_rules`, **אחרי** `paid` בלבד. |
| C6 | מימוש: הפחתה מסכום החיוב באתר בקופה (לפני Cardcom). |
| C7 | מקדמת קופון עצמה לא נכנסת לארנק כ-escrow (No Escrow). |

הרחבות מחייבות לצד החוזה:

| # | תוספת |
|---|---|
| C8 | Idempotency: `order:{order_id}:cashback` ו-`order:{order_id}:spend`. |
| C9 | Append-only; תיקון = journal נגדי. |
| C10 | קופון: מימוש רק על חלק האתר; לא על יתרת בית העסק. |

---

## 1. צבירה (earn)

```text
הזמנה paid
  → cashback_agorot = floor(paid_on_site_agorot * percent / 100)
       או flat_agorot מ-rule
  → fn_wallet_transfer(
       from: platform:cashback_reserve → to: user available,
       reason: order_cashback,
       idempotency: order:{order_id}:cashback
     )
  → הודעה wallet_activity (אופציונלי, לא חוסם)
```

| כלל | פירוט |
|---|---|
| בסיס | snapshot `paid_on_site_agorot` בלבד |
| בלי rule | 0 |
| כשל אחרי paid | retry אותו מפתח; לא מבטל תשלום |
| Replay | journal קיים; אין זיכוי כפול |
| Referral | reason נפרד; לא `order_cashback` |

---

## 2. מימוש בקנייה (spend)

| כלל | פירוט |
|---|---|
| מתי | ב-checkout, לפני יצירת חיוב Cardcom |
| מקסימום | `min(יתרה, סכום_לתשלום_באתר, cap_אם_מוגדר)` |
| יומן | `order_spend`: user available → platform:revenue |
| מפתח | `order:{order_id}:spend` |
| קופון | רק על `coupon_price` |
| פיזי | על סכום העגלה באתר |
| כשל Cardcom | reverse / אל תאשר; לא לאבד יתרה בשקט |
| תצוגה | "ימומש מהארנק: ₪X · לתשלום בכרטיס: ₪Y" (RTL) |

```text
cart on-site total = T
wallet apply = W  (0 ≤ W ≤ balance, W ≤ T)
charge Cardcom = T - W
if paid:
  confirm order_spend (idempotency order:{order_id}:spend)
  then earn if rule applies (order:{order_id}:cashback)
```

ולידציה מוקדמת ב-UI/`beginCheckout` אינה תחליף ל-`FOR UPDATE` + UNIQUE ב-DB.

---

## 3. Ledger (תמצית חוזה)

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

EXECUTE: `service_role` בלבד. פירוט:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
```

---

## 4. UI (מינימום מחייב)

| מקום | תוכן |
|---|---|
| `/account/wallet` | יתרה, היסטוריה, "לשימוש באתר בלבד · לא ניתן למשיכה" |
| Checkout | מתג/סכום מימוש; חיוב כרטיס = T − W |
| Admin | adjust רק super_admin + recent auth + reason + audit |

אין endpoint / כפתור cash-out.

---

## 5. אינווריאנטות

| # | טענה |
|---|---|
| I1 | אין תנועה בלי journal מאוזן |
| I2 | אין יתרת משתמש שלילית |
| I3 | מפתח cashback/spend חד-פעמי להזמנה |
| I4 | אין payout/משיכה מארנק משתמש |
| I5 | ארנק ≠ מקדמת קופון / Escrow |
| I6 | סכומים באגורות integer אחרי cutover |

---

## 6. Acceptance

- [ ] C1-C7 מיושמים ומתועדים  
- [ ] Earn אחרי paid עם `order:{id}:cashback`  
- [ ] Spend מפחית חיוב Cardcom עם `order:{id}:spend`  
- [ ] אין API משיכה  
- [ ] קופון: ארנק לא מכסה יתרת בית העסק  
- [ ] No Escrow מפורש  
- [ ] Agorot; אין float בנתיב  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | צבירה + מימוש בקנייה הבאה; ארנק פנימי בלבד |
| 2026-08-12 | batch-2 #18: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #18 pass-2: חוזה C1-C7 (+C8-C10) מלא ומקושר |
