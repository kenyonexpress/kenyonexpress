# ARCHITECTURE: Wallet Ledger

ארנק קאשבק פנימי: ledger כפול-רישום באגורות integer, בלי משיכה החוצה.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #16/50

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/BUSINESS-MODEL.md
```

Stack: Supabase Postgres, SECURITY DEFINER `fn_wallet_transfer`, service_role בלבד לכתיבה, UI ב-

```
src/app/(account)/account/wallet
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| W1 | הארנק הוא **אשראי פנימי בלבד** (קאשבק / זיכוי). |
| W2 | **אין משיכה החוצה**, אין P2P, אין cash-out לבנק/כרטיס, אין המרה למזומן. |
| W3 | כסף ב-DB: **integer agorot** בלבד (1 ₪ = 100). אין float. UI מציג ₪ עם 2 עשרונים. |
| W4 | תנועות רק ב-**כפול-רישום** (debit + credit) באותה טרנזקציה. |
| W5 | נתיב כתיבה יחיד: `fn_wallet_transfer` (service_role / definer). אין INSERT ישיר מ-JWT. |
| W6 | Idempotency: `idempotency_key` UNIQUE על העברה. |
| W7 | Canonical: `wallet_accounts` + `wallet_entries`. Deprecated: `wallets`, `wallet_balances`, `wallet_transactions`. |
| W8 | כשל מייל/התראה לא מגלגל תנועת ארנק. |

מסמכים ישנים עם `amount_ils` / `balance_ils` כמקור אמת: **נדחים** לטובת agorot. אם עמודה legacy עדיין `numeric` ILS, קוד חדש כותב/קורא דרך המרה מפורשת או מיגרציית יישור לעמודות `*_agorot`.

---

## 1. ישויות

### 1.1 Accounts

```text
wallet_accounts (
  id uuid PK,
  owner_type text,          -- user | platform
  owner_id uuid null,       -- auth user when user
  purpose text,             -- available | platform:revenue | platform:cashback_reserve | platform:adjustments
  currency text default 'ILS',
  created_at timestamptz
)
```

חשבונות פלטפורמה קבועים:

| purpose | תפקיד |
|---|---|
| `platform:cashback_reserve` | מקור זיכוי קאשבק |
| `platform:revenue` | כנגד הוצאות/התאמות הכנסה |
| `platform:adjustments` | זיכוי/חיוב ידני אדמין |

לכל משתמש: חשבון `available` אחד (נוצר ב-signup trigger).

### 1.2 Entries (append-only)

```text
wallet_entries (
  id uuid PK,
  journal_id uuid not null,     -- pairs debit+credit
  account_id uuid not null,
  direction text check in ('debit','credit'),
  amount_agorot int not null check (amount_agorot > 0),
  reason text not null,
  reference_type text,          -- order | payment | admin | ...
  reference_id uuid,
  idempotency_key text,
  created_at timestamptz,
  metadata jsonb default '{}'
)
```

יתרה מחושבת:

```text
balance_agorot(account) =
  sum(credit.amount_agorot) - sum(debit.amount_agorot)
```

איסור יתרה שלילית בחשבון משתמש ב-`available` (נבדק תחת `FOR UPDATE` בהעברה).

### 1.3 Cashback rules

```text
cashback_rules (
  id, name, percent numeric,   -- או flat_agorot
  active, valid_from, valid_to,
  product_type null|coupon|physical
)
```

חישוב:

```text
cashback_agorot = floor(eligible_paid_on_site_agorot * percent / 100)
```

עיגול: פעם אחת כלפי מטה לאגורות שלמות. אין float ביניים.

---

## 2. `fn_wallet_transfer`

### 2.1 חתימה (יעד)

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
) returns uuid  -- journal_id
```

### 2.2 אלגוריתם

1. רק `service_role` / definer עם `search_path` נעול.
2. `amount_agorot > 0` אחרת reject.
3. אם `idempotency_key` קיים: החזר journal קיים (replay).
4. `SELECT … FOR UPDATE` על שני החשבונות (סדר uuid קבוע למניעת deadlock).
5. בדוק יתרת מקור ≥ amount (לחשבון משתמש).
6. Insert שתי שורות `wallet_entries` תחת אותו `journal_id`.
7. Commit. אופציונלי: enqueue `wallet_activity` notification (לא חוסם).

### 2.3 Reasons

| reason | from → to | מתי |
|---|---|---|
| `order_cashback` | cashback_reserve → user available | אחרי paid (webhook/finalize) |
| `order_spend` | user available → platform revenue/reserve | אם/כשמשתמשים ביתרה בקופה (עתידי) |
| `order_refund_credit` | platform → user | זיכוי החזר ליתרה פנימית |
| `admin_credit` | adjustments → user | super_admin + recent auth + reason |
| `admin_debit` | user → adjustments | super_admin; לא מתחת לאפס |

---

## 3. מה אסור

| פעולה | סטטוס |
|---|---|
| משיכה לחשבון בנק | אסור |
| העברה בין שני לקוחות | אסור |
| המרה לכסף בכרטיס | אסור |
| עדכון יתרה ב-UPDATE ישיר | אסור |
| כתיבה מ-anon/authenticated JWT | אסור |
| שימוש בארנק כ-Escrow לספק | אסור (מודל קופון: No Escrow; יתרה בעסק מחוץ לארנק) |

הארנק **לא** מחזיק את מקדמת הקופון של הלקוח לספק. מקדמת קופון נשארת בפלטפורמה כהכנסה; הארנק הוא קאשבק נפרד.

---

## 4. אינטגרציה ל-checkout

```text
Cardcom webhook / finalizeOrder (paid)
  → issue vouchers / mark physical
  → compute cashback_agorot from active rule + paid_on_site_agorot snapshot
  → fn_wallet_transfer(... reason=order_cashback, idempotency=cashback:{order_id})
  → enqueue notification wallet_activity (optional prefs)
```

כשל העברת ארנק אחרי paid:

- לא מבטל את ה-paid.
- נרשם ל-retry job עם אותו idempotency key.
- Alert אם נכשל חוזר.

---

## 5. RLS (תמצית)

| Table | SELECT | WRITE |
|---|---|---|
| `wallet_accounts` | own / admin | service/trigger only |
| `wallet_entries` | own account / admin | `fn_wallet_transfer` only |
| `cashback_rules` | admin (+ optional read active) | admin/service |

פירוט: `ARCHITECTURE-SECURITY-RLS.md`.

---

## 6. Views / בקרות

| View / check | מטרה |
|---|---|
| `v_wallet_ledger` | יומן קריא ל-UI/אדמין |
| `v_wallet_balance_drift` | זיהוי אי-איזון journals |
| Nightly job | סכום debit==credit לכל `journal_id` |

---

## 7. UI

| Surface | התנהגות |
|---|---|
| `/account/wallet` | יתרה ב-₪, היסטוריית entries, הסבר "לשימוש באתר בלבד" |
| Admin adjust | super_admin + recent auth + reason חובה + audit_log |
| Checkout | הצגת יתרה למימוש עתידי (אם מופעל); לא חובה ל-MVP |

אין כפתור "משוך לחשבון".

---

## 8. Acceptance

- [ ] כל תנועה = journal עם debit+credit באגורות
- [ ] אין API למשיכה החוצה
- [ ] Idempotency על cashback per order
- [ ] JWT לא יכול INSERT ל-`wallet_entries`
- [ ] UI מציג ₪; DB שומר agorot
- [ ] Paid לא ממתין להתראה

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | ke-arch docs-lifecycle: wallet ledger כפול-רישום באגורות; בלי משיכה החוצה |

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2 #16: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
