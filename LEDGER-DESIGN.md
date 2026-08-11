# LEDGER-DESIGN

עיצוב ledger כפול-רישום באגורות: journals, ארנק, הכנסות פלטפורמה, מע״מ.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md
```

מודל כסף: **No Escrow**. אין held לספק על קופון.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| L1 | כל תנועת כסף = journal מאוזן באגורות integer. |
| L2 | אין UPDATE/DELETE על שורות journal ישנות; רק compensating entry. |
| L3 | Idempotency UNIQUE על מפתח אירוע (`order:{id}:paid`, cashback/spend keys). |
| L4 | קופון: הכנסת פלטפורמה = paid_on_site; supplier_due מהפלטפורמה = 0. |
| L5 | מע״מ: extractVat על הכנסת פלטפורמה בלבד. |
| L6 | פיזי: platform fee + supplier_payable residual; payout מחוץ ל-charge. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| יתרה יחידה בלי journal | אין audit. |
| float / numeric כמקור אמת | שובר אגורה. |
| Escrow hold עד redeem | No Escrow. |

---

## 2. סכמת DB

`ledger_journals`, `ledger_journal_lines`, `ledger_accounts`, `wallet_entries`, `wallet_accounts`. אין DDL כאן. פירוט: WALLET-LEDGER.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `replay_paid` | אותו מפתח; אין כפל |
| `charge_ok_ledger_fail` | reconcile; לא charge שני |
| `negative_wallet` | נחסם ב-transfer |
| `vat_leak` | vat = gross - net תמיד |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | cutover מלא מ-ILS twin | לפי WALLET-INTEGER |
| O2 | דוחות רו״ח אוטומטיים | ייצוא ידני ב-MVP |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING קצר; מצביע ל-WALLET-LEDGER |
