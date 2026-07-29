# ARCHITECTURE-TESTING: אסטרטגיית הבדיקות המלאה

תאריך: 2026-07-29 | ענף: `arch/mega-docs` | סטטוס: **מסמך מחייב, שכבת מימוש**

כפיפות סמכות. כפוף ל-`docs/MASTER-ARCHITECTURE.md` (הכרעה 1.49, ‏D1-D22)
ול-`docs/ARCHITECTURE-SECURITY.md` בכל מה שנוגע לבקרות אבטחה. מרחיב את
`docs/ARCHITECTURE-TESTING-CICD.md` וגובר עליו בפרטי המימוש של Vitest,
Playwright, בדיקות עומס ובדיקות RTL ויזואליות. הכרעות CI/CD ומדיניות
merge נשארות שם.

---

## 0. מצב הפתיחה, מאומת

נמדד ב-2026-07-29 מול קוד ה-branch.

| מה | מצב |
|---|---|
| ‏Vitest | ‏3.1.2, ‏`vitest.config.ts`, סביבת jsdom |
| קבצי בדיקה ב-`src/` | **56** |
| ‏Playwright | ‏1.50.1, ‏`playwright.config.ts`, chromium בלבד |
| ‏specs ב-`e2e/` | **7** + `helpers.ts` (‏744 שורות סה"כ) |
| בדיקות SQL | **4** ב-`tests/sql/` |
| ‏CI | ‏`.github/workflows/ci.yml`: lint, typecheck, test, build, e2e |
| רצפות כיסוי | 6 מודולי כסף ב-95% (‏lines/branches/functions/statements) |
| ‏job של E2E ב-CI | **מדלג**, אין `CI_SUPABASE_URL` |
| בדיקות עומס | **אין** |
| בדיקות ויזואליות | **אין** |
| ‏axe / נגישות | **אין** |
| ‏Lighthouse CI | **אין** |
| ‏harness מיגרציות apply-twice | **אין** |

הפילוח של 56 קבצי הבדיקה מספר סיפור מדויק:

```
10  src/lib/admin           6  src/server/domain/vouchers
 5  src/lib/commerce        5  src/lib
 4  src/server/domain/orders  3  src/lib/checkout
 3  src/__tests__           2  src/lib/{supabase,payments,auth,analytics}
 1  כל השאר (13 תיקיות)
```

הכסף מכוסה טוב. **‏`src/components/` מופיע אפס פעמים.** אין ולו בדיקת
רכיב אחת, וזה בדיוק האזור שבו RTL נשבר.

---

## 1. הפירמידה, ולמה היא בצורה הזאת

| שכבה | כלי | כמה | מה היא מוכיחה | מהירות |
|---|---|---|---|---|
| חוקי כסף | ‏Vitest, פונקציות טהורות | ‏250+ | חשבון נכון לכל אגורה | ‏ms |
| יחידה | ‏Vitest | ‏56 קבצים | לוגיקה במודול | ‏ms |
| רכיב | ‏Vitest + Testing Library | **0 היום** | ‏RTL, נגישות, מצבים | ‏ms |
| ‏SQL / RLS | ‏psql מול stack מקומי | 4 היום | הגבול האמיתי | שניות |
| מיגרציות | ‏harness apply-twice | **0 היום** | הרצף בונה DB מאפס | דקות |
| ‏E2E | ‏Playwright | 7 specs | המסלול עובד בדפדפן | דקות |
| ויזואלי | ‏Playwright screenshots | **0 היום** | ה-RTL לא זז | דקות |
| עומס | ‏k6 | **0 היום** | המערכת מחזיקה | דקות |

העיקרון שקובע את הצורה: **הבדיקה הזולה ביותר שיכולה לתפוס את הבאג
תופסת אותו.** שגיאת עיגול באגורות היא בדיקת יחידה של 3 מילישניות ולא
תרחיש E2E של 40 שניות. אבל "האם הכפתור באמת נלחץ אחרי שהתשלום חזר
מ-iframe" אינו ניתן להוכחה בלי דפדפן.

---

## 2. מסלול הכסף: הרשימה הסגורה

### 2.1 למה רשימה סגורה ולא אחוז

`vitest.config.ts` כבר מכריע בזה נכון, וההערה בקובץ מנסחת את זה:

> אחוז כיסוי גלובלי הוא בכוונה **לא** שער merge. רשימת האינווריאנטים
> הסגורה היא מה שבאמת מגן על מסלול הכסף.

כיסוי של 95% אומר ששורות רצו, לא שהן נכונות. בדיקה שקוראת לפונקציה
ולא בודקת את הפלט נותנת 100%. הרצפות קיימות כדי שאף אחד לא **ימחק**
בדיקה, לא כדי להוכיח נכונות.

ששת המודולים עם רצפת 95%:

```
src/lib/commerce/money.ts
src/lib/commerce/commission.ts
src/lib/checkout/split.ts
src/server/domain/orders/settlement.ts
src/server/domain/orders/escrow.ts
src/server/domain/orders/state-machine.ts
```

### 2.2 האינווריאנטים, לפי המודל המחייב

המודל מ-`CONTRADICTIONS.md` (היפוך 28.07): קופון = כל המקדמה
לפלטפורמה, הספק מקבל 0 מאיתנו; פיזי = פיצול מיידי לפי
`platform_percent` דינמי; אין אחוז קבוע בשום מקום; כל כסף באגורות
integer.

| # | אינווריאנט | איך נבדק |
|---|---|---|
| M1 | כל סכום הוא integer באגורות. אין float | ‏typecheck + assert על כל פלט |
| M2 | ‏`Number.isSafeInteger` על כל תוצאה | ‏property test |
| M3 | סכום החלקים = השלם, תמיד | ‏property test על 10,000 קלטים אקראיים |
| M4 | עיגול: אף אגורה לא נעלמת ולא נולדת | חלוקה של 100 ל-3, הבדיקה הקלאסית |
| M5 | קופון: `platform = coupon_price`, `supplier_due = 0` | בדיקה מפורשת |
| M6 | קופון: `balance_due = face_value - coupon_price` | בדיקה מפורשת |
| M7 | פיזי: `platform = round(total * platform_percent / 100)` | בדיקה + property |
| M8 | פיזי: `supplier = total - platform`. תמיד השארית | בדיקה. **לא** חישוב שני |
| M9 | `platform_percent` חסר ⇒ **זריקה**, לא ברירת מחדל | בדיקה שמצפה ל-throw |
| M10 | `platform_percent` מחוץ ל-0..100 ⇒ זריקה | ‏property |
| M11 | ‏`coupon_expiry_days` חסר ⇒ סירוב הנפקה | בדיקה |
| M12 | סכום שלילי ⇒ זריקה | ‏property |
| M13 | ‏snapshot ל-`order_items` שווה למה שחושב | בדיקה |
| M14 | ‏`platform + supplier_split = 100` על כל מוצר | ‏SQL + יחידה |
| M15 | ‏`commission_type` תואם ל-`type` | ‏SQL (אילוץ 093) |
| M16 | ‏ledger מאוזן: סכום חובה = סכום זכות | ‏SQL |
| M17 | אין `escrow_holds` בהנפקת קופון (המודל של 28.07) | בדיקה שמצפה ל-0 שורות |
| M18 | ‏`settlement_status` של קופון = `split_executed` | בדיקה |
| M19 | ‏idempotency: אותו מפתח פעמיים = חיוב אחד | בדיקה |
| M20 | ‏cashback חסום ב-25% מה-fee | ‏property |

**‏M8 היא האינווריאנט שהכי קל להפר.** חישוב חלק הספק כ-
`round(total * supplier_percent / 100)` במקום כשארית מייצר סטייה של
אגורה בערך אחד מכל שלושה סכומים, לכיוונים אקראיים. הצד השני של הפיצול
הוא **תמיד** `total - platform`, לעולם לא חישוב עצמאי.

### 2.3 Property-based testing

זה החלק שחסר היום. בדיקות טבלה תופסות את המקרים שנחשבו עליהם; מנוע
כסף נשבר על מה שלא.

```ts
// src/lib/commerce/money.property.test.ts
import fc from 'fast-check'

describe('split invariants', () => {
  it('never creates or destroys an agora', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_00 }),  // agorot: 1 to 100,000 ILS
        fc.integer({ min: 0, max: 100 }),          // platform_percent
        (totalAgorot, percent) => {
          const { platformAgorot, supplierAgorot } = splitPhysical(totalAgorot, percent)
          expect(platformAgorot + supplierAgorot).toBe(totalAgorot)   // M3
          expect(Number.isSafeInteger(platformAgorot)).toBe(true)     // M2
          expect(platformAgorot).toBeGreaterThanOrEqual(0)
          expect(supplierAgorot).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 10_000 },
    )
  })

  it('refuses to guess a missing percent', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000_000 }), (total) => {
      expect(() => splitPhysical(total, null as never)).toThrow()      // M9, C1
    }))
  })
})
```

`fast-check` הוא התלות היחידה שהמסמך הזה מוסיף, והיא dev-only.

### 2.4 בדיקות מרוץ

הכרעה D9: **חובה לכל פונקציית כסף.** לא ניתנות לביטוי ב-Vitest לבדו,
כי המרוץ הוא בין טרנזקציות Postgres. הן חיות ב-`tests/sql/`:

```sql
-- tests/sql/race_voucher_double_redeem.sql
begin;
  select plan(2);

  -- שתי טרנזקציות מקבילות שמנסות לממש את אותו שובר
  select lives_ok($$ select public.redeem_voucher('CODE1', '<supplier>') $$);
  -- הטרנזקציה השנייה, מסשן שני, חייבת לקבל rejected ולא to succeed
  select is(
    (select count(*) from public.voucher_redemptions where voucher_id = '<voucher>'),
    1::bigint,
    'exactly one redemption row survives a concurrent double scan'
  );

  select * from finish();
rollback;
```

חמישה מרוצים חובה:

| # | מרוץ | התוצאה הנכונה |
|---|---|---|
| R1 | מימוש כפול של אותו שובר | שורת מימוש אחת בדיוק |
| R2 | ‏webhook כפול על אותה עסקה | חיוב אחד, `23505` בשני |
| R3 | שתי הזמנות על יחידת מלאי אחרונה | אחת עוברת, אחת נדחית |
| R4 | הוצאה כפולה מהארנק | היתרה לא יורדת מתחת ל-0 |
| R5 | ‏`begin_checkout` פעמיים באותה שנייה | הזמנה אחת (‏idempotency key) |

---

## 3. Vitest: בדיקות יחידה ורכיב

### 3.1 ההגדרה

`vitest.config.ts` הקיים נכון. שלוש תוספות:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./vitest.setup.ts'],
  globals: true,
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  exclude: ['node_modules', '.next', 'e2e'],

  // חדש: כישלון על בדיקה שלא מכילה assertion.
  // בדיקה שרצה ולא בודקת כלום היא כיסוי מזויף.
  passWithNoTests: false,

  // חדש: זמן קצוב קצר. בדיקת יחידה שרצה 5 שניות עושה I/O שאסור לה.
  testTimeout: 5_000,

  // חדש: סביבה פר-קובץ. בדיקות שרת לא צריכות jsdom והוא מאט אותן.
  environmentMatchGlobs: [
    ['src/server/**', 'node'],
    ['src/lib/commerce/**', 'node'],
    ['src/lib/payments/**', 'node'],
  ],
}
```

`environmentMatchGlobs` הוא לא כוונון ביצועים בלבד: הרצת קוד שרת תחת
jsdom נותנת `window` שלא אמור להתקיים, ומסתירה באג של `server-only`
שהיה מתפוצץ בפרודקשן.

### 3.2 מה נבדק ומה לא

| נבדק ביחידה | לא נבדק ביחידה |
|---|---|
| חישוב כסף טהור | קריאות רשת אמיתיות |
| מכונות מצבים | ‏RLS (זה SQL) |
| ולידציית Zod | רינדור מלא של דף |
| טרנספורמים (‏WP, ‏search) | ‏Server Actions מקצה לקצה |
| ‏helpers של תאריך ותוקף | ‏Cardcom |
| פורמט מטבע ותאריך בעברית | |
| בניית גרף JSON-LD | |
| רכיבים: RTL, מצבים, נגישות | |

### 3.3 mocking: הכלל

**מדמים בגבול, לא בפנים.** ‏Supabase client מדומה בשכבת ה-client;
פונקציית הכסף שמעליו לא. בדיקה שמדמה את `splitPhysical` כדי לבדוק את
מי שקורא לה לא בודקת כלום.

```ts
// vitest.setup.ts
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Cardcom: לעולם לא רשת אמיתית בבדיקות.
// loadCardcomEnv() כבר בוחר מספק mock כש-CARDCOM_TERMINAL_NUMBER ריק
// מחוץ לפרודקשן. זו התנהגות נכונה ומסתמכים עליה.
```

### 3.4 בדיקות רכיב: החור הגדול

אפס בדיקות ב-`src/components/`. ‏Testing Library כבר מותקנת דרך
`@vitejs/plugin-react` ו-jsdom. התבנית:

```tsx
// src/components/product/ProductCard.test.tsx
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

