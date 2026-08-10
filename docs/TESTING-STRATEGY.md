# אסטרטגיית בדיקות (פירמידה + שערי merge)

תקציר מחייב לקוד ול-PR. פירוט CI/תרחישים: המסמך הארוך למטה.

Status: **BINDING (policy)** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקור מחייב (פירוט):**

```
docs/ARCHITECTURE-TESTING-CICD.md
```

מסמכים קשורים:

```
docs/CODE-REVIEW-CHECKLIST.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/GITHUB-SETTINGS.md
```

מודל כסף: **No Escrow**; `platform_percent` פר מוצר; כסף באגורות (integers).  
אין לבדוק "escrow held" / webhook Cardcom חתום HMAC (לא קיים).

---

## 1. פירמידה

| שכבה | כלי | מה מכוסה | מה לא |
|---|---|---|---|
| Unit | Vitest | מתמטיקת אגורות, commission/split, settlement, state machine, validateRedemption (בלי I/O) | UI מלא, רשת Cardcom |
| Integration | Vitest + Supabase test / RPC | RLS smoke, `redeem_voucher` race, finalize אחרי `GetLpResult`, מיזוג עגלה | פיקסלים, דפדפן מלא |
| E2E | Playwright (`e2e/`, `he-IL`) | בית/מוצר/עגלה/checkout עד redirect; auth; זרימת רכישה מקוצרת | תשלום אמיתי ב-Cardcom; סריקת פרוד |

יחס נפח יעד: הרבה unit → פחות integration → מעט E2E יציבים.

---

## 2. מיפוי כיסוי לפי סיכון

### 2.1 Unit (חובה על נתיב כסף)

| מודול (נוכחי) | קובץ טסט טיפוסי | חובה |
|---|---|---|
| אגורות | `src/lib/commerce/money.test.ts` | כן |
| עמלה / הצעת קופון | `commission.test.ts`, `coupon-offer.test.ts`, `product-money.test.ts` | כן |
| פיצול checkout | `src/lib/checkout/split` (+ טסטים) | כן |
| settlement / state | `src/server/domain/orders/*` | כן |
| מימוש (לוגיקה) | `redemption` / validate לפני RPC | כן |

יעד חבילה משותפת (מובייל/שרת): כשקיים

```
packages/money
```

כל ה-API הציבורי שלה חייב unit בלי רשת.

### 2.2 Integration

- RPC `redeem_voucher` + `UNIQUE(coupon_code_id)`: סריקה כפולה → בדיוק מימוש אחד.
- Webhook/return Cardcom: `?s=` + אימות `GetLpResult` (בלי HMAC מזויף).
- RLS: לקוח לא קורא הזמנות של אחר; ספק לא מממש קופון של ספק אחר.

### 2.3 E2E

קיים היום (אינדיקטיבי): `home`, `product`, `category`, `cart`, `checkout`, `auth`, `purchase-flow`.  
עצירה לפני סליקה אמיתית אלא אם sandbox מפורש ב-CI עם סודות.

---

## 3. מדיניות coverage (כסף)

| יעד | רף | הערה |
|---|---|---|
| `packages/money` (כשקיים) | **100%** lines/branches/functions/statements | שער merge |
| `src/lib/commerce/money.ts` (עד חילוץ לחבילה) | **100%** | אותו שער; מחליף את רף 95% ההיסטורי במדיניות |
| נתיב redeem (לוגיקה + route/RPC tests) | **100%** על קבצי הליבה שמוגדרים ב-CI include | סריקה כפולה + חתימת QR חובה |
| שאר `src/` | דיווח בלבד | אין אחוז גלובלי כשער |

עקרון: רשימת invariants סגורה + רף קבצי כסף. לא "80% על כל הריפו".

כרגע ב-

```
vitest.config.ts
```

עדיין רשום רף 95% על כמה קבצי money-path (כולל `escrow.ts` שאינו קיים). מדיניות המסמך הזה **דורסת** לכיוון 100% על money + redeem; יישור הקונפיג הוא משימת קוד נפרדת.

---

## 4. מתי חובה טסט לפני merge

| שינוי ב-PR | חובה לפני merge |
|---|---|
| `money` / commission / split / settlement / ledger | unit רלוונטי ירוק + רף coverage של סעיף 3 |
| redeem / voucher / QR / supplier scan | unit + לפחות תרחיש race או integration לכפילות |
| מיגרציית SQL / RLS | בדיקת מדיניות (או סקריפט) על הטבלאות שנגעו |
| Checkout / Cardcom return-webhook | unit על אימות; E2E עד לפני תשלום או mock מאושר |
| UI חנות (דף/CSS משמעותי) | E2E רלוונטי **או** `scripts/compare.mjs` מול ref (ראה checklist) |
| docs-only | אין חובת טסט קוד |
| שינוי לא כספי קטן (טקסט, docs comment) | lint/typecheck לפי CI; בלי unit חדש אם אין לוגיקה |

בלי CI ירוק על שערי החובה: **אין merge** ל-`main` (ראה `GITHUB-SETTINGS.md`).

---

## 5. פקודות (Terminal, משורש הפרויקט)

```bash
pnpm test
pnpm exec vitest run --coverage
pnpm exec playwright test
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

---

## 6. Acceptance

- [ ] PR שנוגע בכסף לא מתמזג בלי unit על האגורות/פיצול
- [ ] PR שנוגע ב-redeem לא מתמזג בלי כיסוי כפילות
- [ ] אין טסט שמצפה ל-Escrow held או ל-HMAC webhook של Cardcom
- [ ] רף 100% על money (+ packages/money) ו-redeem מתועד כשער

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | פירמידה, כיסוי 100% money/redeem, שערי merge |
