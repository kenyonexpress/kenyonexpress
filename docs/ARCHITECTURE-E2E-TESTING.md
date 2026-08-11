# ארכיטקטורה: E2E Testing (Playwright)

בדיקות End-to-End: Playwright, זרימות רכישה ומימוש, gates אבטחה, staging tags.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. assert: שולם באתר + יתרה בעסק לקופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-TESTING-QA.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/LAUNCH-DAY.md
```

Stack:

| רכיב | בחירה |
|---|---|
| Runner | `@playwright/test` |
| Browser | Chromium (CI) |
| Locale | `he-IL`, RTL |
| Auth | storageState / fixture |
| Data | discovery + `pnpm seed:test` |

---

## 1. החלטה

| # | הכרעה |
|---|---|
| E1 | E2E בודק **חוזה משתמש**, לא יישום פנימי. |
| E2 | אין slug קשיח: discovery בזמן ריצה. |
| E3 | כפתור קנייה מ-`[data-pdp="summary"]` בלבד. |
| E4 | `openPurchasableProduct`: מוצר עם כפתור enabled. |
| E5 | Guest cart + guest `/checkout` פתוחים; outcomes מאחורי gate. |
| E6 | קופון/סריקה: **לעולם** לא QR/קוד לאורח. |
| E7 | Cardcom אמיתי: staging בלבד; לא prod ב-CI ציבורי. |
| E8 | Redeem replay → `already_used`. |
| E9 | כסף UI: PDP/cart/checkout תואמים; קופון dual price. |
| E10 | אין service role מהקליינט בטסט. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| slug עברי hard-coded | seed משתנה; E2 |
| click על related product | flaky; E3 |
| Cardcom prod ב-CI | E7 |
| `waitForTimeout` קבוע | anti-flake: assertions |
| Detox לאפ ב-E2E web | מסמך Mobile נפרד |
| visual regression כחוסם PR | artifact לעין אנושית |

---

## 3. סכמת DB (E2E)

**אין DDL חדש.** Seed:

| מקור | שימוש |
|---|---|
| `pnpm seed:test` | uuid דטרמיניסטיים |
| fixture SQL staging | voucher issued ל-R5-R8 |
| `assert_seeds_allowed` | block prod seed |

tearDown פר-spec; לא global wipe (parallel workers).

---

## 4. כיסוי וזרימות

### 4.1 PR (default)

| spec | עדיפות |
|---|---|
| `home`, `category`, `product` | P1 |
| `cart`, `checkout`, `purchase-flow` | P0 |
| `coupon-scan` (gates) | P0 |
| `auth` | P1 |

### 4.2 Staging (`@staging`)

| ID | תרחיש |
|---|---|
| P6 | paid coupon → voucher |
| P7 | paid physical |
| P8 | idempotent return refresh |
| R5 | scan success |
| R6 | replay already_used |

---

## 5. Helpers (חוזה)

```
e2e/helpers.ts
```

| Helper | תפקיד |
|---|---|
| `openPurchasableProduct` | מוצר buyable |
| `BUY_BUTTON` | שם נגAccessible עברית |
| login fixture | customer / supplier storageState |

---

## 6. מקרי קצה

| # | מצב | assert |
|---|---|---|
| E1 | אין מוצר buyable | fail + הודעת seed |
| E2 | אורח `/coupon/{id}` | login redirect; אין QR |
| E3 | forged redeem token | אין leak |
| E4 | iframe Cardcom double nav | waitForURL return |
| E5 | workers>2 על DB אחד | flaky; workers=2 |
| E6 | wrong supplier scan | generic reject |
| E7 | expired voucher | reject |
| E8 | `@staging` בלי secrets | skip tagged |

---

## 7. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | `full-purchase.spec.ts` | 2026-08-12 |
| O2 | `full-redeem.spec.ts` staging | 2026-08-12 |
| O3 | WebKit iOS nightly | 2026-08-12 |

---

## 8. Acceptance

- [ ] Playwright P0 gates ב-CI  
- [ ] purchase-flow: search → checkout  
- [ ] Coupon dual price  
- [ ] אורח לא רואה QR  
- [ ] Staging P6+R5+R6 מתועדים  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני Playwright |
| 2026-08-12 | batch-2: BINDING עברית; תבנית חובה |
