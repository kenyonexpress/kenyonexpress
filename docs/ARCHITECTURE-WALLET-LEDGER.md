# ארכיטקטורה: Wallet Ledger

ארנק קאשבק פנימי: ledger כפול-רישום באגורות integer, נתיב כתיבה יחיד, בלי משיכה החוצה.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #16/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון. הארנק אינו מחזיק מקדמת קופון לספק.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/BUSINESS-MODEL.md
```

Stack: Supabase Postgres, `SECURITY DEFINER` `fn_wallet_transfer`, כתיבה ב-`service_role` בלבד. UI ב:

```
src/app/(account)/account/wallet
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| W1 | הארנק הוא **אשראי פנימי בלבד** (קאשבק / זיכוי). |
| W2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס. |
| W3 | כסף ב-DB: **integer agorot** בלבד (1 ₪ = 100). אין float. UI מציג ₪. |
| W4 | תנועות רק ב-**כפול-רישום** (debit + credit) באותה טרנזקציה. |
| W5 | נתיב כתיבה יחיד: `fn_wallet_transfer`. אין INSERT ישיר מ-JWT. |
| W6 | Idempotency: `idempotency_key` UNIQUE על העברה. |
| W7 | Canonical: `wallet_accounts` + `wallet_entries`. Deprecated: `wallets`, `wallet_balances`, `wallet_transactions`. |
| W8 | כשל מייל/התראה לא מגלגל תנועת ארנק. |
| W9 | Append-only: אין UPDATE/DELETE על entries; תיקון = journal נגדי. |
| W10 | מפתחות earn/spend: `order:{order_id}:cashback` / `order:{order_id}:spend`. |

מסמכים ישנים עם `amount_ils` / `balance_ils` כמקור אמת: **נדחים** לטובת agorot. Cutover:  
`docs/ARCHITECTURE-WALLET-INTEGER.md`.

---

## 1. ישויות

### 1.1 Accounts

```text
wallet_accounts (
  id uuid PK,
  owner_type text,          -- user | platform
  owner_id uuid null,       -- auth user when user
  purpose text,             -- available | platform:*
  currency text default 'ILS',
  balance_agorot bigint,    -- cache אופציונלי; לא מקור אמת
  created_at timestamptz
)
```

חשבונות פלטפורמה קבועים:

| purpose / code | תפקיד |
|---|---|
| `platform:cashback_reserve` | מקור זיכוי קאשבק |
| `platform:revenue` | יעד spend / התאמות הכנסה |
| `platform:adjustments` | זיכוי/חיוב ידני אדמין |

לכל משתמש: חשבון `available` אחד (נוצר ב-signup trigger). אין חשבון חמישי / סכמה מקבילה.

### 1.2 Entries (append-only)

שתי צורות ייצוג מקובלות (יישור לפי הסכמה החיה; העיקרון זהה):

**צורה A (זוג שורות תחת journal):**

```text
wallet_entries (
  id uuid PK,
  journal_id uuid not null,
  account_id uuid not null,
  direction text check in ('debit','credit'),
  amount_agorot int not null check (amount_agorot > 0),
  reason text not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  created_at timestamptz,
  metadata jsonb default '{}'
)
```

**צורה B (שורה אחת = העברה):**

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

בשתי הצורות: סכום חיובי בלבד, שני צדדים, אין שורה חד-צדדית.

יתרה:

```text
balance_agorot(account) =
  sum(credits) - sum(debits)
```

איסור יתרה שלילית בחשבון משתמש `available` (נבדק תחת `FOR UPDATE`).

### 1.3 Cashback rules

```text
cashback_rules (
  id, name, percent numeric או flat_agorot,
  active, valid_from, valid_to,
  product_type null|coupon|physical,
  priority, …
)
```

```text
cashback_agorot = floor(eligible_paid_on_site_agorot * percent / 100)
```

עיגול: פעם אחת כלפי מטה. אין float ביניים. ראה גם WALLET-CASHBACK.

---

## 2. `fn_wallet_transfer`

### 2.1 חתימת יעד

```sql
fn_wallet_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount_agorot int,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_metadata jsonb default '{}'
) returns uuid  -- journal_id / entry id
```

שמות פרמטרים חיים עשויים להיות `p_debit_account` / `p_credit_account`. העיקרון: אגורות integer, idempotency, שני חשבונות.

### 2.2 אלגוריתם

