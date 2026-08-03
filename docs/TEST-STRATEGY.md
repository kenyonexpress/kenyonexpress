# TEST STRATEGY

פירמידת טסטים מלאה ל-KenyonExpress: כסף קודם, UI אחר כך.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-TESTING-CICD.md
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/QA-CHECKLIST.md
```

Package manager: **pnpm** בלבד.  
שורש הרצה (כשמותר): `/Users/ofir/kenyonexpress-web/kenyonexpress`.

---

## 0. פירמידה (הפוכה לכסף)

```text
                 /\
                /  \      E2E Playwright (מעט, יקר, כסף+RTL)
               /----\
              /      \    Integration (DB races, webhook, redeem)
             /--------\
            /          \  Unit Vitest (הרבה, מהיר, money pure)
           /______________\
```

| שכבה | כלי | מה נכנס | מה לא |
|---|---|---|---|
| Unit | Vitest | money, commission, split, QR HMAC, redemption gates, cart merge helpers | רשת, Supabase אמיתי |
| Integration | Vitest + local Supabase / fakes | UNIQUE redeem, advisory locks, webhook finalize, wallet transfer idempotency | Cardcom אמיתי, Google OAuth אמיתי |
| E2E | Playwright chromium `he-IL` | checkout mock, redeem, home/PDP/cart/RTL smoke | תשלום prod, shared dev DB writes מ-CI |
| Visual | `scripts/compare.mjs` | diff מול live (סף ~30%) | לא מחליף assert כסף |
| Static | Biome lint + `tsc` | כל PR | |

עקרון: אם אפשר לבדוק באגורות ב-unit, לא לדחות ל-E2E.

---

## 1. Unit (Vitest)

### 1.1 מיקום וקונפיג

```
src/**/*.test.ts(x)
vitest.setup.ts
alias @ → src
```

Colocate: `foo.ts` ליד `foo.test.ts`.

### 1.2 חובה לכיסוי גבוה (רצפות)

| מודול | דגש |
|---|---|
| `money` / agorot helpers | המרה, עיגול חד-פעמי, אין float |
| `commission` / `split` | `platform_percent` פר מוצר; קופון No Escrow (supplier from platform = 0) |
| QR / HMAC | verify/fail; לא authorization |
| redemption gate | `already_used`, `wrong_supplier`, `expired`, … |
| cart merge helper | לוגיקה טהורה; מרוץ ב-integration |
| search query normalize | עברית, synonyms hooks |
| wallet journal math | debit+credit מאזן באגורות |

יעד כיסוי: ≥ 95% על מודולי כסף טהורים.

### 1.3 דפוסים

```ts
// good: pure
expect(splitCoupon({ paidOnSiteAgorot: 900 })).toEqual({
  platformAgorot: 900,
  supplierFromPlatformAgorot: 0,
  balanceDueAgorot: 9100,
});
```

אין mock של כל Next.js. אין קריאת רשת ב-unit.

---

## 2. Integration

| תרחיש | למה לא unit |
|---|---|
| Double redeem אותו קוד | UNIQUE / conditional UPDATE ב-DB |
| Webhook Cardcom כפול | idempotency journal |
| `fn_wallet_transfer` replay | UNIQUE idempotency_key |
| Cart merge concurrent | advisory lock |
| RLS: anon לא כותב orders | policy אמיתית |

סביבה: Supabase מקומי (`supabase start`) או fake ממולא לחוזה.  
Secrets: לעולם לא prod.

---

## 3. E2E (Playwright)

### 3.1 קונפיג

| מפתח | ערך |
|---|---|
| Browser | chromium |
| locale | `he-IL` |
| baseURL | `http://localhost:3000` |
| CI webServer | `pnpm build && pnpm start` |
| Cardcom | `CHECKOUT_PROVIDER=mock` או route mock |
| Workers CI | 1; retries 2 |

### 3.2 חבילות חובה

| Spec | Asserts |
|---|---|
| `home` | RTL, ניווט בסיסי |
| `product` / PDP | מחיר אתר + יתרה בעסק; בלי Escrow UI |
| `cart` | add/remove |
| `checkout` | mock paid → voucher/order |
| `redeem` | הצלחה + already_redeemed |
| `search` | suggest + results (כשמוכן) |
| `a11y` smoke | לפחות login/CTA ניגודיות קריטית |

### 3.3 אסור ב-PR CI

- Cardcom production
- Google OAuth אמיתי
- כתיבה ל-DB משותף (dev/prod)
- soft-open אמיתי

---

## 4. שער CI (סדר)

```text
1. lint (Biome)
2. typecheck (tsc)
3. vitest + coverage floors
4. next build
5. e2e job (build + local/CI supabase + mock Cardcom)
6. visual compare (אופציונלי/נפרד; סף 30%)
```

כשל בשכבה נמוכה עוצר לפני E2E.

---

## 5. מה לבדוק לפי מודל כסף (No Escrow)

| בדיקה | צפי |
|---|---|
| קופון split | platform keeps on-site; supplier_from_platform = 0 |
| Redeem UI | יתרה לגבייה בבית העסק; בלי held/released |
| Physical split | residual אחרי `platform_percent` snapshot |
| Wallet | transfer כפול-רישום; אין endpoint משיכה |
| Admin product | `platform_percent` חובה בלי default |

---

## 6. נתוני בדיקה

| סוג | כלל |
|---|---|
| מוצרי seed | `platform_percent` מפורש; לא 10% מומצא |
| משתמשים | fixtures נפרדים customer/supplier/admin |
| Voucher codes | ייחודיים לכל ריצה (או truncate מקומי) |

---

## 7. Acceptance

- [ ] פירמידה מתועדת ומקושרת ל-CI
- [ ] Unit כסף עם רצפת כיסוי
- [ ] Integration ל-races (redeem/webhook/wallet)
- [ ] E2E checkout+redeem עם mock בלבד
- [ ] אין הסתמכות על Escrow assertions
- [ ] pnpm בלבד; בלי npm install

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | ke-arch docs-lifecycle: פירמידת טסטים מלאה (No Escrow aware) |
