# ארכיטקטורה: ארנק באזור האישי

ארנק פנימי ב-`/account`: יתרה, היסטוריה, מימוש בקופה. בלי cash-out.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. הארנק אינו held של מקדמת קופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-SECURITY-RLS.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| AW1 | מסך הארנק מציג יתרה ב-₪ והיסטוריה מ-journal (לא מטבלאות deprecated). |
| AW2 | אין כפתור/API משיכה, P2P, או המרה למזומן. |
| AW3 | מימוש רק ב-checkout על סכום האתר, לפני Cardcom. |
| AW4 | יתרות באגורות; תצוגה בלבד ממירה ל-₪. |
| AW5 | כתיבה רק דרך `fn_wallet_transfer` (service). JWT קורא בלבד. |
| AW6 | מפתחות: `order:{order_id}:cashback` / `order:{order_id}:spend`. |
| AW7 | אורח רואה checkout; שדה ארנק רק למשתמש מחובר עם יתרה > 0. |
| AW8 | Canonical: `wallet_accounts` + `wallet_entries`. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| כפתור "משוך לבנק" | AW2/C2: cash-out אסור לצמיתות. |
| עריכת יתרה ע"י משתמש | fraud; admin adjust בלבד. |
| הצגת ארנק כ-Escrow לספק | No Escrow; טקסט UI מפורש. |
| קריאה מ-`wallet_transactions` legacy | AW8: deprecated. |
| float ב-JS לתצוגת יתרה | AW4: agorot + `money.ts`. |
| apply ארנק אחרי redirect Cardcom | AW3: לפני charge; spend ב-finalize. |

---

## 3. סכמת DB

**אין DDL חדש.** קריאה בלבד מ:

| מקור | שימוש UI |
|---|---|
| `wallet_accounts` (purpose=`available`) | `balance_agorot` |
| `v_wallet_ledger` | היסטוריית תנועות |
| `wallet_entries` (via view/RLS) | reason, סכום, `order_id` |

RLS: SELECT own בלבד. אין INSERT/UPDATE/DELETE ל-JWT על entries.

נתיב:

```
src/app/(account)/account/wallet
```

Gate: `getUser()`; לא מחובר → `/login?next=/account/wallet`.

---

## 4. UI `/account/wallet`

| רכיב | תוכן |
|---|---|
| יתרה ראשית | `balance_agorot` → ₪ (2 ספרות, he-IL) |
| הסבר | "לשימוש באתר בלבד · לא ניתן למשיכה" |
| היסטוריה | תאריך, סיבה בעברית, סכום חתום, קישור להזמנה |
| ריק | empty state + CTA לקטלוג |

תוויות `reason`: `order_cashback`, `order_spend`, `order_refund`, `admin_credit`, `admin_debit`.

---

## 5. Apply ב-checkout

```text
T = on_site total agorot
W = min(balance_agorot, T, cap_if_any)
Cardcom = T - W
on paid:
  fn_wallet_transfer(order_spend, order:{id}:spend)
  then earn if applicable
```

קופון: W רק מול `coupon_price`. הגנת double-spend: `FOR UPDATE` + UNIQUE.

---

## 6. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | יתרה 0 | שדה ארנק מוסתר/disabled |
| E2 | login mid-checkout | שדה ארנק מופיע אחרי session |
| E3 | cache drift | UI מ-journal; alert אם drift |
| E4 | היסטוריה ארוכה | cursor/limit; לא load all |
| E5 | משתמש A רואה entries של B | RLS block |
| E6 | שגיאת טעינה | הודעה עברית; בלי פרטי DB |
| E7 | W > T ב-client tamper | server cap |
| E8 | logout | אין cache יתרה רגישה ב-localStorage |

---

## 7. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | badge יתרה ב-AccountNav | מ-agorot; PERSONAL-AREA | 2026-08-12 |
| O2 | "קאשבק אחרון" ב-dashboard | אופציונלי v1 | 2026-08-12 |
| O3 | cutover agorot ב-UI | WALLET-INTEGER | 2026-08-12 |

---

## 8. Acceptance

- [ ] `/account/wallet` יתרה + היסטוריה RTL  
- [ ] אין cash-out ב-UI או API  
- [ ] Checkout apply עם T−W לכרטיס  
- [ ] Spend/earn עם מפתחות `order:{id}:…`  
- [ ] RLS: משתמש רואה רק את עצמו  
- [ ] No Escrow בטקסט  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
