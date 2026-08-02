# ARCHITECTURE: E2E Testing (Playwright)

ארכיטקטורת בדיקות End-to-End ל-KenyonExpress: **Playwright**, עם דגש על זרימות רכישה מלאות ומימוש קופון.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד במסמך זה. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/LAUNCH-DAY.md
```

Stack יעד / as-built:

| רכיב | בחירה |
|---|---|
| Runner | Playwright (`@playwright/test`) |
| Browser | Chromium (CI); WebKit/Firefox אופציונלי בלילה |
| Locale | `he-IL`, RTL |
| Base URL | preview / local `NEXT_PUBLIC_APP_URL` |
| Auth | storageState / fixture login; לא hard-code סיסמאות ב-git |
| Data | discovery מול קטלוג חי (slugs עברית); seed ייעודי ל-redeem מלא |

קבצים as-built (לייחוס):

```
e2e/helpers.ts
e2e/home.spec.ts
e2e/category.spec.ts
e2e/product.spec.ts
e2e/cart.spec.ts
e2e/checkout.spec.ts
e2e/purchase-flow.spec.ts
e2e/coupons.spec.ts
e2e/coupon-scan.spec.ts
e2e/auth.spec.ts
playwright.config.ts
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| E1 | E2E בודק **חוזה משתמש**, לא יישום פנימי. כשל = שבירת מסלול קנייה/מימוש. |
| E2 | אין slug קשיח לקטלוג: discovery בזמן ריצה (`/products`, חיפוש). Seed משתנה; slug עברי נרקב. |
| E3 | כפתור קנייה מ-`[data-pdp="summary"]` בלבד (לא related products). |
| E4 | מוצר לרכישה: `openPurchasableProduct` (או מקביל) שמוצא כפתור enabled; לא הראשון במלאי אפס. |
| E5 | Guest cart + guest `/checkout` פתוחים; subtree `/checkout/*` outcomes נשאר מאחורי gate לפי proxy. |
| E6 | מסכי קופון/סריקה **לעולם** לא מראים קוד/QR לאורח. |
| E7 | רכישה מלאה עם Cardcom אמיתי = סביבת staging + מפתחות בדיקה / stub מאושר; לא כרטיס פרוד ב-CI ציבורי. |
| E8 | Redeem אטומי: replay → `already_used` (או מקביל), לא כפל מימוש. |
| E9 | כסף באסרציות UI: מחיר שמוצג ב-PDP/cart/checkout תואם; לקופון: שולם באתר + יתרה בעסק. |
| E10 | בדיקות לא כותבות service role מהקליינט; fixtures שרת נפרדים אם נדרש seed. |

---

## 1. מטרות כיסוי

### 1.1 פירמידה

```text
Unit / contract (מחיר, JSON-LD, coupon math)
        ▲
Integration (RPC redeem, finalize, outbox)
        ▲
E2E Playwright (מסלולי משתמש מלאים)
```

E2E יקר: רק מסלולים ששוברים כסף או אמון. לא לשכפל כל unit test.

### 1.2 משטחים חובה

| משטח | קובץ יעד / חי | עדיפות |
|---|---|---|
| Home smoke | `home.spec.ts` | P1 |
| Category / Product | `category`, `product` | P1 |
| Cart | `cart.spec.ts` | P0 |
| Guest → checkout form | `checkout.spec.ts`, `purchase-flow.spec.ts` | P0 |
| Coupon PDP pricing | `purchase-flow` (שולם באתר + יתרה) | P0 |
| Auth gates coupons/scan | `coupon-scan.spec.ts` | P0 |
| Full paid purchase (staging) | `purchase-flow` מורחב / `e2e/full-purchase.spec.ts` | P0 staging |
| Full redemption (staging) | `e2e/full-redeem.spec.ts` | P0 staging |

---

## 2. Helpers (חוזה)

מיקום:

```
e2e/helpers.ts
```

| Helper | תפקיד |
|---|---|
| `firstProductHref` / `openFirstProduct` | גילוי מוצר כלשהו |
| `openPurchasableProduct` | מוצר עם כפתור קנייה enabled |
| `BUY_BUTTON` | שם נגיש בעברית לכפתור הוספה |
| `seedCart` / mirror helpers | מילוי עגלה יציב כשצריך (בלי related-product bugs) |
| login fixture (יעד) | customer / supplier storageState |

