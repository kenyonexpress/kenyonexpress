# ארכיטקטורה: ארנק באזור האישי

ארנק פנימי ב-`/account`: יתרה, היסטוריה, מימוש בקופה. בלי cash-out.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #19/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. הארנק אינו held של מקדמת קופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-SECURITY-RLS.md
```

מיגרציות היסטוריות רלוונטיות: `046` (accounts/entries), הרחבות cashback rules. לא יוצרים צורת ארנק חמישית.

---

## 0. הכרעות UI + דומיין

| # | הכרעה |
|---|---|
| AW1 | מסך הארנק מציג יתרה ב-₪ והיסטוריה מ-journal (לא מטבלות deprecated). |
| AW2 | אין כפתור/API משיכה, P2P, או המרה למזומן. |
| AW3 | מימוש רק ב-checkout על סכום האתר, לפני Cardcom. |
| AW4 | יתרות באגורות; תצוגה בלבד ממירה ל-₪. |
| AW5 | כתיבה רק דרך `fn_wallet_transfer` (service). JWT קורא בלבד. |
| AW6 | מפתחות: `order:{order_id}:cashback` / `order:{order_id}:spend`. |
| AW7 | אורח רואה checkout; שדה ארנק רק למשתמש מחובר עם יתרה > 0. |
| AW8 | Canonical: `wallet_accounts` + `wallet_entries`. Deprecated: `wallets`, `wallet_balances`, `wallet_transactions`. |

---

## 1. מסך `/account/wallet`

נתיב:

```
src/app/(account)/account/wallet
```

מאחורי session בשרת. לא מחובר → `/login?next=/account/wallet`.

| רכיב | תוכן |
|---|---|
| יתרה ראשית | `balance_agorot` → תצוגת ₪ (2 ספרות) |
| הסבר | "לשימוש באתר בלבד · לא ניתן למשיכה" |
| היסטוריה | שורות מ-`v_wallet_ledger` (או מקבילה): תאריך, סיבה בעברית, סכום חתום, קישור להזמנה אם יש |
| ריק | מצב empty: אין תנועות עדיין + CTA לקטלוג |
| שגיאת טעינה | הודעה בעברית; בלי לחשוף פרטי DB |

תוויות `reason` (דוגמה):

| reason | תווית UI |
|---|---|
| `order_cashback` | קאשבק מהזמנה |
| `order_spend` | מימוש בקופה |
| `order_refund` | זיכוי החזר |
| `admin_credit` | זיכוי מערכת |
| `admin_debit` | חיוב התאמה |

סכום חיובי = זיכוי ליתרה; שלילי = מימוש/חיוב. RTL מלא, Electro/Heebo לפי design system הקיים.

---

## 2. יתרה: מקור אמת

```text
UI balance = balance_agorot(user available)
           = sum(credits) - sum(debits) על חשבון המשתמש
```

אם קיים cache ב-`wallet_accounts`:

- מוצג מהיר ל-UI  
- מקור אמת נשאר journal  
- `v_wallet_balance_drift` חייב להיות ריק; אחרת אלרט אדמין  

אין הצגת "כסף שמור אצל ספק" / Escrow.

---

## 3. היסטוריה

| דרישה | פירוט |
|---|---|
| מקור | entries שנוגעים בחשבון המשתמש בלבד (RLS) |
| מיון | חדש → ישן |
| עימוד | cursor/limit; לא לטעון את כל ההיסטוריה בלי גבול |
| קישור | אם `order_id` קיים → `/account/orders/[id]` |
| פרטיות | משתמש א לא רואה entries של ב |

אין עריכה/מחיקה מה-UI. תמיכה/אדמין מתקנים ב-journal נגדי.

---

## 4. Apply ב-checkout

### 4.1 תצוגה

| מצב | UI |
|---|---|
| לא מחובר | אין שדה ארנק |
| מחובר, יתרה 0 | מוסתר או disabled עם הסבר קצר |
| מחובר, יתרה > 0 | מתג "השתמש ביתרה" ו/או קלט סכום עד המקסימום |
| אחרי בחירה | סיכום: ארנק ₪W · כרטיס ₪(T−W) |

### 4.2 חוקי סכום

```text
T = on_site total agorot
W = min(balance_agorot, T, cap_if_any)
Cardcom = T - W
```

קופון: W רק מול `coupon_price`. פיזי: מול סכום העגלה באתר.

### 4.3 אישור אחרי paid

```text
on paid:
  fn_wallet_transfer(
    reason: order_spend,
    idempotency_key: order:{order_id}:spend
  )
  then earn if applicable:
    order:{order_id}:cashback
```

כשל Cardcom לפני paid: אין spend מאושר / reverse. יתרה לא נעלמת בשקט.

הגנת double-spend: ולידציה ב-`beginCheckout` + `FOR UPDATE` + UNIQUE ב-DB (ראה LEDGER).

---

## 5. סקירה באזור האישי

ב-`/account` (dashboard):

- כרטיס/שורה: יתרה נוכחית + קישור ל-`/account/wallet`  
- לא מציגים כפתור משיכה  
- אופציונלי: "קאשבק אחרון" אם יש תנועת `order_cashback` אחרונה  

שאר מסכי account (הזמנות, קופונים, כתובות, טוקנים) מחוץ לסקופ המפורט כאן; הארנק רק נשען עליהם לקישורים.

---

## 6. RLS וטעינה

| פעולה | מי |
|---|---|
| SELECT יתרה/ledger של עצמי | authenticated + RLS |
| WRITE entries/accounts | service דרך `fn_wallet_transfer` בלבד |
| Admin adjust | super_admin + recent auth + reason + audit |

אין מדיניות INSERT/UPDATE/DELETE ל-JWT על entries.

---

## 7. אורח → התחברות → ארנק

1. אורח מוסיף לעגלה ומגיע ל-checkout.  
2. לחיצה על תשלום בלי session → OAuth עם `next`.  
3. אחרי חזרה: מיזוג עגלה, ואז שדה ארנק אם יתרה > 0.  
4. אין יצירת חשבון ארנק ב-client; trigger ב-signup / first transfer.

---

## 8. מה אסור במסך

- "משוך לחשבון בנק"  
- העברה לחבר  
- עריכת יתרה ידנית ע"י המשתמש  
- הצגת יתרה כנאמנות/Escrow  
- float / עמודות ILS כמקור אמת אחרי cutover  

---

## 9. Acceptance

- [ ] `/account/wallet` מציג יתרה + היסטוריה בעברית RTL  
- [ ] אין cash-out ב-UI או API  
- [ ] Checkout מאפשר apply עם T−W לכרטיס  
- [ ] Spend/earn עם מפתחות `order:{id}:…`  
- [ ] RLS: משתמש רואה רק את עצמו  
- [ ] No Escrow מפורש בטקסט המסך או בחוזה  
- [ ] Deprecated tables לא נקראות  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2 #19: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #19 pass-2: UI יתרה/היסטוריה/apply בקופה; מפתחות מיושרים |