const COUPON = {
  name_he: 'ארוחה זוגית', type: 'coupon',
  coupon_price_ils: 89.9, price_ils: 250, images: [{ url: '/x.webp', alt: 'ארוחה' }],
}

describe('ProductCard', () => {
  it('shows the coupon price, not the deal value', () => {
    render(<ProductCard product={COUPON} />)
    // C4: coupon_price_ils הוא הערך הקנוני שהלקוח משלם.
    // הצגת price_ils כאן היא הבאג של ציטוט מול חיוב.
    expect(screen.getByText(/89\.90/)).toBeInTheDocument()
    expect(screen.queryByText(/^250/)).not.toBeInTheDocument()
  })

  it('renders RTL and keeps the price LTR inside it', () => {
    const { container } = render(<ProductCard product={COUPON} />)
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl')
    // מספר בתוך משפט עברי חייב bdi, אחרת ה-bidi הופך את הסדר
    expect(container.querySelector('bdi')).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ProductCard product={COUPON} />)
    expect(await axe(container)).toHaveNoViolations()     // LEG-03
  })

  it('shows sold_out state without claiming availability', () => {
    render(<ProductCard product={{ ...COUPON, status: 'sold_out' }} />)
    expect(screen.getByText('אזל')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /הוסף/ })).toBeNull()
  })
})
```

הרכיבים שחייבים בדיקה, לפי סדר סיכון:

| רכיב | למה |
|---|---|
| `ProductCard` | מציג מחיר. מחיר שגוי הוא סיכון משפטי |
| `PriceDisplay` / פורמט מטבע | המרת אגורות לתצוגה |
| `CartSummary` | חשבון גלוי ללקוח |
| `CheckoutForm` | ולידציה, מצבי שגיאה |
| `AddToCartButton` | מצב טעינה, לחיצה כפולה |
| `VoucherQR` | לא לחשוף טוקן ב-DOM מעבר לנדרש |
| `ScannerScreen` | מצבי דחייה, ‏9.4 של מסמך האבטחה |
| `ProductForm` (אדמין) | ארבעת כפתורי הכסף |

### 3.5 בדיקות RLS ו-SQL

ארבעת הקבצים ב-`tests/sql/` מכסים ארנק, מחזור הזמנה, ‏RLS של שובר
ומחזור מימוש. הרשימה המלאה בסעיף 1.6 של `ARCHITECTURE-SECURITY.md`.

```bash
# Terminal:
supabase db reset --local                     # רצף מלא מאפס
psql "$LOCAL_DB_URL" -f tests/sql/90_test_support.sql
for f in tests/sql/*.sql; do
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
done
```

**‏D18 מחייב:** אין טבלאות בדיקה במיגרציות. תמיכת הבדיקות חיה ב-
`supabase/seed.sql` ו-`tests/sql/90_test_support.sql` בלבד.

### 3.6 בדיקות SEO ו-structured data

הגרף נבנה בשרת מדאטה שלנו, כלומר הוא פונקציה טהורה וניתן לבדיקה זולה:

```ts
describe('productGraph', () => {
  it('prices a coupon at coupon_price_ils, not at the deal value', () => {
    const g = productGraph({ ...COUPON }, BASE)
    expect(g.offers.price).toBe('89.90')          // מחרוזת, שתי ספרות
  })

  it('always carries priceValidUntil in the future', () => {
    const g = productGraph(COUPON, BASE)
    expect(new Date(g.offers.priceValidUntil).getTime()).toBeGreaterThan(Date.now())
  })

  it('never emits aggregateRating: we have no reviews', () => {
    expect(productGraph(COUPON, BASE)).not.toHaveProperty('aggregateRating')
  })

  it('marks sold_out as SoldOut, not InStock', () => {
    const g = productGraph({ ...COUPON, status: 'sold_out' }, BASE)
    expect(g.offers.availability).toBe('https://schema.org/SoldOut')
  })

  it('escapes a closing script tag in a description', () => {
    const g = productGraph({ ...COUPON, description_he: '</script><img onerror=x>' }, BASE)
    expect(JSON.stringify(g).replace(/</g, '\\u003c')).not.toContain('</script>')
  })
})
```

הבדיקה האחרונה היא בקרת אבטחה: `description_he` מגיע מוורדפרס.

---

## 4. Playwright: E2E

### 4.1 מה שיש, ומה שבור

שבעה specs: `auth`, `cart`, `category`, `checkout`, `home`, `product`,
`purchase-flow`. הקונפיג עצמו טוב במיוחד בשתי נקודות שנלמדו מכאב:

- **‏workers מוגבל ל-2.** ההערה בקובץ מתעדת שספירת המעבר השתנתה בין
  ריצות (‏53, ‏50, ‏44) בגלל תחרות על אותו פרויקט Supabase, לא בגלל
  רגרסיה. זה האבחון הנכון וההגבלה נכונה.
- **‏CI מריץ `pnpm start`** ולא `pnpm dev`, כי RTL, ‏caching ו-server
  actions מתנהגים אחרת בבנייה.

**מה שבור: ה-job של E2E ב-CI מדלג.** אין `CI_SUPABASE_URL`, ולכן
הוא רץ ומצליח בלי לבדוק כלום. ההערה בקובץ ה-CI מנמקת את זה נכון ("בדיקה
אדומה קבועה מלמדת אנשים להתעלם מבדיקות אדומות"), אבל התוצאה היום היא
שער שנראה ירוק ולא בודק דבר. **זה הפער החמור ביותר בכל המסמך.**

### 4.2 מסלול ה-checkout מקצה לקצה

`checkout.spec.ts` הוא 56 שורות. המסלול המלא דורש יותר, כי הוא כולל את
ה-iframe ואת שני הניווטים:

```ts
// e2e/checkout-full.spec.ts
test('coupon purchase: cart to voucher in the account', async ({ page }) => {
  await page.goto('/product/test-coupon-product')

  // 1. המחיר על הדף הוא coupon_price, וזה מה שנחייב
  const shown = await page.getByTestId('price-now').innerText()
  await page.getByRole('button', { name: 'הוסף לסל' }).click()
  await expect(page.getByTestId('cart-count')).toHaveText('1')

  // 2. אורח ממלא את הטופס. אין חסימה ל-/login: זו החלטה מכוונת ב-proxy.ts
  await page.goto('/checkout')
  await fillCheckoutForm(page)

  // 3. הסכום בצ'קאאוט = הסכום בדף המוצר. ציטוט וחיוב מאותה עמודה
  await expect(page.getByTestId('checkout-total')).toHaveText(shown)

  // 4. התחברות בלחיצת התשלום, ואיחוד עגלת האורח
  await page.getByRole('button', { name: 'לתשלום' }).click()
  await signIn(page, TEST_USER)
  await expect(page.getByTestId('checkout-total')).toHaveText(shown)  // לא השתנה

  // 5. ה-iframe של Cardcom. במצב sandbox יש עמוד מדומה
  const frame = page.frameLocator('[data-testid="cardcom-frame"]')
  await frame.getByRole('button', { name: /approve/i }).click()

  // 6. הקפיצה הכפולה: frame-return מזיז את החלון העליון ל-return
  await page.waitForURL('**/checkout/return*', { timeout: 30_000 })
  await expect(page.getByText('התשלום התקבל')).toBeVisible()

  // 7. השובר קיים באזור האישי
  await page.goto('/account/vouchers')
  await expect(page.getByTestId('voucher-card')).toHaveCount(1)
})
```

צעד 6 הוא הסיבה היחידה שהתרחיש הזה חייב דפדפן. הניווט הכפול
(‏Cardcom אל ה-iframe, ‏iframe אל החלון העליון) עם עוגיות `SameSite=Lax`
שנשמטות בדרך הוא בדיוק המקום שבו כל בדיקה זולה יותר תיתן תשובה שגויה.

### 4.3 מסלול המימוש

```ts
test('supplier scans a voucher once, and only once', async ({ page, context }) => {
  await signInAs(page, SUPPLIER_USER)
  await page.goto('/supplier/scan')

  await page.getByLabel('קוד ידני').fill(VOUCHER_CODE)
  await page.getByRole('button', { name: 'מימוש' }).click()

  await expect(page.getByText('מומש')).toBeVisible()
  await expect(page.getByTestId('collect-amount')).toContainText('160')  // היתרה בקופה

  // סריקה שנייה של אותו קוד: נדחית
  await page.getByLabel('קוד ידני').fill(VOUCHER_CODE)
  await page.getByRole('button', { name: 'מימוש' }).click()
  await expect(page.getByText(/כבר מומש|לא תקף/)).toBeVisible()

  // ספק אחר על אותו קוד: הודעה גנרית, בלי לאשר שהקוד קיים
  const other = await context.newPage()
  await signInAs(other, OTHER_SUPPLIER_USER)
  await other.goto('/supplier/scan')
  await other.getByLabel('קוד ידני').fill(VOUCHER_CODE)
  await other.getByRole('button', { name: 'מימוש' }).click()
  await expect(other.getByText('לא תקף')).toBeVisible()
  await expect(other.getByText(/כבר מומש/)).toHaveCount(0)   // אנטי-enumeration
})
```

הטענה האחרונה היא בדיקת אבטחה שנראית כמו בדיקת UI: היא מוודאת שסעיף
9.4 של מסמך האבטחה נאכף בממשק ולא רק ב-RPC.

### 4.4 דאטת בדיקה

`pnpm seed:test` קיים. הכללים:

- ‏seed דטרמיניסטי: אותם uuid בכל ריצה, כדי שאפשר לקשר קשיח ב-spec.
- ‏`tearDown` פר-spec, לא גלובלי: ריצות מקבילות לא דורסות זו את זו.
- ‏`assert_seeds_allowed` חוסם seed בפרודקשן. **הבדיקה של החסימה עצמה
  היא בדיקה**, כי סיסמת demo קשיחה בגיט היא SEC-14.
- לעולם לא טוקן Cardcom אמיתי. ‏sandbox בלבד.

### 4.5 מה חסר ב-E2E

| # | תרחיש | חומרה |
|---|---|---|
| E1 | ‏checkout מלא עם iframe וקפיצה כפולה | **גבוה** |
| E2 | מימוש שובר, כולל סריקה כפולה וספק זר | **גבוה** |
| E3 | תשלום שנכשל: ‏`/checkout/failed`, העגלה שורדת | גבוה |
| E4 | ‏webhook מגיע אחרי שהמשתמש סגר את החלון | גבוה |
| E5 | ארנק: צבירה, מימוש, יתרה לא שלילית | בינוני |
| E6 | ‏RTL בכל דף: אין גלילה אופקית | בינוני |
| E7 | ‏RBAC: ‏support לא מגיע לעורך הקטלוג | בינוני |
| E8 | ‏301 מכתובת WP ישנה מגיע ל-200 | **חוסם cutover** |

---

## 5. בדיקות עומס

### 5.1 למה בכלל, על אתר בהיקף הזה

לא בשביל "מיליון משתמשים". שלוש שאלות ממשיות:

1. **מבצע.** דיל שמתפרסם בוואטסאפ מייצר קפיצה מ-5 ל-500 מבקרים בדקות.
2. **‏connection pool.** ‏Supabase ב-Free/Pro מגביל חיבורים. ‏Vercel
   serverless פותח חיבור פר-instance. זה נגמר ב-`too many connections`
   הרבה לפני שה-CPU עובד.
3. **תור המימוש.** אירוע אצל ספק אחד: 50 סריקות בדקה מול RPC אחד עם
   נעילת שורה.

### 5.2 התרחישים

```js
// load/browse.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    // גל של מבצע: 0 ל-200 משתמשים בשתי דקות
    flash_sale: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration:  ['p(95)<1000', 'p(99)<2500'],
    http_req_failed:    ['rate<0.01'],
    'http_req_duration{name:product}': ['p(95)<800'],
  },
}