1. רק `service_role` / definer עם `search_path` נעול.  
2. `amount_agorot > 0` אחרת reject.  
3. אם `idempotency_key` קיים: החזר journal קיים (replay בטוח).  
4. `SELECT … FOR UPDATE` על שני החשבונות (סדר uuid קבוע למניעת deadlock).  
5. בדוק יתרת מקור ≥ amount (לחשבון משתמש).  
6. Insert שורות entries מאוזנות.  
7. עדכון cache יתרה אם קיים.  
8. Commit. אופציונלי: enqueue `wallet_activity` (לא חוסם).

### 2.3 Reasons

| reason | from → to | מתי | idempotency |
|---|---|---|---|
| `order_cashback` | cashback_reserve → user | אחרי paid | `order:{id}:cashback` |
| `order_spend` | user → revenue | מימוש בקופה אחרי paid | `order:{id}:spend` |
| `order_refund` / `order_refund_credit` | platform → user | החזר ליתרה פנימית | `order:{id}:refund` |
| `admin_credit` | adjustments → user | super_admin + reason | `adj:{uuid}` |
| `admin_debit` | user → adjustments | super_admin; לא מתחת לאפס | `adj:{uuid}` |

---

## 3. מה אסור

| פעולה | סטטוס |
|---|---|
| משיכה לחשבון בנק | אסור |
| העברה בין שני לקוחות | אסור |
| המרה לכסף בכרטיס | אסור |
| עדכון יתרה ב-UPDATE ישיר | אסור |
| כתיבה מ-anon/authenticated JWT | אסור |
| שימוש בארנק כ-Escrow לספק | אסור (No Escrow) |
| מחיקת / עריכת entry ישן | אסור |

הארנק **לא** מחזיק את מקדמת הקופון. מקדמת קופון נשארת בפלטפורמה כהכנסה; הארנק הוא קאשבק נפרד.

---

## 4. אינטגרציה ל-checkout / finalize

```text
Cardcom webhook / finalizeOrder (paid)
  → issue vouchers / mark physical
  → אם W>0: fn_wallet_transfer(... order_spend, order:{id}:spend)
  → compute cashback_agorot
  → fn_wallet_transfer(... order_cashback, order:{id}:cashback)
  → enqueue notification (אופציונלי)
```

כשל העברת ארנק אחרי paid:

- לא מבטל את ה-paid.  
- נרשם ל-retry עם אותו idempotency key.  
- Alert אם נכשל חוזר.

---

## 5. RLS (תמצית)

| Table | SELECT | WRITE |
|---|---|---|
| `wallet_accounts` | own / admin | service/trigger only |
| `wallet_entries` | own account / admin | `fn_wallet_transfer` only |
| `cashback_rules` | admin (+ optional read active) | admin/service |

פירוט:

```
docs/ARCHITECTURE-SECURITY-RLS.md
```

`EXECUTE` על `fn_wallet_transfer`: `service_role` בלבד. ראה SEC-WALLET ב-WALLET-INTEGER.

---

## 6. Views / בקרות

| View / check | מטרה |
|---|---|
| `v_wallet_ledger` | יומן קריא ל-UI/אדמין |
| `v_wallet_balance_drift` | זיהוי אי-איזון cache מול journal |
| Nightly job | סכום debit == credit לכל journal; drift = 0 |

---

## 7. UI

| Surface | התנהגות |
|---|---|
| `/account/wallet` | יתרה ב-₪, היסטוריית entries, "לשימוש באתר בלבד" |
| Admin adjust | super_admin + recent auth + reason + audit_log |
| Checkout | בחירת סכום למימוש; חיוב Cardcom = T − W |

אין כפתור "משוך לחשבון".

---

## 8. Acceptance

- [ ] כל תנועה = journal מאוזן באגורות  
- [ ] Append-only נאכף (אין UPDATE/DELETE ל-JWT)  
- [ ] אין API למשיכה החוצה  
- [ ] Idempotency על cashback/spend per order  
- [ ] JWT לא יכול INSERT ל-`wallet_entries`  
- [ ] UI מציג ₪; DB שומר agorot  
- [ ] Paid לא ממתין להתראה  
- [ ] No Escrow מפורש  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ke-arch docs-lifecycle: wallet ledger כפול-רישום באגורות |
| 2026-08-12 | batch-2 #16: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #16 pass-2: double-entry, fn_wallet_transfer, accounts, append-only מלא |
