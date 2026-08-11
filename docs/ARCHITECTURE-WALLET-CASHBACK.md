# ארכיטקטורה: ארנק קאשבק (Cashback)

קאשבק פנימי בלבד (לא יוצא החוצה), חשבונאות double-entry באגורות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/CASHBACK-WALLET-SPEC.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. מקדמת קופון אינה נכנסת לארנק כנאמן. אגורות integer.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| WC1 | הארנק פנימי לשימוש באתר/באפ בלבד. |
| WC2 | **אין cash-out**: לא בנק, לא כרטיס, לא מזומן, לא P2P, לא ביט. |
| WC3 | יתרות ותנועות: integer **agorot** בלבד. אין float. |
| WC4 | כל תנועה = double-entry דרך `fn_wallet_transfer` (או מקביל) + `idempotency_key` UNIQUE. |
| WC5 | Earn רק אחרי `paid`. Spend רק על סכום **באתר** (לא יתרת עסק). |
| WC6 | מפתחות: `order:{order_id}:cashback`, `order:{order_id}:spend`. |
| WC7 | אין צבירה על חלק ששולם מארנק (מונע לופ), אלא rule מפורש. |
| WC8 | תיקון טעות = journal פיצוי חדש; אסור UPDATE/DELETE שורות ישנות. |
| WC9 | חשבונאות: זיכוי קאשבק מ-`platform:cashback_reserve`; spend ל-`platform:revenue`. |
| WC10 | מע״מ: קאשבק אינו מחליף חשבונית; טיפול מס לפי INVOICING/ייעוץ (לא מזיכוי ארנק). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| משיכה לכרטיס/בנק | הופך לכסף יוצא; רגולציה + fraud; WC2. |
| יתרה ב-float / ILS numeric | שובר אגורה; MONEY. |
| כתיבת `balance` בלי journal | אין audit; SEC-WALLET. |
| Earn לפני paid | זיכוי על תשלום שלא נסגר. |
| כיסוי יתרת קופון בעסק מארנק | מחוץ לפלטפורמה; לא. |
| Escrow של מקדמה בארנק | No Escrow. |
| P2P בין משתמשים | abuse + AML. |

---

## 2. סכמת DB (קיים/יעד; אין DDL כאן)

| ישות | תפקיד |
|---|---|
| `wallet_accounts` | חשבון משתמש `available` + חשבונות פלטפורמה |
| `wallet_entries` / journals | append-only |
| `wallet_balances` | cache תצוגה; לא מקור אמת |
| `cashback_rules` | percent/flat + חלונות |
| `cashback_reversal_debts` | חובות קיזוז אחרי refund (אם מופעל) |

חשבונות פלטפורמה:

| code | תפקיד חשבונאי |
|---|---|
| `platform:cashback_reserve` | מקור earn (התחייבות שיווקית פנימית) |
| `platform:revenue` | יעד spend בקופה |
| `platform:adjustments` | זיכוי/חיוב אדמין |

---

## 3. חשבונאות (double-entry)

### 3.1 Earn

```text
Dr  platform:cashback_reserve    cashback_agorot
Cr  user:available               cashback_agorot
idempotency: order:{order_id}:cashback
```

בסיס: `floor(eligible_paid_on_site_agorot * percent / 100)` או `flat_agorot`.  
`eligible` = מה ששולם בכרטיס/חיצוני אחרי spend (לא face, לא יתרת עסק).

### 3.2 Spend (בקופה באתר)

```text
לפני Cardcom: W = min(balance, T, cap)
Charge Cardcom = T - W

אחרי paid:
Dr  user:available        W
Cr  platform:revenue      W
idempotency: order:{order_id}:spend
```

אם Cardcom נכשל לפני paid: אין confirm spend (או reverse hold אם היה).

### 3.3 Refund / clawback (כשמופעל)

| מצב | חשבונאות |
|---|---|
| Refund כרטיס אחרי earn | Dr user / Cr reserve עם `order:{id}:cashback_reversal` אם יתרה מספיקה; אחרת `cashback_reversal_debts` |
| Refund אחרי spend | לפי REFUNDS; לא cash-out |

אסור "למחוק" earn ישן.

### 3.4 דוחות פנימיים

| מדד | חישוב |
|---|---|
| יתרות לקוחות | sum credits−debits ל-`user:available` |
| עתודת קאשבק | יתרת `cashback_reserve` |
| Redeem rate | spend / earn בתקופה |

לא מדווחים כלקוח חיצוני "כסף נזיל".

---

## 4. מחזור earn/spend

```text
paid finalize
  → confirm spend (אם W>0)
  → compute cashback on eligible card portion
  → earn
  → notify (לא חוסם)
```

Replay webhook: אותם מפתחות → אין כפל.

---

## 5. מקרי קצה

| קוד | תוצאה |
|---|---|
| `earn_before_paid` | אסור |
| `spend_covers_business_remainder` | אסור |
| `negative_balance` | נחסם ב-transfer |
| `double_earn_replay` | no-op idempotent |
| `cardcom_fail_after_hold` | reverse; יתרה חוזרת |
| `rule_missing` | earn=0 |
| `admin_grant` | דרך adjustments + `adj:{uuid}` |

---

## 6. פתוחות

| # | פתוח | שמרני עד סגירה |
|---|---|---|
| O1 | תוקף יתרה (expiry) | כבוי; אין שריפה אוטומטית |
| O2 | צבירה דיפרנציאלית לפי type | rule table; default 0 |
| O3 | טיפול מס מלא לקאשבק | ייעוץ רו״ח; ארנק לא מחליף חשבונית |
| O4 | hold לפני Cardcom מול confirm-after-paid בלבד | confirm-after-paid ב-MVP |

עודכן: 2026-08-12.

---

## 7. Acceptance

- [ ] אין cash-out מפורש  
- [ ] Double-entry + מפתחות idempotency  
- [ ] Earn אחרי paid; spend על אתר בלבד  
- [ ] חשבונאות reserve/revenue מתועדת  
- [ ] חלופות + DB + מקרי קצה + פתוחות  
- [ ] No Escrow  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING earn/spend |
| 2026-08-12 | pass-2 batch-2 #15 |
| 2026-08-12 | העמקת חשבונאות פנימית + חלופות/פתוחות לפי תבנית |