export default function () {
  const home = http.get(`${__ENV.BASE}/`, { tags: { name: 'home' } })
  check(home, { 'home 200': (r) => r.status === 200 })
  sleep(Math.random() * 3)

  const p = http.get(`${__ENV.BASE}/product/${randomSlug()}`, { tags: { name: 'product' } })
  check(p, {
    'product 200': (r) => r.status === 200,
    'has price':   (r) => r.body.includes('₪'),
  })
  sleep(Math.random() * 5)
}
```

| # | תרחיש | פרופיל | מה נמדד |
|---|---|---|---|
| L1 | גלישה בקטלוג | ‏0→200 VU, ‏9 דק' | ‏p95 של דף מוצר, ‏TTFB |
| L2 | ‏checkout במקביל | ‏50 VU קבוע | ‏`begin_checkout`, ‏idempotency |
| L3 | הצפת webhooks | ‏100 req/s לדקה | ‏dedup, אפס חיוב כפול |
| L4 | תור מימוש | ‏50 סריקות/דקה, ספק אחד | נעילת שורה, אפס מימוש כפול |
| L5 | ‏connection pool | ‏500 VU, 60 שניות | הנקודה שבה החיבורים נגמרים |
| L6 | סורק חיפוש | ‏60 req/min, ‏slug אקראי | ‏Meilisearch מול Postgres |

### 5.3 הספים

| מדד | יעד | כשל |
|---|---|---|
| דף מוצר p95 | ‏< 800ms | ‏> 1500ms |
| דף הבית p95 | ‏< 1000ms | ‏> 2000ms |
| `begin_checkout` p95 | ‏< 1500ms | ‏> 3000ms |
| מימוש p95 | ‏< 500ms | ‏> 1000ms |
| שיעור שגיאה | ‏< 0.5% | ‏> 1% |
| שגיאות חיבור DB | **0** | כל ערך > 0 |
| חיוב כפול | **0** | כל ערך > 0 |
| מימוש כפול | **0** | כל ערך > 0 |

שלושת האחרונים אינם יעדי ביצועים אלא יעדי נכונות. ריצת עומס שמסתיימת
בחיוב כפול אחד היא כישלון, גם אם כל ה-p95 ירוקים.

### 5.4 מתי מריצים

לא ב-CI: יקר, איטי, ורועש על runner משותף. במקום זה:

| מתי | תרחישים | סביבה |
|---|---|---|
| לפני שיגור, פעם | ‏L1-L6 | ‏staging עם דאטת פרודקשן מטושטשת |
| לפני מבצע גדול | ‏L1, ‏L2 | ‏staging |
| אחרי שינוי במסלול הכסף | ‏L2, ‏L3, ‏L4 | ‏staging |
| רבעוני | ‏L1, ‏L5 | ‏staging |

**לעולם לא מול פרודקשן ולא מול Cardcom האמיתי.** ‏L3 מזריק webhooks
חתומים בסוד ה-staging, לא תעבורה אמיתית.

---

## 6. RTL ובדיקות ויזואליות

### 6.1 למה זה שכבה נפרדת

האתר עברי. שבירת RTL היא הרגרסיה הכי נפוצה ואף אחת מהשכבות האחרות לא
תופסת אותה: הבדיקות עוברות, הטיפוסים נקיים, והדף נראה כמו תרגום גרוע.

`docs/rtl-violations.md` כבר מתעד את הדפוסים. הבדיקות הופכות אותו
לשער.

### 6.2 בדיקות RTL לוגיות

זולות, רצות ב-Vitest, ותופסות את רוב הכשלים:

```ts
// src/styles/rtl.test.ts
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'

