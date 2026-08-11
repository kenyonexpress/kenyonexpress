# ארכיטקטורה: ארנק קאשבק (Cashback)

אשראי פנימי בלבד, ledger באגורות, בלי משיכה החוצה, וכללי צבירה עתידיים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/CASHBACK-WALLET-SPEC.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-REFERRAL.md
docs/CONTRADICTIONS.md
```

**יחס ל-`ARCHITECTURE-CASHBACK-WALLET.md`:** שני המסמכים BINDING ומיושרים. מסמך זה = מחזור צבירה/מימוש + כללי עתיד. CASHBACK-WALLET נשאר לתמצית הכרעות C1-C7. LEDGER = חוזה journal.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| WC1 | הארנק פנימי לשימוש באתר/באפ בלבד. |
| WC2 | **אין cash-out**, אין P2P, אין המרה לכרטיס/בנק. |
| WC3 | יתרות ותנועות: integer **agorot** בלבד. |
| WC4 | כל תנועה = כפול-רישום דרך `fn_wallet_transfer` (+ idempotency_key). |
| WC5 | מקדמת קופון אינה נכנסת לארנק כ-escrow (No Escrow). |
| WC6 | מימוש רק על סכום לתשלום **באתר** לפני Cardcom. |
| WC7 | צבירה אחרי `paid` בלבד; מפתח `cashback:{order_id}`. |

---

## 1. Ledger באגורות

| ישות | תפקיד |
|---|---|
| `wallet_accounts` | user available + חשבונות פלטפורמה (`cashback_reserve`, `revenue`, …) |
| `wallet_transactions` / entries | debit/credit append-only |
| יתרה מוצגת | cache מחושב; job שלמות מול journal |

תיקון טעות = תנועת פיצוי חדשה; לא UPDATE על שורה ישנה.

---

## 2. צבירה (earn)

```text
order paid
  → base = paid_on_site_agorot (אחרי wallet spend אם היה)
  → cashback = floor(base * rule_percent / 100) או סכום קבוע מ-rule
  → fn_wallet_transfer(
       platform:cashback_reserve → user,
       reason: order_cashback,
       idempotency: cashback:{order_id}
     )
```

| כלל נוכחי | פירוט |
|---|---|
| בסיס | רק מה ששולם באתר (לא face, לא יתרת עסק) |
| כשל אחרי paid | retry אותו מפתח; לא מבטל Cardcom |
| מוצר בלי rule | 0; לא ממציאים אחוז |

---

## 3. מימוש (spend)

```text
checkout:
  T = on_site total agorot
  W = min(balance, T, cap?)
  Cardcom charge = T - W
  on paid: confirm spend journal spend:{order_id}
  on failed/cancel before paid: reverse / אל תאשר spend
```

קופון: רק על `coupon_price`. פיזי: על סכום העגלה באתר.

---

## 4. כללי צבירה עתידיים (לא soft-open חובה)

| Rule ID | רעיון | תלות |
|---|---|---|
| F1 | אחוז דיפרנציאלי לפי `product.type` | `cashback_rules` |
| F2 | תקרת צבירה חודשית למשתמש | cron + counter |
| F3 | בונוס referral נפרד (כבר יש REFERRAL) | לא לערבב עם order_cashback |
| F4 | תוקף יתרה (expiry לזכות ישנה) | journal expire → reserve |
| F5 | מבצע כפל קאשבק בחלון זמן | כמו flash; שעון שרת |
| F6 | אין צבירה על סכום ששולם מארנק | מונע לופ |

עד הפעלה: rule table ריקה או percent=0 = אין earn.

---

## 5. מה אסור

- משיכה / ביט / העברה למשתמש אחר  
- הצגת יתרת ארנק כ"כסף נאמן" / Escrow  
- צבירה על יתרה שתשולם בעסק  
- כתיבת יתרה בלי journal  

---

## 6. Acceptance

- [ ] Agorot + double-entry מתועדים  
- [ ] אין cash-out  
- [ ] Earn/spend idempotent  
- [ ] No Escrow מפורש  
- [ ] טבלת כללי עתיד F1-F6  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: earn/spend, ledger agorot, future accrual rules |