כללי discovery:

1. timeout גילוי קצר ומובהק (למשל 15s), לא timeout גלובלי ענק
2. אם אין מוצר buyable ב-N הראשונים → fail עם הודעת seed, לא flaky click על related
3. חיפוש: מילה ≥ 2 תווים משם מוצר אמיתי

---

## 3. זרימת רכישה מלאה (Full purchase)

### 3.1 Happy path (חוזה משתמש)

```text
/products או /search?q=…
  → /product/{slug}
  → Add to cart (summary buy button)
  → /cart (שורות + ₪)
  → CTA "המשך לתשלום"
  → /checkout (טופס קופה)
  → login אם נדרש לתשלום (לפי חוזה נוכחי: guest form, pay press may require auth)
  → Cardcom Low Profile (staging)
  → return / webhook / finalize
  → /account/orders/{id} או success
  → אם קופון: /account/coupons + QR/code
  → (יעד) notification_outbox / Resend לא חוסם את המסלול
```

### 3.2 מפרט בדיקות רכישה

| ID | תרחיש | שלבים | Asserts |
|---|---|---|---|
| P1 | Search → cart → checkout | discovery, add, cart ₪, `/checkout` heading `קופה` | URL + UI |
| P2 | Coupon PDP dual price | `/products?type=coupon`, מוצר מתומחר | שולם באתר + יתרה בעסק; לא אחוז מחירון שגוי |
| P3 | Guest checkout open | עגלה מלאה, אורח | `/checkout` לא מנתב ל-`/login` |
| P4 | Checkout subtree gated | `/checkout/success` (או outcome) בלי session | bounce ל-login לפי proxy |
| P5 | Cart CTA | קישור/כפתור `המשך לתשלום` | מגיע ל-checkout עם אותה עגלה |
| P6 | Paid coupon staging | כרטיס בדיקה Cardcom | `orders.paid_at` set; `vouchers` issued; UI מציג קוד |
| P7 | Paid physical staging | אותו מסלול | אין voucher; אישור הזמנה |
| P8 | Idempotent pay return | refresh על return URL | לא כפל חיוב / לא כפל voucher |

### 3.3 מה לא נבדק ב-CI ציבורי בלי secrets

- חיוב Cardcom פרוד
- שליחת Resend אמיתית (מותר assert על outbox row בסביבת DB בדיקות)
- סכומי payout לספק

---

## 4. זרימת מימוש מלאה (Full redemption)

### 4.1 Happy path

```text
Customer (logged in): /account/coupons או /coupon/{id}
  → מציג code + QR (רק לבעלים)
Supplier member: /scan (או /supplier/scan → redirect)
  → סריקה / הזנת קוד
  → POST redeem
  → הצלחה: סטטוס redeemed, סכום לגבייה מהלקוח
  → Customer: אישור מימוש (UI / מייל)
  → Replay אותה סריקה → already_used (לא כפל)
```

### 4.2 מפרט בדיקות מימוש

| ID | תרחיש | Asserts |
|---|---|---|
| R1 | אורח ב-`/coupon/{id}` | redirect ל-`/login?next=…`; אין `coupon-code`; אין QR `data:image` |
| R2 | אורח ב-`/scan` | redirect ל-login |
| R3 | `/supplier/scan` legacy | status < 400; מגיע ל-`/scan` או login |
| R4 | forged `/redeem/…` token | אין טקסט `לגבייה מהלקוח`; אין הדלפת קיום שובר |
| R5 | staging: issue → scan success | voucher `redeemed`; collected מוצג לספק |
| R6 | staging: replay scan | `already_used` (או מקביל); אין ledger כפול |
| R7 | wrong supplier | סירוב בלי לחשוף יתר על המידה |
| R8 | expired voucher | סירוב מתאים |

### 4.3 Seed ל-redeem מלא (יעד)

לסביבת staging / CI עם DB:

1. יצירת משתמש לקוח + ספק member (fixture SQL או admin API מוגן)
2. הזמנת קופון paid (או insert voucher `issued` חתום דרך שרת בדיקות)
3. הרצת R5–R8
4. Cleanup / transaction rollback אם אפשרי

בלי seed: נשארים על R1–R4 (gates) בלבד; לא לסמן ✅ על redemption מלא.

---

## 5. Auth ו-gates

