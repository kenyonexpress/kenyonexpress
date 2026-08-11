# ארכיטקטורה: ארנק קאשבק

ארנק **פנימי בלבד** שלא יוצא מהמערכת: ledger כפול-רישום, צבירה, ומימוש בקנייה הבאה.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #18/50

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| C1 | הארנק הוא אשראי פנימי לשימוש באתר/באפ בלבד. |
| C2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס. |
| C3 | יתרות ותנועות: integer **agorot**. |
| C4 | כל תנועה = journal כפול-רישום דרך `fn_wallet_transfer`. |
| C5 | צבירה מ-`paid_on_site_agorot` לפי `cashback_rules`. |
| C6 | מימוש: הפחתה מסכום החיוב באתר בקנייה הבאה (לפני Cardcom). |
| C7 | מקדמת קופון עצמה לא נכנסת לארנק כ-escrow (No Escrow). |

---

## 1. צבירה (earn)

```text
הזמנה paid
  → cashback_agorot = floor(paid_on_site_agorot * percent / 100)
  → fn_wallet_transfer(
       from: platform:cashback_reserve → to: user available,
       reason: order_cashback,
       idempotency: cashback:{order_id}
     )
  → הודעה wallet_activity (אופציונלי)
```

כשל אחרי paid → retry עם אותו מפתח; לא מבטל תשלום.

---

## 2. מימוש בקנייה הבאה (spend)

| כלל | פירוט |
|---|---|
| מתי | ב-checkout, לפני יצירת חיוב Cardcom |
| מקסימום | `min(יתרה, סכום_לתשלום_באתר, cap_אם_מוגדר)` |
| יומן | `order_spend`: user available → platform |
| קופון | ניתן לממש רק על חלק האתר (`coupon_price`), לא על יתרת העסק |
| פיזי | ניתן לממש על סכום העגלה באתר |
| כשל Cardcom אחרי spend | reverse journal או hold+release לפי idempotency; לא לאבד יתרה בשקט |
| תצוגה | "ימומש מהארנק: ₪X · לתשלום בכרטיס: ₪Y" בעברית RTL |

```text
cart on-site total = T
wallet apply = W  (0 ≤ W ≤ balance, W ≤ T)
charge Cardcom = T - W
if paid:
  confirm order_spend journal (idempotency spend:{order_id})
```

---

## 3. Ledger (תמצית)

| טבלה | תפקיד |
|---|---|
| `wallet_accounts` | חשבון משתמש + חשבונות פלטפורמה |
| `wallet_entries` | שורות debit/credit append-only |
| `cashback_rules` | אחוז/סכום פעיל לפי סוג מוצר |

יתרה = sum(credit) − sum(debit). איסור יתרה שלילית ב-available.

פירוט מלא:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
```

---

## 4. UI

| מקום | תוכן |
|---|---|
| `/account/wallet` | יתרה, היסטוריה, "לשימוש באתר בלבד · לא ניתן למשיכה" |
| Checkout | בחירת סכום למימוש / מתג "השתמש ביתרה" |
| Admin | adjust רק super_admin + recent auth + reason |

---

## 5. Acceptance

- [ ] Earn אחרי paid עם idempotency  
- [ ] Spend מפחית חיוב Cardcom בקנייה הבאה  
- [ ] אין API משיכה  
- [ ] קופון: ארנק לא מכסה יתרת בית העסק  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | צבירה + מימוש בקנייה הבאה; ארנק פנימי בלבד |
| 2026-08-12 | batch-2 #18: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #18 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |

## 8. Pass-2 flow (earn / spend)

```text
paid → credit user from cashback_reserve (order:{id}:cashback)
checkout → apply_wallet_ils ≤ balance
finalize → debit user to platform:revenue (order:{id}:spend)
```

אין cash-out. אין P2P. קופון: רק על coupon_price באתר.