// מאפיינים פיזיים בקוד RTL: "left" בעברית הוא הצד הלא נכון בכל מקום
// שבו הכיוון משנה. הרשימה סגורה בכוונה: mt/mb ואנכיים אינם בעיה.
const PHYSICAL = [
  /\bml-\d/, /\bmr-\d/, /\bpl-\d/, /\bpr-\d/,
  /\bleft-\d/, /\bright-\d/,
  /\btext-left\b/, /\btext-right\b/,
  /\bborder-l\b/, /\bborder-r\b/,
  /\brounded-l/, /\brounded-r/,
]
const LOGICAL_HINT = {
  'ml-': 'ms-', 'mr-': 'me-', 'pl-': 'ps-', 'pr-': 'pe-',
  'left-': 'start-', 'right-': 'end-',
  'text-left': 'text-start', 'text-right': 'text-end',
}

it('uses logical properties, not physical ones', () => {
  const offenders: string[] = []
  for (const file of globSync('src/{components,app}/**/*.tsx')) {
    const src = readFileSync(file, 'utf8')
    src.split('\n').forEach((line, i) => {
      if (line.includes('rtl-ok')) return          // מילוט מתועד, שורה אחת
      for (const re of PHYSICAL) {
        if (re.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      }
    })
  }
  expect(offenders, `use logical utilities:\n${offenders.join('\n')}`).toHaveLength(0)
})
```

`rtl-ok` הוא מילוט מכוון. יש מקרים אמיתיים שבהם הכיוון פיזי (אייקון
שתמיד מצביע ימינה, לוגו). מילוט מפורש בשורה עדיף על כלל שמכבים.

בדיקות נוספות באותה שכבה:

| בדיקה | טענה |
|---|---|
| `<html dir="rtl" lang="he">` | קיים ב-root layout |
| אין `dir` על div פנימי | ‏dir מקונן שובר bidi |
| מחיר עטוף ב-`<bdi>` | מספר בתוך משפט עברי |
| תאריכים בפורמט he-IL | ‏`Intl.DateTimeFormat('he-IL')` |
| מטבע `₪` בצד הנכון | ‏`Intl.NumberFormat('he-IL', {currency:'ILS'})` |
| אין מחרוזת עברית קשיחה בקוד | הכל דרך `next-intl` |

### 6.3 רגרסיה ויזואלית

```ts
// e2e/visual.spec.ts
const PAGES = [
  { name: 'home',     path: '/' },
  { name: 'products', path: '/products' },
  { name: 'category', path: '/category/restaurants' },
  { name: 'product',  path: '/product/test-coupon-product' },
  { name: 'cart',     path: '/cart' },
  { name: 'checkout', path: '/checkout' },
]
const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const p of PAGES) {
  for (const v of VIEWPORTS) {
    test(`${p.name} @ ${v.name}`, async ({ page }) => {
      await page.setViewportSize(v)
      await page.goto(p.path)
      await page.waitForLoadState('networkidle')

      // הגריד לא חורג. גלילה אופקית באתר RTL היא כמעט תמיד
      // מאפיין פיזי שדחף אלמנט מעבר לקצה.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow, 'horizontal overflow').toBe(false)

      await expect(page).toHaveScreenshot(`${p.name}-${v.name}.png`, {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
        mask: [page.getByTestId('dynamic-timestamp')],
      })
    })
  }
}
```

18 צילומים (‏6 דפים x 3 רוחבים). הכללים שמונעים מזה להפוך למטרד:

- **‏`animations: 'disabled'`.** אחרת כל ריצה שנייה נכשלת.
- **‏`mask` על אזורים דינמיים.** חותמות זמן, ספירת סל.
- **‏`maxDiffPixelRatio: 0.01`.** ‏anti-aliasing של גופנים משתנה בין
  מכונות. אפס סובלנות הוא בדיקה שתמיד אדומה.
- **‏baselines נוצרים ב-Linux בלבד**, אותה סביבה כמו CI. ‏baseline
  מ-macOS לעולם לא יתאים.
- **ה-job לא חוסם merge, אלא מעלה את הדיף כ-artifact.** ‏diff ויזואלי
  דורש עין אנושית, ובדיקה חוסמת שאדם חייב לאשר ידנית תיעקף.

### 6.4 נגישות

`LEG-03` מסווג את היעדר ת"י 5568 / ‏WCAG 2.0 AA כחוסם שיגור. שתי שכבות:

```ts
// שכבה 1: axe על כל רכיב, ב-Vitest. זול, חוסם.
expect(await axe(container)).toHaveNoViolations()
```

```ts
// שכבה 2: axe על דף מלא, ב-Playwright. תופס בעיות הקשר.
import AxeBuilder from '@axe-core/playwright'