| Route | אורח | מחובר לקוח | חבר ספק |
|---|---|---|---|
| `/` catalog | כן | כן | כן |
| `/cart`, `/checkout` | כן (form) | כן | כן |
| `/checkout/*` outcomes | gate | לפי חוזה | |
| `/account/**` | login | כן | |
| `/coupon/{id}` | login + next | בעלים בלבד | לא |
| `/scan` | login | לא (אלא אם member) | כן |
| `/admin/**` | חסום | חסום | חסום |

אסרציות: `getByRole('heading', { name: 'כניסה לחשבון' })` בעברית כשמצפים ל-login.

---

## 6. ארגון קבצים (יעד)

```text
e2e/
  helpers.ts
  fixtures/
    auth.customer.json      # storageState (לא ב-git אם מכיל סודות; CI secrets)
    auth.supplier.json
  purchase-flow.spec.ts     # search → checkout (+ coupon pricing)
  full-purchase.spec.ts     # staging Cardcom (tagged @staging)
  coupon-scan.spec.ts       # gates
  full-redeem.spec.ts       # staging redeem (tagged @staging)
  cart.spec.ts
  checkout.spec.ts
  …
```

Tags:

| Tag | מתי רץ |
|---|---|
| (default) | כל PR |
| `@staging` | pipeline עם Cardcom test + DB seed |
| `@smoke` | אחרי deploy preview |

---

## 7. Playwright config (חוזה)

| הגדרה | ערך יעד |
|---|---|
| `testDir` | `e2e` |
| `retries` | 1 ב-CI, 0 מקומי (או הפוך לפי flaky budget) |
| `workers` | מוגבל ב-CI כדי לא להרוג DB |
| `locale` | `he-IL` |
| `timezoneId` | `Asia/Jerusalem` |
| `baseURL` | מ-env |
| screenshot / trace | on-first-retry |
| `forbidOnly` | true ב-CI |

אסור:

- `test.only` ב-main
- hard-coded production secrets
- תלות ב-Make/Zapier

---

## 8. CI

| Job | תוכן |
|---|---|
| `e2e-pr` | default specs מול preview/local; בלי Cardcom charge |
| `e2e-staging` | `@staging` purchase + redeem על סביבת בדיקות |
| Artifacts | trace, screenshot, video על כשל |

שער PR: `e2e-pr` ירוק.  
שער לפני launch: `e2e-staging` P6+P7+R5+R6 ירוקים פעם אחת מתועדת (ראה LAUNCH-DAY).

---

## 9. יציבות (anti-flake)

1. `getByRole` / עברית נגישה לפני CSS selectors שבירים
2. אין `waitForTimeout` קבוע כתחליף ל-assertion
3. discovery עם הודעת seed ברורה
4. לא לשתף state בין טסטים בלי fixture מפורש
5. כשל רשת Cardcom ב-staging → retry ממוקד, לא העלמת assert
6. תאריכים: timezone ירושלים

---

## 10. מיפוי למסלולי כסף

| אירוע דומיין | E2E שמכסה |
|---|---|
| add to cart | cart, purchase-flow P1 |
| begin checkout | P3–P5 |
| paid + voucher issue | P6 |
| paid physical | P7 |
| redeem success | R5 |
| redeem replay | R6 |
| notification enqueue | לא חוסם E2E; אופציונלי assert DB ב-staging |

---

## 11. Acceptance

- [ ] Playwright רץ ב-CI על משטחי P0 gates (cart/checkout/coupon-scan)
- [ ] `purchase-flow`: search → add → cart → checkout
- [ ] Coupon PDP מציג שולם באתר + יתרה בעסק
- [ ] אורח לא רואה QR/קוד
- [ ] Staging: רכישת קופון מלאה עד voucher
- [ ] Staging: סריקה + replay `already_used`
- [ ] אין secrets ב-git; אין נגיעה ב-main לצורך מסמך זה

---

## 12. Out of scope

- בדיקות עומס / k6
- Detox/Maestro לאפילקציית Expo (מסמך Mobile)
- Visual regression מלא (שייך ל-`compare.mjs` / SEO-PERFORMANCE)
- יישום הקוד עצמו במסמך זה

---

## 13. Related

```
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/LAUNCH-DAY.md
```

---

## 14. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני: Playwright full purchase + redemption; gates as-built; staging tags; על `arch/docs-queue` |
