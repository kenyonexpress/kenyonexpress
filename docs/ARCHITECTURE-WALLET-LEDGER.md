# ארכיטקטורה: Wallet Ledger

ארנק קאשבק פנימי: ledger כפול-רישום באגורות integer, נתיב כתיבה יחיד, בלי משיכה החוצה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון. הארנק אינו מחזיק מקדמת קופון לספק.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-SECURITY-RLS.md
```

Stack: Supabase Postgres, `SECURITY DEFINER` `fn_wallet_transfer`, כתיבה ב-`service_role` בלבד.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| W1 | הארנק הוא **אשראי פנימי בלבד** (קאשבק / זיכוי). |
| W2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס. |
| W3 | כסף ב-DB: **integer agorot** (1 ₪ = 100). אין float. UI מציג ₪. |
| W4 | תנועות רק ב-**כפול-רישום** (debit + credit) באותה טרנזקציה. |
| W5 | נתיב כתיבה יחיד: `fn_wallet_transfer`. אין INSERT ישיר מ-JWT. |
| W6 | Idempotency: `idempotency_key` UNIQUE על העברה. |
| W7 | Canonical: `wallet_accounts` + `wallet_entries`. Deprecated: `wallets`, `wallet_balances`, `wallet_transactions`. |
| W8 | כשל מייל/התראה לא מגלגל תנועת ארנק. |
| W9 | Append-only: אין UPDATE/DELETE על entries; תיקון = journal נגדי. |
| W10 | מפתחות earn/spend: `order:{order_id}:cashback` / `order:{order_id}:spend`. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| יתרה ב-UPDATE ישיר על `wallet_accounts` | אין audit trail; race על concurrent spend. |
| INSERT ל-`wallet_entries` מ-JWT authenticated | SEC-WALLET; מיניט יתרות. |
| ארנק כ-Escrow למקדמת קופון | No Escrow; מקדמה נשארת הכנסת פלטפורמה. |
| cash-out לבנק "בשלב 2" | C2/C7 ב-CASHBACK-WALLET: אסור לצמיתות. |
| טבלאות legacy (`wallets`) כמקור אמת | W7: canonical ב-accounts+entries בלבד. |
| float ILS ב-journal | WI1/W3: agorot integer בלבד. |

---

## 3. סכמת DB

**אין DDL חדש במסמך זה.** מיגרציות היסטוריות: `046` (accounts/entries), הרחבות cashback.

### `wallet_accounts`

```text
wallet_accounts (
  id uuid PK,
  owner_type text,          -- user | platform
  owner_id uuid null,
  purpose text,             -- available | platform:*
  currency text default 'ILS',
  balance_agorot bigint,    -- cache; לא מקור אמת
  created_at timestamptz
)
```

חשבונות פלטפורמה: `platform:cashback_reserve`, `platform:revenue`, `platform:adjustments`.  
לכל משתמש: חשבון `available` אחד (trigger ב-signup).

### `wallet_entries` (append-only)

```text
wallet_entries (
  id uuid PK,
  debit_account uuid not null,
  credit_account uuid not null,
  amount_agorot bigint not null check (amount_agorot > 0),
  reason text not null,
  idempotency_key text not null unique,
  order_id uuid null,
  created_at timestamptz
)
```

יתרה: `sum(credits) - sum(debits)`. איסור יתרה שלילית ב-`available` תחת `FOR UPDATE`.

### `cashback_rules`

```text
cashback_rules (
  id, name, percent numeric או flat_agorot,
  active, valid_from, valid_to,
  product_type null|coupon|physical,
  priority
)
```

```text
cashback_agorot = floor(eligible_paid_on_site_agorot * percent / 100)
```

### Views / בקרות

| View | מטרה |
|---|---|
| `v_wallet_ledger` | יומן ל-UI/אדמין |
| `v_wallet_balance_drift` | cache מול journal; חייב 0 |

---

## 4. `fn_wallet_transfer` (חוזה)

1. רק `service_role` / definer עם `search_path` נעול.  
2. `amount_agorot > 0` אחרת reject.  
3. אם `idempotency_key` קיים: החזר journal קיים.  
4. `SELECT … FOR UPDATE` על שני החשבונות (סדר uuid קבוע).  
5. יתרת מקור ≥ amount (לחשבון משתמש).  
6. Insert entries מאוזנות; עדכון cache אם קיים.  

| reason | from → to | idempotency |
|---|---|---|
| `order_cashback` | cashback_reserve → user | `order:{id}:cashback` |
| `order_spend` | user → revenue | `order:{id}:spend` |
| `order_refund` | platform → user | `order:{id}:refund` |
| `admin_credit` / `admin_debit` | adjustments ↔ user | `adj:{uuid}` |

---

## 5. אינטגרציה ל-checkout

```text
Cardcom webhook / finalizeOrder (paid)
  → issue vouchers
  → אם W>0: fn_wallet_transfer(... order_spend)
  → compute cashback_agorot
  → fn_wallet_transfer(... order_cashback)
  → enqueue notification (אופציונלי)
```

כשל העברת ארנק אחרי paid: לא מבטל paid; retry עם אותו idempotency key.

---

## 6. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | replay `order:{id}:cashback` | journal קיים; אין זיכוי כפול |
| E2 | spend + spend במקביל על יתרה 100 | אחד עובר; השני reject |
| E3 | paid לפני earn; notification נכשל | earn מתבצע; התראה retry |
| E4 | cache drift (balance_agorot ≠ journal) | alert; `v_wallet_balance_drift` |
| E5 | admin_debit מתחת לאפס | reject לפני commit |
| E6 | JWT INSERT ל-entries | RLS + אין EXECUTE |
| E7 | refund אחרי spend | journal נגדי לפי REFUNDS-DISPUTES |
| E8 | order cancelled לפני paid | אין spend/earn |

---

## 7. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | צורה A (journal_id) vs B (debit/credit בשורה) | יישור לסכמה החיה; עיקרון זהה | 2026-08-12 |
| O2 | nightly drift job | cron + alert אדמין | 2026-08-12 |
| O3 | cutover `amount_ils` → agorot | WALLET-INTEGER | 2026-08-12 |

---

## 8. Acceptance

- [ ] כל תנועה = journal מאוזן באגורות  
- [ ] Append-only נאכף  
- [ ] אין API למשיכה החוצה  
- [ ] Idempotency על cashback/spend per order  
- [ ] JWT לא יכול INSERT ל-`wallet_entries`  
- [ ] No Escrow מפורש  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ledger כפול-רישום באגורות |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