test('accessibility on every public page', async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p.path)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations, `${p.path}: ${JSON.stringify(results.violations, null, 2)}`)
      .toEqual([])
  }
})
```

‏axe תופס בערך 30% מבעיות הנגישות. השאר דורש אדם: ניווט מקלדת מלא,
קורא מסך (‏NVDA בעברית), ובדיקת מיקוד גלוי. אלה נכנסים לשער השיגור
כרשימת בדיקה ידנית, לא כאוטומציה שמעמידה פנים.

---

## 7. CI: הצינור

### 7.1 מה שיש

`ci.yml` מריץ lint (על קבצים שהשתנו), typecheck, test עם רצפות כיסוי,
build, ו-e2e שמדלג.

ההחלטה על lint מוגבל-דיף מנומקת נכון בקובץ: ‏`pnpm lint` על כל הריפו
מדווח 45 שגיאות קיימות, ושער שמאדים כל PR ביום הראשון ייעקף תוך שבוע.
הפרות חדשות חוסמות, החוב יורד בקצב שלו.

### 7.2 מה שצריך להוסיף

| # | ‏job | חוסם? | למה |
|---|---|---|---|
| C1 | ‏**E2E באמת רץ** (‏`CI_SUPABASE_URL`) | **כן** | היום ירוק בלי לבדוק |
| C2 | ‏SQL/RLS מול stack מקומי | **כן** | ‏RLS הוא גבול האמת |
| C3 | ‏harness מיגרציות apply-twice | **כן** | ‏D6. חוסם כל החלה מרוחקת |
| C4 | ‏`pnpm audit --audit-level=high` | כן | תלויות |
| C5 | סריקת סודות בבאנדל הלקוח | **כן** | ‏7.3 של מסמך האבטחה |
| C6 | ‏Lighthouse CI | כן | תקציבי ביצועים |
| C7 | ‏axe | כן | ‏LEG-03 |
| C8 | ‏RTL logical properties | כן | זול, תופס הרבה |
| C9 | רגרסיה ויזואלית | לא | ‏artifact לעין אנושית |
| C10 | ‏k6 | לא | ידני |

### 7.3 harness המיגרציות

D6 מחייב, ואין. הוא בודק שני דברים שאף בדיקה אחרת לא בודקת: שהרצף
בונה DB מאפס, ושכל קובץ אידמפוטנטי.

```yaml
migrations:
  name: Migrations apply twice on a clean stack
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: supabase/setup-cli@v1
    - run: supabase start
    - name: First apply, from zero
      run: supabase db reset --local
    - name: Second apply, same files
      # כל קובץ חייב להיות idempotent (R22). קובץ שנופל כאן
      # ייפול גם בהחלה חוזרת על הפרויקט המרוחק, שם זה כבר תקלה.
      run: |
        for f in supabase/migrations/*.sql; do
          psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || {
            echo "::error::$f is not idempotent"; exit 1; }
        done
    - name: SQL and RLS assertions
      run: |
        psql "$LOCAL_DB_URL" -f tests/sql/90_test_support.sql
        for f in tests/sql/*.sql; do
          psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
        done
```

זה גם ה-job שמריץ את הטענה מסעיף 1.6 של מסמך האבטחה על
`relforcerowsecurity`, כלומר טבלה חדשה בלי FORCE מאדימה מיד.

### 7.4 סריקת הסודות

```yaml
- name: No server secret in the client bundle
  run: |
    pnpm build
    for s in SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY CARDCOM_API_PASSWORD \
             CARDCOM_WEBHOOK_SECRET VOUCHER_QR_SECRET R2_SECRET_ACCESS_KEY \
             MEILISEARCH_API_KEY CRON_SECRET SUPABASE_DB_URL; do
      if grep -rq "$s" .next/static/; then
        echo "::error::$s leaked into the client bundle"; exit 1
      fi
    done
```

מפתח Meilisearch ברשימה מסיבה קונקרטית: `STATE.md` מתעד את ההחלטה לא
לבנות dropdown של הצעות חיפוש בדיוק כי המפתח הוא סוד שרת. הבדיקה הזאת
היא מה שיאכוף את ההחלטה כשמישהו ינסה שוב.

### 7.5 סדר ומשך

```
lint (30s) ─┐
typecheck ──┼─> build (2m) ─> e2e (4m) ─┐
test (1m) ──┘                            ├─> ✅
migrations (3m) ──────────────────────────┤
rtl + secrets (20s) ───────────────────────┘
```

יעד: **מתחת ל-8 דקות** מ-push עד ירוק. ‏CI איטי נעקף.

---

## 8. פערים פתוחים

| # | פער | חומרה | סעיף |
|---|---|---|---|
| T-1 | ‏E2E ב-CI מדלג: שער ירוק שלא בודק כלום | **קריטי** | 4.1 |
| T-2 | אין harness מיגרציות (‏D6 מחייב) | **קריטי** | 7.3 |
| T-3 | אפס בדיקות רכיב: `src/components/` לא נבדק | **גבוה** | 3.4 |
| T-4 | אין תרחיש E2E ל-checkout מלא עם iframe | **גבוה** | 4.2 |
| T-5 | אין תרחיש E2E למימוש שובר | **גבוה** | 4.3 |
| T-6 | אין בדיקות מרוץ (‏D9 מחייב) | **גבוה** | 2.4 |
| T-7 | אין סריקת סודות בבאנדל | גבוה | 7.4 |
| T-8 | אין axe: ‏LEG-03 חוסם שיגור | גבוה | 6.4 |
| T-9 | אין property tests על הכסף | גבוה | 2.3 |
| T-10 | אין Lighthouse CI | בינוני | 7.2 |
| T-11 | אין רגרסיה ויזואלית | בינוני | 6.3 |
| T-12 | אין k6 | בינוני | 5 |
| T-13 | ‏45 שגיאות lint בחוב | נמוך | 7.1 |
| T-14 | ‏chromium בלבד: ‏Safari iOS לא נבדק | בינוני | 4.1 |

**‏T-1 ו-T-2 קודמים לכל השאר.** שער שמעמיד פנים גרוע מהיעדר שער, כי
הוא מייצר ביטחון שאין לו כיסוי.

---

מסמכים קשורים:
`docs/ARCHITECTURE-TESTING-CICD.md` (‏D1-D22, מדיניות merge),
`docs/ARCHITECTURE-SECURITY.md` (חוזה בדיקות ה-RLS),
`docs/ARCHITECTURE-SEO-SITEMAP.md` (תקציבי CWV),
`docs/ARCHITECTURE-OPS.md` (סביבות ופריסה),
`docs/ARCHITECTURE-ROADMAP.md` (מתי כל שער חייב להיות ירוק).
