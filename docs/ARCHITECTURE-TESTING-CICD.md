# ארכיטקטורת בדיקות ו-CI/CD - KenyonExpress (מסמך מחייב)

סטטוס: FINAL DESIGN. תאריך: 2026-07-17. ענף: `phase5/homepage`.

מסמך זה הוא מקור האמת היחיד לאסטרטגיית הבדיקות ול-CI/CD, מיושר למודל העסקי המעודכן
ב-`BUSINESS-MODEL.md` וב-`ARCHITECTURE-COMMERCE.md` (2026-07-17, מקור אמת יחיד).
כל ההכרעות המחייבות (D1-D22) מרוכזות בסעיף 1. כל מה שכתוב כאן הוא הכרעה, לא הצעה.

מסמכים קשורים: `MASTER-ARCHITECTURE.md` (v2), `ARCHITECTURE-PRODUCTION-OPS.md`, `ARCHITECTURE-SUPPLIER-REDEMPTION.md`, `ARCHITECTURE-ACCOUNT-IDENTITY.md`.

> **הרחבות מחייבות (2026-07-17):** `ARCHITECTURE-LEGAL-COMPLIANCE.md`
> מוסיף ‏axe חוסם, בדיקות ביטול/חשבוניות/מסמך גילוי ו-LEG-01..03 לשער
> השיגור. `ARCHITECTURE-PERFORMANCE.md` מוסיף תקציבי Lighthouse חוסמים
> ותרחישי k6. הרחבות אלה מצטרפות ל-D1-D22 ואינן מחליפות אותן.

> מטרת המסמך: אסטרטגיית בדיקות ו-CI/CD לאתר שמזיז כסף אמיתי (Cardcom, ארנק cashback,
> פיצול platform_percent, קופונים חד-פעמיים) עם בעלים יחיד. באג בקוד הכסף שווה כסף אבוד,
> ולכן ההיררכיה כאן הפוכה מהמקובל: קודם כסף ו-RLS, אחר כך UI.

---

## 0. עובדות מוצא (נכון להיום, נבדק בריפו)

| רכיב | מצב בפועל |
|---|---|
| CI | אין `.github/` בכלל. רק husky + lint-staged |
| בדיקות | 2 unit (`src/__tests__/`), 2 E2E (`e2e/`), אפס כיסוי כסף |
| vitest | 3.x, jsdom בלבד, include `src/**/*.test.ts(x)` |
| Playwright | 1.50, chromium בלבד, `locale he-IL`, webServer `pnpm dev` |
| קוד תשלומים | לא קיים. אין `src/server/actions/payments/`, אין webhook route, אין Cardcom client |
| מיגרציות | 001-025 מוחלות, 026-033 טיוטות. drift ידוע מול dev |
| Supabase מקומי | `config.toml` מלא (api 54321, db 54322, shadow 54320, Postgres 17, `db.seed` מופעל) אבל `supabase/seed.sql` **לא קיים** |
| ויזואלי | `scripts/compare.mjs` (שני צילומי PNG ב-1440px) + `scripts/diff-bands.mjs` (diff בפועל, TOL=24 לערוץ, פסים של 100px). תשתית טובה כבסיס, אבל ידנית ולא רצה ב-CI |
| כלים | pnpm (lockfile), biome 1.9, tsc strict + `noUncheckedIndexedAccess`, Next 16.2.4, React 19.2 |
| ענף יעד ל-PR | `cursor/add-supabase-3c830` (יוחלף ב-main בקאטאובר) |

---

## 1. הכרעות מחייבות (D1-D22)

### 1.1 הכרעות יסוד (D1-D12)

| # | הכרעה | נימוק |
|---|---|---|
| D1 | **סביבת האינטגרציה היא Supabase מקומי (Docker) שנבנה מאפס בכל ריצת CI**, לא Supabase branch מנוהל ולא פרויקט dev המשותף | branching דורש Pro (הוחלט ב-PRODUCTION-OPS 1.1 לא לקנות עכשיו); ה-drift ב-dev הופך אותו לבלתי-אמין כבסיס; stack נקי מ-001 עד אחרון הוא בדיוק החזרה על bootstrap הפרודקשן העתידי, אז ה-CI מוודא אותו בחינם בכל PR. כשעוברים ל-Pro אפשר להוסיף preview branches כשכבה שנייה, לא כתחליף |
| D2 | **כל אריתמטיקת כסף באפליקציה חיה במודול טהור אחד**: `src/lib/money/` (פונקציות טהורות, אגורות כ-integer, בלי I/O). server actions רק קוראים לו | אי אפשר לבדוק ביסודיות חישוב שמפוזר בתוך actions. המודול נכתב לפני ה-action הראשון של checkout, יחד עם קובץ הבדיקות שלו (סעיף 2.1) |
| D3 | **Cardcom אמיתי לא משתתף ב-CI של PR.** גבול ה-HTTP של Cardcom נעטף ב-adapter יחיד, וב-CI רץ fake בצד ה-HTTP (מדמה Low Profile, עסקה, refund, webhook). sandbox אמיתי רץ רק ב-suite ליליים/ידניים | יציבות ומהירות של PR CI לא יכולות להיות תלויות בצד שלישי. ה-fake מוודא את הלוגיקה שלנו; ה-sandbox מוודא את ההנחות על Cardcom |
| D4 | **E2E לא מבצע Google OAuth אמיתי.** משתמשי בדיקה נוצרים ב-auth המקומי (email+password או session מוזרק דרך admin API), וזרימת ה-OAuth האמיתית נבדקת ידנית פעם לפני כל release | OAuth של Google ב-headless CI שביר ונחסם. מה שחשוב לבדוק אצלנו הוא merge של עגלת אורח והפניות next, לא את גוגל |
| D5 | **בדיקות RLS הן data-driven**: מטריצת role על table על operation יושבת כקובץ נתונים אחד, ו-runner גנרי (vitest, node env) מריץ אותה מול ה-stack המקומי עם JWT לכל persona | policy חדשה בלי שורה במטריצה = נכשל. שינוי policy שמרחיב הרשאה בטעות = נתפס. זה הביטוח היחיד האמיתי מול טעויות RLS |
| D6 | **בדיקת idempotency של מיגרציות היא apply פעמיים מלא**: stack נקי, כל הקבצים לפי הסדר, ואז כל הקבצים שוב. שתי הריצות חייבות להצליח | זה החוק שכבר קיים ב-skill של המיגרציות; ה-harness הופך אותו מאמונה לעובדה נאכפת בכל PR שנוגע ב-`supabase/migrations/` |
| D7 | **ויזואלי-RTL עובר ל-Playwright snapshots** (`toHaveScreenshot`) עם מטריצת breakpoints, וגישת compare.mjs (מול `ke_live_singlefile.html`) נשארת ככלי 1:1 ידני לעבודת פיקסלים בלבד | שני צרכים שונים: רגרסיה אוטומטית מול baseline של עצמנו (CI) לעומת התאמה חד-פעמית למקור חי (ידני) |
| D8 | **מה שחוסם merge**: biome, tsc, unit, build, integration (כולל RLS + idempotency), E2E smoke. **מה שמזהיר בלבד**: E2E מלא, visual diff, Lighthouse | חסימה על בדיקות יציבות בלבד. ויזואלי מתחיל כאזהרה עד שה-baseline מתייצב, ואז מקודם לחוסם |
| D9 | **בדיקות ריצה כפולה (race) הן חובה לכל פונקציית כסף**: `fn_wallet_transfer`, `redeem_coupon`, `fn_merge_guest_cart`, webhook handler. תבנית קבועה: שני קוראים במקביל, בדיוק אחד מצליח | כל ההגנות בתכנון (CAS אטומי, advisory lock, idempotency key, UNIQUE) הן בדיוק הדברים שנשברים בשקט ב-refactor |
| D10 | **fail-closed לכסף נבדק כחוזה**: בדיקה שמוכיחה ש-checkout וסריקת קופון נעצרים כש-rate-limit RPC נכשל. הבאג הידוע (`rate-limit.ts` fails open, `checkUserRateLimit` בלי קוראים) נסגר ב-Phase 3 והבדיקה מקבעת את התיקון | תועד ב-PRODUCTION-OPS 4.2 כבאג. בלי בדיקה הוא יחזור |
| D11 | **פירמידה לפי סיכון, לא לפי צורה**: יעד כיסוי גורף אין. במקום זה, רשימת אינברינטים סגורה (סעיף 2.0) שכל אחד מהם חייב בדיקה אחת לפחות, ו-CI נכשל אם קובץ בדיקות של מודול כסף לא קיים | כיסוי 80% על קוד UI שווה פחות מ-14 בדיקות הפיצול. בעלים יחיד = תקציב תשומת לב מוגבל, מוציאים אותו על מה שעולה כסף |
| D12 | **branch protection על ענף היעד של PRs** (כיום `cursor/add-supabase-3c830`, בעתיד main): אסור merge בלי CI ירוק. push ישיר לענף עבודה מותר (עבודה יומיומית), אבל שום דבר לא מתמזג לענף היעד בלי הצינור | כלל "commit ואז push מיידי" מ-CLAUDE.md נשאר, הוא גיבוי. ההגנה היא על נקודת המיזוג |

### 1.2 הכרעות עדכניות (D13-D22)

| # | הכרעה |
|---|---|
| D13 | **מודל הקופון החדש גובר**: `coupon_price` הוא שדה חופשי פר מוצר (לא נגזרת של `platform_percent`). כל בדיקות שורת הקופון מחשבות: `charged_on_site = coupon_price`, `balance_due_at_business = total_deal_price - coupon_price`, `supplier_due = 0`, `platform_fee = charged_on_site`. שדה `platform_percent` בשורת קופון הוא אינפורמטיבי בלבד ולעולם לא משתתף בחישוב |
| D14 | **ה-enum הקנוני לקופון נשאר `coupon_status` מ-008**: `issued, used, expired, refunded`. הסטטוסים `active/redeemed` מ-`ARCHITECTURE-COMMERCE.md` הם תוויות UI שממופות אליו. טבלת `coupons_issued` מהמסמך ההוא ממומשת על גבי `coupon_codes` הקיימת, לא כטבלה חדשה |
| D15 | **שכבת component נוספת לפירמידה**: Testing Library + jsdom, פרויקט vitest נפרד. בודקת רינדור עברית/RTL של קומפוננטות כסף בלבד (כרטיס מוצר לפי סוג, שורת עגלה, סיכום checkout, תצוגת קופון+QR) |
| D16 | **E2E על Vercel Preview הוא workflow נפרד** (`preview-e2e.yml`) שנורה על `deployment_status`. מריץ רק תרחישים read-only מתויגים `@preview` (הסביבה חולקת DB חי של dev ולכן אסור לה להריץ זרימות כסף). זרימות הכסף המלאות רצות ב-CI על stack מקומי + Cardcom fake, ובלילה מול Cardcom sandbox אמיתי |
| D17 | **מנוי (subscription)**: מפתח ה-idempotency של חיוב מחזורי הוא `(subscription_id, cycle_number)`. חיוב שנכשל: 3 ניסיונות בגיבוי אקספוננציאלי על פני 7 ימים, אחר כך `paused` + התראה. ביטול באמצע מחזור: המחזור הנוכחי נשאר בתוקף, אין חיוב הבא, אין החזר יחסי |
| D18 | **אין טבלאות בדיקה במיגרציות פרודקשן.** כל תמיכת בדיקות חיה ב-`supabase/seed.sql` (נטען רק מקומית/CI) וב-`tests/sql/90_test_support.sql` (סכמת `test_support`, מוחלת רק ב-CI אחרי המיגרציות, לעולם לא דרך MCP למרוחק). לכן **לא נוצר קובץ מיגרציה חדש** |
| D19 | **Node 22 LTS** ננעל ב-`.nvmrc` + `engines` + כל workflow. pnpm דרך `packageManager` הקיים |
| D20 | **קידום לפרודקשן הוא git-based בלבד**: merge לענף היעד אחרי CI ירוק הוא הטריגר היחיד ל-deploy פרודקשן. אין `vercel --prod` ידני. rollback אפליקציה: Vercel Instant Rollback. rollback DB: forward-only, מיגרציה מפצה, לעולם לא down |
| D21 | **סדר deploy מחייב**: מיגרציה תמיד לפני קוד, והסכמה חייבת להיות תואמת-אחורה לקוד הרץ (expand/contract). ה-CI אוכף זאת בכך שה-E2E רץ על הקוד הישן מול הסכמה החדשה בכל PR שנוגע במיגרציות |
| D22 | **kill switch לתשלומים**: `CHECKOUT_ENABLED` (server-only, ברירת מחדל true). `beginCheckout` ו-webhook ההנפקה בודקים אותו. בדיקת unit מקבעת שהכיבוי עוצר checkout אבל לא עוצר עיבוד webhooks של עסקאות שכבר שולמו |

---

## 2. פירמידת הבדיקות

```
        E2E (Playwright)            הזרימות שמזיזות כסף, מול build אמיתי
      ───────────────────────
      Integration (Postgres)        RLS matrix, פונקציות DB, idempotency מיגרציות
    ───────────────────────────
    Component (RTL + jsdom)         רינדור עברית/RTL של קומפוננטות כסף
  ───────────────────────────────
  Unit (vitest, node, טהור)         אריתמטיקת כסף, מכונות מצבים, ולידציות
```

חלוקת פרויקטים ב-`vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] } },
      {
        test: {
          name: 'component', environment: 'jsdom',
          setupFiles: './vitest.setup.ts', include: ['src/**/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'integration', environment: 'node',
          include: ['tests/integration/**/*.test.ts'], testTimeout: 30_000,
          globalSetup: './tests/integration/global-setup.ts', // מוודא stack מקומי חי
        },
      },
    ],
  },
})
```

`pnpm test` מריץ unit+component בלבד (מהיר, בלי DB). `pnpm test:integration` מריץ את השלישי.

### 2.0 רשימת האינברינטים (החוזה שהבדיקות אוכפות)

כל שורה כאן חייבת בדיקה אחת לפחות. זו רשימה סגורה שמתעדכנת רק דרך מסמך זה:

1. `platform_fee + supplier_due = total` בכל פריט פיזי, תמיד, בלי drift של אגורה.
2. `charged_on_site + balance_due_at_business = total` בכל פריט, פיזי וקופון.
3. בקופון: `supplier_due = 0` וגם `charged_on_site = platform_fee` (הערכים נגזרים מ-`coupon_price`, D13).
4. עיגול קורה פעם אחת בדיוק, על העמלה בלבד, ברמת השורה (לא ליחידה, לא להזמנה), חצי כלפי מעלה.
5. סכומי ההזמנה הם סכימת שורות, לעולם לא חישוב מחדש מאחוזים.
6. ארנק משתמש לעולם לא שלילי; כל תנועה היא זוג debit/credit מאוזן; ledger הוא append-only.
7. אותו idempotency key לעולם לא מייצר תנועת ארנק שנייה, תשלום שני או זיכוי כפול.
8. קופון נפדה פעם אחת בדיוק, גם תחת שתי סריקות מקבילות.
9. webhook בלי חתימה תקפה, או עם סכום שלא תואם אימות API, לא משנה שום state.
10. אף שדה כסף לא מגיע מהלקוח; ה-client שולח מזהים וכמויות בלבד.
11. `cardcom_token` לא קריא לאף role דפדפני, כולל admin.
12. הרשאות supplier נקבעות רק דרך `supplier_members`, לא דרך `profiles.role`.
13. מיגרציה שהוחלה פעמיים מצליחה פעמיים.
14. כשל rate-limit או כשל תשתית בזרימת כסף עוצר את הפעולה (fail-closed).

### 2.1 Unit - אריתמטיקת כסף (`src/lib/money/`)

המודול נכתב **לפני** השורה הראשונה של `beginCheckout` (D2). פונקציות טהורות, כל החישוב באגורות
כ-integer, עמודות ה-DB מקבלות תוצאה מעוגלת בלבד. קבצים ובדיקות:

| קובץ | אחריות | קובץ בדיקות |
|---|---|---|
| `agorot.ts` | `A(ils) = Math.round(ils*100)` והמרה חזרה | `agorot.test.ts` |
| `split.ts` | פיצול פיזי/מנוי לפי `platform_percent` | `split.test.ts` |
| `coupon-line.ts` | שורת קופון לפי `coupon_price` / `total_deal_price` (D13) | `coupon-line.test.ts` |
| `order-totals.ts` | סכימת שורות + הקצאת ארנק מול חיוב כרטיס | `order-totals.test.ts` |
| `subscription.ts` | סכום חיוב מחזורי, פיצול פר חיוב, מפתח idempotency למחזור | `subscription.test.ts` |
| `format.ts` | תצוגת ₪ he-IL | `format.test.ts` |

**נוסחת הפיצול (פיזי + מנוי), עיגול פעם אחת בדיוק, על העמלה, ברמת השורה, half-up:**

```
line_total_ag = unit_price_ag * quantity
fee_ag        = round_half_up(line_total_ag * pp / 100)
supplier_ag   = line_total_ag - fee_ag
```

**טבלת מקרי הפיצול (M, חובה אחד לאחד).** כל הערכים באגורות (integer):

| # | מקרה | line_total_ag | pp | fee_ag צפוי | supplier_ag צפוי | מה המקרה תופס |
|---|---|---|---|---|---|---|
| M1 | המקרה הקנוני מהמסמכים (400 ₪, 10%) | 40000 | 10 | 4000 | 36000 | בסיס |
| M2 | מחיר לא עגול | 9990 | 10 | 999 | 8991 | בסיס |
| M3 | סכום מזערי, עמלה מתעגלת ל-0 | 1 | 10 | 0 | 1 | עמלה 0 חוקית, הספק מקבל הכול |
| M4 | חצי אגורה בדיוק, כלפי מעלה | 5 | 10 | 1 | 4 | round half up ולא truncate |
| M5 | חצי בדיוק על ערך אי-זוגי | 15 | 50 | 8 | 7 | half up ולא banker's rounding |
| M6 | חצי בדיוק על ערך זוגי | 25 | 50 | 13 | 12 | banker's rounding היה נותן 12; אצלנו 13 |
| M7 | אחוז עשרוני (numeric(5,2)) | 9990 | 12.5 | 1249 | 8741 | 1248.75 מתעגל ל-1249 |
| M8 | אחוז עשרוני "עגול לכאורה" | 10000 | 33.33 | 3333 | 6667 | דיוק כפל עשרוני |
| M9 | שארית 0.9 | 9999 | 10 | 1000 | 8999 | 999.9 כלפי מעלה |
| M10 | אחוז 0 | 40000 | 0 | 0 | 40000 | קצה תחתון של ה-CHECK |
| M11 | אחוז 100 | 40000 | 100 | 40000 | 0 | קצה עליון, ספק מקבל 0 |
| M12 | אחוז מינימלי | 40000 | 0.01 | 4 | 39996 | רזולוציית numeric(5,2) |
| M13 | אחוז מקסימלי לא שלם | 40000 | 99.99 | 39996 | 4 | סימטריה ל-M12 |
| M14 | כמות: עיגול לשורה ולא ליחידה. יחידה 3333 אג' × 3 | 9999 | 10 | 1000 | 8999 | עיגול ליחידה היה נותן 333×3=999. חייב 1000 |

בדיקות נלוות באותו קובץ (M18 הישן, שגזר את שורת הקופון מ-pp, בוטל והוחלף במקרי K לפי D13):

| # | מקרה | ציפייה |
|---|---|---|
| M15 | property test (fast-check או לולאה דטרמיניסטית): לכל total באגורות 1..10^7 ולכל pp ברשת 0.01: `fee + supplier = total`, שניהם ≥ 0, `fee ≤ total` | אינברינטים 1, 4 |
| M16 | המרת float: `A(19.99) = 1999` (למרות ש-`19.99*100 = 1998.999...9`), `A(0.29) = 29`, `A(102.99) = 10299` | round ולא trunc בהמרה |
| M17 | קלט לא חוקי: total שלילי, pp מחוץ ל-0..100, total לא שלם | זריקת שגיאה, לא תוצאה שקטה |
| M19 | הקצאת ארנק: total 10000, ארנק 3000 | חיוב כרטיס 7000; הפיצול מחושב על 10000 המלא (הכרעה O5) |
| M20 | ארנק מכסה הכול: total 10000, ארנק 10000 | חיוב כרטיס 0, אין קריאת Cardcom, הזמנה paid |
| M21 | ארנק גדול מהסכום | נחתך ל-total, לעולם לא חיוב שלילי |
| M22 | resolution של האחוז: מוצר עם override, מוצר בלי override עם ספק, מוצר בלי כלום | שרשרת `product.platform_percent -> supplier.commission_percent -> 10` (מקביל TS ל-`product_platform_percent`; ההתאמה בין שניהם נבדקת באינטגרציה) |

זמן ריצה יעד לכל שכבת ה-unit: פחות מ-10 שניות.

**מקרי שורת קופון (K, לפי D13):**

| # | קלט (אגורות) | ציפייה |
|---|---|---|
| K1 | total_deal 10000, coupon_price 1000 | charged_on_site 1000, balance 9000, supplier_due 0, platform_fee 1000 |
| K2 | coupon_price = total_deal (10000/10000) | balance 0, עדיין תקין |
| K3 | coupon_price > total_deal | שגיאת ולידציה, לא תוצאה שקטה |
| K4 | coupon_price <= 0 | שגיאה |
| K5 | quantity 3 | כל הערכים מוכפלים ברמת השורה; 3 קודים מונפקים (נבדק באינטגרציה) |
| K6 | coupon_price 1055 (10.55 ₪) | אין drift של אגורה בהמרות הלוך ושוב |
| K7 | אינברינט: `charged_on_site + balance_due_at_business = total_price` לכל K | תואם ל-CHECK של 026 |
| K8 | `platform_percent` בשורת קופון | נגזר לתצוגה בלבד (`coupon_price/total_deal*100` מעוגל ל-2 ספרות), החישוב לעולם לא משתמש בו |

**מקרי מנוי (S):**

| # | מקרה | ציפייה |
|---|---|---|
| S1 | חיוב ראשון: recurring 4990, pp 20 | fee 998, supplier 3992, מפתח `(sub_id, 1)` |
| S2 | אותו מחזור פעמיים (cron רץ כפול) | אותו מפתח `(sub_id, n)` בדיוק; חיוב שני לא נוצר |
| S3 | `max_billing_cycles = 3`, מחזור 4 | אין חיוב, סטטוס מסיים; `cycles_completed = 3` |
| S4 | `max_billing_cycles = NULL` | אין תקרה |
| S5 | ביטול באמצע מחזור (D17) | אין חיוב הבא, אין החזר יחסי, סטטוס `cancelled` |
| S6 | חיוב מחזורי נכשל | ניסיון 1-3 בגיבוי, אחרי השלישי `paused` + התראה; אף פעם לא חיוב כפול על אותו מחזור |
| S7 | pp משתנה במוצר אחרי הרשמה | חיובים חדשים לפי snapshot ההרשמה, לא לפי המוצר (אותו עיקרון כמו order_items) |

**אינברינטים של מפתחות ה-idempotency לארנק ברמת unit** (הלוגיקה עצמה ב-`fn_wallet_transfer`, אינטגרציה):

| מקרה | ציפייה |
|---|---|
| נגזרת המפתח: `(order_id, reason)` | דטרמיניסטי, ייחודי לצמד, יציב בין ריצות |
| שני webhooks על אותה הזמנה | אותו מפתח בדיוק (זה מה שמנטרל כפילות) |
| אותה הזמנה, reason שונה (spend מול refund_credit) | מפתחות שונים |

בנוסף בשכבת unit: סכמות zod (`src/lib/validations/*`, כולל דחיית שדות מחיר מהלקוח),
`src/lib/admin/rbac.ts` (`isAdminRole`, `isStaffRole` על כל חמשת ה-roles).

### 2.2 Unit - מכונת המצבים של פדיון קופון

reducer טהור ב-`src/lib/coupons/state-machine.ts` שמשקף אחד-לאחד את הלוגיקה של
`redeem_coupon` (027) ושל ה-cron. ה-DB הוא האוכף האמיתי (האטומיות נבדקת באינטגרציה);
ה-unit מקבע את טבלת המעברים כחוזה קריא:

| מצב נוכחי | אירוע | תוצאה |
|---|---|---|
| issued, לא פג | scan של הספק הנכון | used + `used_at` + `redeemed_by` |
| issued, פג תוקף | scan | דחייה `expired`, המצב לא משתנה |
| issued | `expires_at` עבר (cron) | expired |
| issued | refund אדמין | refunded |
| used | scan נוסף | דחייה `already_used` + מועד הפדיון הראשון |
| used | refund | דחייה. אין refund אחרי מימוש |
| expired / refunded | scan | דחייה בסטטוס האמיתי |
| כל מצב | scan של ספק אחר | `not_found` גנרי החוצה, `wrong_supplier` בלוג (אנטי-enumeration) |
| כל מצב | מעבר הפוך כלשהו (used->issued וכו') | בלתי אפשרי, ה-reducer זורק |

בדיקות נלוות: כל המעברים חד-כיווניים וטרמינליים; קלט סטטוס לא מוכר זורק;
פונקציית התיוג ל-UI ממפה `issued->active`, `used->redeemed` (D14).

### 2.3 Component (Testing Library + jsdom, פרויקט `component`)

עטיפת render עם `NextIntlClientProvider` (he) ועם `<div dir="rtl">`. נבדקות רק קומפוננטות
שמציגות כסף או מצב קופון:

| קומפוננטה | בדיקות |
|---|---|
| כרטיס מוצר - קופון | מציג `coupon_price` כ"משלמים באתר", `total_deal_price` כשווי הדיל, והיתרה לתשלום בעסק; פורמט ₪ he-IL; עיר הספק מוצגת |
| כרטיס מוצר - פיזי | מחיר מלא בלבד, בלי שדות קופון |
| כרטיס מוצר - מנוי | `recurring_amount` + "לחודש"; כפתור "הרשם" |
| בלוק פרטי ספק | שם עסק, לינק Waze עם lat/lng, לינק WhatsApp מהטלפון, שעות פתיחה. חובה בכל שלושת הסוגים (BUSINESS-MODEL סעיף 2) |
| שורת עגלה + סיכום | כמות×מחיר, סכום ביניים, בלי שום קלט מחיר מהמשתמש ב-DOM |
| סיכום checkout | פירוק: חיוב באתר עכשיו מול "לתשלום בעסק"; הקצאת ארנק מוצגת כהפחתה |
| תצוגת קופון באזור אישי | קוד 8 ספרות, QR, תאריך תפוגה, סטטוס בעברית |
| מסך סריקה לספק | מצב ירוק עם `collect_amount`, מצב אדום עם סיבה |

בדיקות RTL רוחביות (על כל אחת מהקומפוננטות למעלה): אין LTR קשיח בתוך משפט עברי
(bidi על שורת "סה"כ: ₪99.90"), מספרים מוצגים עם `formatPrice` ולא בשרשור ידני.

### 2.4 Integration (vitest node מול Supabase מקומי)

תשתית: `supabase start` (Docker), החלת כל המיגרציות מאפס, seed personas (סעיף 6.1). שלוש משפחות:

#### 2.4.1 מטריצת RLS data-driven (D5)

Personas: `anon`, `customer_a` (בעל הרשומות), `customer_b` (משתמש אחר), `uploader`
(content_uploader), `sup_owner` / `sup_manager` / `sup_scanner` (חברי supplier X),
`sup_other` (חבר supplier Y), `admin`, `service` (service_role, עוקף RLS, נבדק רק כ-sanity).

סימון: S/I/U/D מותר, `-` נדחה, `fn` רק דרך פונקציית SECURITY DEFINER, `S*` קריאה חלקית (מסונן או עמודות בלבד).

| טבלה | anon | customer_a | customer_b | supplier member (X) | sup_other (Y) | uploader | admin |
|---|---|---|---|---|---|---|---|
| products (active) | S | S | S | S (שלו) | S (שלו) | S,I,U (created_by שלו) | S,I,U,D |
| products (draft של אחר) | - | - | - | - | - | - | S,I,U,D |
| carts / cart_items | לפי session cookie | S,I,U,D (שלו) | - | - | - | - | הכול |
| orders | - | S (שלו) | - | S* (paid עם פריט שלו בלבד) | - | - | הכול |
| order_items | - | S (דרך הזמנה שלו) | - | S (של הספק), U רק דרך `update_shipping_status` | - | - | הכול |
| payments | - | S (שלו) | - | - | - | - | S בלבד |
| payment_webhook_events | - | - | - | - | - | - | S בלבד |
| payment_tokens | - | S* (עמודות בטוחות; `select('*')` נכשל 42501), D | - | - | - | - | S* (אותה מגבלת עמודות) |
| wallet_accounts | - | S (שלו) | - | - | - | - | S |
| wallet_transactions | - | S (חשבון שלו בצד כלשהו) | - | - | - | - | S. **אפס policy כתיבה לכולם, כולל admin** |
| coupon_codes | - | S (שלו) | - | S (של הספק). U ישיר נחסם (ה-policy מ-008 הוסרה ב-027) | - | - | הכול |
| coupon_redemptions | - | S (הקופון שלו) | - | S | - | - | S |
| coupon_scan_events | - | - | - | S (של הספק). I/U/D policy false לכולם | - | - | S |
| suppliers | - | - | - | S (שלו) | S (שלו) | - | הכול |
| supplier_applications | - | S,I (שלו, pending) | - | - | - | - | S,U,D |
| supplier_members | - | - | - | S; I/U/D רק owner | - | - | הכול |
| supplier_bank_accounts | - | - | - | **owner בלבד** (manager/scanner נדחים) | - | - | הכול |
| payout_statements + lines | - | - | - | S (לא draft) | - | - | הכול |
| supplier_disputes | - | - | - | S; פתיחה owner | - | - | S,U,D |
| cardcom_settlements / txns | - | - | - | - | - | - | הכול |
| user_addresses | - | S,I,U,D (שלו) | - | S* (כתובת של הזמנה paid עם פריט שלו) | - | - | הכול |
| profiles | - | S,U (שלו, בלי שינוי role) | - | - | - | - | הכול |
| user_notification_preferences | - | S,I,U (שלו) | - | - | - | - | S |
| notifications_outbox | - | S (שלו), U עמודת `read_at` בלבד | - | - | - | - | S |
| account_deletion_requests | - | S (שלו); I/U דרך fn | - | - | - | - | S |
| user_rate_limits | - | - | - | - | - | - | - (deny-all מוחלט, רק fn) |
| audit_log | - | - | - | - | - | - | S. I/U/D false לכולם |

לכל תא "נדחה" יש שתי בדיקות: הפעולה נכשלת, וגם לא השאירה שום שורה (ל-INSERT) או שינוי (ל-UPDATE). בדיקות דגל מיוחדות:

- `customer_b` מנסה לקרוא הזמנות, ארנק, קופונים וכתובות של `customer_a`: אפס שורות.
- `sup_other` (ספק אחר) מנסה לקרוא הזמנות/קופונים של supplier X: אפס שורות.
- `sup_scanner` מנסה לקרוא `supplier_bank_accounts` ולכתוב `supplier_members`: נדחה.
- `payment_tokens`: קריאת `cardcom_token` מפורשת נכשלת לכל persona דפדפני; `last_4` ו-`card_brand` נקראים לבעלים.
- ה-policy השבורה מ-014 ("products: vendor read own", השוואת supplier_id ל-vendors.id): בדיקה שמתעדת שהיא מחזירה אפס שורות, ושאחרי 027 ה-policy החדשה מבוססת החברות כן מחזירה.
- **מבחן שלילי על ה-runner עצמו**: policy פיקטיבית מרחיבה שמוזרקת בבדיקה אחת חייבת להכשיל את המטריצה (מוודא שה-runner באמת מרגיש הרחבות, לא רק צמצומים).

**Runner**: קובץ vitest אחד גנרי (סביבת node) + קובץ מטריצה הצהרתי (הטבלה למעלה כ-data).
לכל persona נוצר משתמש אמיתי דרך admin API של ה-stack המקומי, מקבל role/חברות דרך service
client, ונשמר לו access token. ה-runner מריץ כל תא במטריצה עם ה-client של ה-persona ומאמת
מותר/נדחה, כולל אפס-שורות ואי-שינוי. תוצאה: הוספת policy בלי עדכון המטריצה מפילה את הבדיקה
לשני הכיוונים (גם הרחבה, גם צמצום).

#### 2.4.2 פונקציות DB (SECURITY DEFINER)

מקרי הכסף המרכזיים (ארנק, פדיון, checkout, webhook, refund, מיזוג עגלה) מפורטים בסעיף 3.
מקרי חובה נוספים לפונקציות:

| פונקציה | מקרים חובה |
|---|---|
| `generate_payout_statement` | לא-admin נדחה; פריט delivered בתקופה נכנס עם הסכומים המוקפאים בלבד (אין חישוב מחדש); פריט שכבר בשורת statement לא-מבוטל לא נכנס שוב (הגנת settlement כפול); ביטול statement מחזיר פריטים למאגר; שורות קופון אינפורמטיביות עם payout 0; `mark_payout_statement_paid` נחסם עם dispute פתוח ונכשל בהיעדר חשבון בנק פעיל; bank_snapshot מוקפא ולא משתנה אחרי החלפת חשבון |
| `approve_supplier_application` | לא-admin נדחה; אישור יוצר supplier + חברות owner; העלאת profiles.role נרשמת ב-audit |
| `update_shipping_status` | רק חבר ספק על פריט שלו; מעברי סטטוס לא חוקיים נדחים |
| `fn_set_default_payment_token` | רק על token בבעלות הקורא; is_default יחיד |
| `fn_request/cancel/execute_account_deletion` | rate limit 3/24h; ביטול בתוך חלון החסד; execute רק service_role; אחרי execute: PII מנוקה, רשומות כספיות נשארות |
| `check_user_rate_limit` | מעל הסף מוחזר false; חלון מתגלגל; `cleanup_user_rate_limits` מוחק ישנים; **החוזה fail-closed** בצד האפליקציה (D10): כשה-RPC נופל, checkout וסריקה נעצרים |
| `fn_claim_notification_batch` (כשתוחל 031) | שני workers במקביל לא מקבלים את אותה שורה (SKIP LOCKED); reclaim אחרי 10 דקות |

#### 2.4.3 חוזה סכמה

`supabase gen types` על ה-stack המקומי מושווה ל-`src/types/database.ts` שב-git.
drift בטיפוסים מכשיל את הבדיקה (מוודא שה-repo לא משקר לגבי הסכמה).

### 2.5 E2E (Playwright)

רץ מול `next build && next start` (לא dev server) + Supabase מקומי + Cardcom fake (PR) או Cardcom sandbox (לילי).

**המסלול המאושר המלא (בדיקה אחת רציפה, `@smoke`):**

1. אורח בדף הבית (`html[dir=rtl][lang=he]`), מוסיף לעגלה מוצר פיזי + דיל קופון. עוגיית `ke_session_id` קיימת, העגלה שורדת רענון.
2. לחיצה על "שלם" מפנה ל-`/login?next=/checkout`.
3. התחברות. ב-PR CI: משתמש בדיקה דרך admin API (D4, בלי Google אמיתי). זרימת Google OAuth האמיתית: ידנית לפני release לפי checklist. `fn_merge_guest_cart` רץ: העגלה מלאה אצל המשתמש, עגלת האורח נעלמה.
4. checkout: כתובת, אפס שדות מחיר מהדפדפן. הזמנה נוצרת `pending` + `expires_at`.
5. הפניה לדף Cardcom (fake/sandbox), תשלום, ירי webhook חתום.
6. חזרה לאתר: הסטטוס נשאר `pending` עד ה-webhook (דף ה-redirect לבדו לא משנה state); אחרי ה-webhook - `paid`.
7. **אימות snapshot ישירות מול ה-DB (service client מתוך הבדיקה):** לכל שורת `order_items`:
   - פיזי: `platform_percent` שנשמר = ערך ה-resolution בזמן הקנייה; `platform_fee_ils + supplier_due_ils = total_price_ils`; `charged_on_site_ils = total_price_ils`; `balance_due_at_business_ils = 0`.
   - קופון: `charged_on_site_ils = coupon_price × qty`; `balance_due_at_business_ils = (total_deal_price - coupon_price) × qty`; `supplier_due_ils = 0`; `platform_fee_ils = charged_on_site_ils`.
   - שינוי `platform_percent` במוצר אחרי התשלום ואימות שה-snapshot לא זז.
8. אזור אישי: ההזמנה מופיעה, קוד 8 ספרות + QR לפריט הקופון.

**מסלולי כשל E2E (כל אחד בדיקה נפרדת):**

| תרחיש | ציפייה |
|---|---|
| כרטיס נדחה (ה-fake מחזיר decline) | payment נשאר failed, הזמנה לא paid, מלאי לא ירד, אין קוד קופון, אין תנועת ארנק |
| נטישה בדף התשלום + חלוף 30 דקות (cron מדומה) | הזמנה cancelled, payment failed |
| לחיצה כפולה על "שלם" (double submit) | הזמנה אחת, payment אחד (idempotency key) |
| webhook כפול על אותה עסקה | state לא משתנה בפעם השנייה, אין זיכוי כפול |
| יתרת ארנק לא מספיקה בין ולידציה לחיוב (מרוץ מדומה) | ההזמנה מסומנת לטיפול, אין יתרה שלילית |
| מלאי אזל בין עגלה ל-checkout | checkout נדחה עם הודעה, לא נוצרת הזמנה |
| אורח מנסה `/checkout` ו-`/account` ישירות | redirect ל-login (קיים היום ב-e2e/auth.spec.ts, נשמר) |
| משתמש מחובר עם עגלה ריקה נכנס ל-checkout | הפניה לעגלה, אין הזמנת אפס |

`@smoke` חוסם: המסלול המאושר + כרטיס נדחה + double submit. השאר `@full` (לילי).

**E2E פורטל ספק:** התחברות scanner, סריקה תקפה (ירוק + `collect_amount`), סריקה שנייה (אדום + מועד ראשון),
קוד של ספק אחר (`not_found` גנרי), קוד פג.

**E2E מנוי (כשהשלב ייבנה):** הרשמה -> token -> חיוב ראשון -> `subscription active`;
cron מדומה מחייב מחזור 2; ביטול מהאזור האישי עוצר את מחזור 3.

**`@preview` (רץ על Vercel Preview בלבד, read-only):** דף בית 200 + RTL, דף קטגוריה, דף מוצר,
הוספה לעגלה כאורח (עגלה היא כתיבה זולה ל-dev, מותרת), אפס שגיאות קונסול קריטיות.
אסור: checkout, webhook, redeem.

---

## 3. מטריצת בדיקות המסלול הקריטי (כסף/קופון/ארנק)

כל שורה = בדיקה אחת לפחות, עם השכבה שבה היא רצה. רשימה סגורה; מתעדכנת רק דרך מסמך זה.

### 3.1 Checkout ותשלום (P)

| # | תרחיש | ציפייה | שכבה |
|---|---|---|---|
| P1 | `beginCheckout` תקין (פיזי+קופון) | הזמנה `pending` + `expires_at=now()+30min`, payments `initiated` עם `idempotency_key`, snapshot מלא לכל שורה | integration |
| P2 | payload עם שדה מחיר מהלקוח | נדחה בוולידציית zod, אין הזמנה | unit + integration |
| P3 | double submit (שתי קריאות באותו cart) | הזמנה אחת, payment אחד (`payments.idempotency_key` UNIQUE) | integration |
| P4 | מלאי אזל בין עגלה ל-checkout | נדחה, אין הזמנה | integration |
| P5 | מוצר draft/paused בעגלה | נדחה | integration |
| P6 | ארנק מכסה חלק | `payments.amount_ils = total - wallet`, הפיצול על המלא (O5) | unit + integration |
| P7 | ארנק מכסה הכול | אפס קריאות Cardcom, הזמנה `paid` בטרנזקציה אחת | integration + E2E |
| P8 | rate limit `begin_checkout` 10/60 | הקריאה ה-11 נדחית | integration |
| P9 | כשל RPC של rate limit | checkout נעצר (fail-closed, D10) | unit |
| P10 | `CHECKOUT_ENABLED=false` (D22) | beginCheckout נדחה; webhook על עסקה קיימת עדיין מעובד | unit + integration |
| P11 | מעבר `paid` כטרנזקציה שלמה | payment succeeded + חיוב ארנק + הנפקת קופונים + מלאי + audit יחד; כשל אמצעי מגלגל הכול אחורה | integration |
| P12 | cron ביטול pending אחרי expiry | הזמנה `cancelled`, payment `failed` | integration |

### 3.2 Idempotency של webhooks (W1-W10, חובה מלאה)

| # | תקיפה/תקלה | ציפייה |
|---|---|---|
| W1 | אותו webhook פעמיים (אותו `external_event_id`) | השני נעצר על `UNIQUE (provider, external_event_id)` לפני כל שינוי state; אין קופון כפול, אין תנועת ארנק שנייה, אין הפחתת מלאי כפולה |
| W2 | חתימה שגויה | `signature_valid=false` נרשם, מוחזר 200, אפס כתיבות, alert |
| W3 | חתימה חסרה | כמו W2 |
| W4 | חתימה תקפה, אימות server-to-server מחזיר סכום אחר (עסקת 1 ₪ על הזמנת 500 ₪) | נדחה, הזמנה נשארת `pending`, התראה |
| W5 | אימות API מחזיר סטטוס לא-משולם | אין מעבר ל-paid |
| W6 | webhook על payment לא מוכר | נרשם עם `payment_id NULL`, alert, אפס כתיבות |
| W7 | webhook מאחר אחרי שה-cron ביטל | ההזמנה לא קופצת מ-cancelled ל-paid בשקט; מסומן ל-reconcile ידני (הכסף נגבה אצל Cardcom אבל ההזמנה בוטלה) |
| W8 | אותו `cardcom_transaction_id` על שני payments | UNIQUE חוסם; בדיוק payment אחד succeeded |
| W9 | קריאת success-URL ישירה עם פרמטרים מזויפים | אפס שינוי state; רק webhook מאומת כותב |
| W10 | מרוץ webhook מול cron reconcile | בדיוק מעבר אחד ל-succeeded; מפתח הארנק `(order_id, reason)` מנטרל כפילות |

כלי: harness ב-`tests/helpers/webhook.ts` שיורה POST ל-`/api/payments/cardcom/webhook`
עם שליטה על חתימה (תקפה/שגויה/חסרה), מזהי LowProfileId/TranzactionId, סכום, סטטוס וכפילות,
וה-fake עונה לקריאת האימות server-to-server עם תשובה שנשלטת גם היא. כל בדיקה מאמתת שלושה
דברים: קוד תשובה 200, שורת `payment_webhook_events` עם הדגלים הנכונים, ומצב הזמנה/ארנק/קופונים אחרי.

### 3.3 Refund (R1-R8)

| # | תרחיש | ציפייה |
|---|---|---|
| R1 | refund מלא פיזי (admin) | שורת payments חדשה `kind=refund` + `refund_of_payment_id`; המקור `refunded` רק אחרי אישור Cardcom |
| R2 | refund קופון `issued` | מוחזר `charged_on_site_ils` (מה ששולם באתר) בלבד; הקופון `refunded`; סריקה אחריו נכשלת `refunded` |
| R3 | refund קופון `used` | נדחה. אין refund אחרי מימוש |
| R4 | הזמנה ששולמה חלקית בארנק | חלק הארנק חוזר לארנק (`refund_credit`), חלק הכרטיס לכרטיס; לעולם לא הכול לכרטיס |
| R5 | refund כפול | השני נחסם |
| R6 | סכום גדול מהמקור | נדחה בוולידציה |
| R7 | קריאה על ידי לא-admin | נדחית ב-`requireAdminSession` |
| R8 | refund אחרי payout statement סגור | ה-statement ההיסטורי לא משתנה; adjustment בתקופה הבאה |

### 3.4 פדיון קופון ומניעת פדיון כפול (C)

| # | תרחיש | ציפייה | שכבה |
|---|---|---|---|
| C1 | סריקה תקינה | UPDATE אטומי אחד, `used`, שורת `coupon_redemptions` (UNIQUE על `coupon_code_id`), שורת `coupon_scan_events`; snapshot הסכומים לפי מודל `coupon_price` (D13) | integration |
| C2 | **מרוץ: שתי סריקות מקבילות על אותו קוד** | בדיוק אחת `success`, השנייה `already_used`; ה-CAS `WHERE status='issued'` הוא ההגנה, לא read-then-write | integration (חובה, D9) |
| C3 | replay של INSERT ל-`coupon_redemptions` | נחסם על UNIQUE - מחסום שני בלתי תלוי | integration |
| C4 | קוד של ספק אחר | לסורק `not_found` גנרי; בלוג `wrong_supplier` מדויק | integration |
| C5 | קוד לא קיים | `not_found`, אפס דליפת מידע | integration |
| C6 | פג תוקף / refunded | נדחה בסטטוס האמיתי | integration |
| C7 | סורק לא חבר `supplier_members` | `unauthorized`; `profiles.role` לבדו לא מספיק (אינברינט 12) | integration |
| C8 | rate limit 30/60 | הסריקה ה-31 `rate_limited`; גם כשל נרשם ב-scan_events | integration |
| C9 | QR חתום: תקף/פג/חתימה שבורה/`qr_key_id` לא מוכר | אימות `KE1.` ב-unit; החד-פעמיות לא נשענת על ה-QR אלא רק על ה-DB | unit |
| C10 | cron `expire_coupons` | רק `issued` שפגו הופכים `expired` | integration |
| C11 | סריקה כפולה דרך ה-UI המלא | מסך ירוק ואז מסך אדום עם מועד הפדיון הראשון | E2E |

### 3.5 ארנק (WL)

| # | תרחיש | ציפייה |
|---|---|---|
| WL1 | `fn_wallet_transfer` תקין | זוג debit/credit מאוזן, cache מעודכן באותה טרנזקציה |
| WL2 | replay של `idempotency_key` | מוחזר ה-id הקיים, אין תנועה שנייה |
| WL3 | סכום שלילי/אפס, debit=credit | נדחה |
| WL4 | חריגת יתרה של משתמש | נכשל על `wallet_accounts_user_nonneg`, כל הטרנזקציה מתבטלת; חשבון פלטפורמה (cashback_reserve) כן יכול להישלל |
| WL5 | **מרוץ: שתי העברות של 60 מיתרת 100** | בדיוק אחת מצליחה (`FOR UPDATE` בסדר uuid) |
| WL6 | אחרי N העברות אקראיות | `balance_ils` שווה לנגזרת מה-ledger (אותה שאילתה של ה-integrity הלילי) |
| WL7 | append-only | אין policy UPDATE/DELETE לאף אחד כולל admin; תיקון = תנועה מפצה בלבד |
| WL8 | מרוץ שתי הזמנות על אותה יתרה | שתיהן עוברות ולידציה, רק ה-webhook הראשון מחייב; השני נכשל ומסומן לטיפול, אין יתרה שלילית |

### 3.6 עגלת אורח ומיזוג (G)

| # | תרחיש | ציפייה |
|---|---|---|
| G1 | מיזוג לפי `(product_id, variant_id)` | כמויות מתחברות, תקרה 99 |
| G2 | אין עגלת משתמש | claim אטומי של עגלת האורח |
| G3 | **מרוץ: double callback של OAuth** | `pg_advisory_xact_lock` מונע הכפלה; עגלה אחת בלבד (UNIQUE חלקי על `carts(profile_id)`) |
| G4 | עגלת אורח שורדת רענון + התחברות | E2E במסלול המאושר |

---

## 4. צינורות GitHub Actions

### 4.1 מבנה

ארבעה workflows + composite action אחד:

```
.github/
├── actions/
│   └── setup/action.yml        # composite: checkout כבר בוצע; pnpm+node 22+cache+install
└── workflows/
    ├── ci.yml                  # PR + push: static, unit, build, integration, migrations, e2e-smoke
    ├── preview-e2e.yml         # deployment_status: בדיקות @preview מול ה-URL של Vercel
    ├── nightly.yml             # לילי: e2e מלא, חוזה Cardcom sandbox, visual, migrations מלא
    └── db-backup.yml           # יומי: pg_dump מוצפן כ-artifact (עד מעבר ל-Pro)
```

### 4.2 `ci.yml`

> הערת עתיד (עוגן ‏ARCHITECTURE-MOBILE-SUPERAPP סעיף 10): במעבר ל-monorepo
> ‏(M1/M2 שם) המשימות כאן עוברות לרוץ דרך ‏turbo (`turbo type-check lint test build`)
> ונוסף ‏lane נפרד לאפליקציית המובייל. עד אז המסמך הזה תקף כמות שהוא.

```yaml
name: CI
on:
  pull_request:
    branches: [cursor/add-supabase-3c830]   # יוחלף ל-main בקאטאובר
  push:
    branches: [phase5/homepage]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:                       # < 1 דקה, חוסם
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm exec biome ci .
      - run: pnpm type-check

  unit:                         # < 1 דקה, חוסם (unit + component)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm exec vitest run --project unit --project component

  build:                        # חוסם; כולל שומר דליפת סודות
    needs: static
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm build
        env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ci-anon' }
      - name: assert no service key in client bundle
        run: '! grep -rl "service_role" .next/static'

  integration:                  # חוסם: RLS matrix + פונקציות DB + חוזה טיפוסים
    needs: static
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: supabase/setup-cli@v1
      - run: supabase start          # stack נקי, מחיל migrations + seed.sql אוטומטית
      - run: psql "$LOCAL_DB_URL" -f tests/sql/90_test_support.sql
      - run: pnpm exec vitest run --project integration

  migrations:                   # dry-run מול shadow DB; חוסם כשנוגעים במיגרציות
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with: { filters: "db: ['supabase/migrations/**']" }
      - if: steps.filter.outputs.db == 'true'
        uses: supabase/setup-cli@v1
      - if: steps.filter.outputs.db == 'true'
        name: apply twice on clean shadow stack
        run: |
          supabase db start
          for f in supabase/migrations/*.sql; do psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
          for f in supabase/migrations/*.sql; do psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
      - if: steps.filter.outputs.db == 'true'
        name: post-apply assertions
        run: psql "$SHADOW_DB_URL" -f tests/sql/assert-migrations.sql

  e2e-smoke:                    # חוסם: מסלול מאושר + כרטיס נדחה + double submit
    needs: [build, integration]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: supabase/setup-cli@v1
      - run: supabase start && psql "$LOCAL_DB_URL" -f tests/sql/90_test_support.sql
      - run: pnpm exec playwright install --with-deps chromium
      - run: node tests/fake-cardcom/server.mjs &     # ה-fake על פורט 4545
      - run: pnpm build && pnpm exec playwright test --grep @smoke
        env: { CARDCOM_BASE_URL: 'http://127.0.0.1:4545', CHECKOUT_ENABLED: 'true' }
```

הערות מחייבות:

- `migrations` בודק **פעמיים מלא** על stack נקי (D6, אינברינט 13): image ננעל לגרסת Postgres 17,
  החלה בסדר לקסיקוגרפי (כולל `0075` במקומו), קובץ קובץ, עצירה בשגיאה הראשונה. `assert-migrations.sql` מוודא:
  ספירת `pg_policies` זהה בין שני המעברים (מעבר שני לא הכפיל ולא מחק), אין טבלה ב-public עם RLS
  כבוי (מלבד רשימת חריגים), כל ה-enums בערכים הצפויים, חשבונות הפלטפורמה קיימים פעם אחת בדיוק.
- תיחום ה-harness: הוא בודק את הקבצים כפי שהם מול stack נקי. הוא לא פותר את ה-drift מול dev
  (הטבלה `coupons` החיה); הוא כן מוודא שה-bootstrap של פרויקט הפרודקשן העתידי (P0 ב-PRODUCTION-OPS)
  יעבור חלק. סדר תלויות (027 דורש 016/019/025, 031 דורש 029 וכו') נאכף על ידי ה-exception guards
  שכבר קיימים בקבצים: ה-harness פשוט מפעיל אותם.
- שני קונפליקטי הטיוטות הידועים (`payout_status` 026 מול 027, `products.platform_percent`
  NOT NULL מול nullable) חייבים להיפתר לפי MASTER 1.1/1.4 **לפני** שה-job הזה יעבור. זה פיצ'ר: ה-CI תופס אותם.
- `supabase db push` לכל פרויקט מרוחק אסור בכל שלב ב-CI, וכך גם החלת מיגרציות על dev/prod או
  שימוש ב-service key של פרויקט מרוחק. ה-CI נוגע רק ב-stack המקומי שלו. החלה מרוחקת נשארת
  ידנית דרך MCP `apply_migration` + תיעוד ב-STATE.md.
- caching:

| cache | מפתח | חוסך |
|---|---|---|
| pnpm store | `pnpm-lock.yaml` | 1-2 דק' לכל job |
| Playwright browsers | גרסת `@playwright/test` | ~1 דק' בכל job E2E/visual |
| `.next/cache` | lockfile + קבצי מקור | חצי מזמן ה-build בריצות חוזרות |
| Docker images של Supabase | גרסת CLI | 2-3 דק' ב-integration/migrations |

- יעד: PR רגיל (בלי מיגרציות) ירוק בתוך 8-10 דקות. ה-jobs הקלים רצים במקביל מיידית; הכבדים מחכים רק למה שהם באמת צריכים.

### 4.3 `preview-e2e.yml` (E2E על Preview Deploy)

```yaml
name: Preview E2E
on: [deployment_status]
jobs:
  e2e-preview:
    if: >
      github.event.deployment_status.state == 'success' &&
      contains(github.event.deployment_status.environment, 'Preview')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --grep @preview
        env:
          PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.environment_url }}
```

מזהיר בלבד (לא ב-required checks): הסביבה חולקת את DB ה-dev החי ולכן לא דטרמיניסטית.
מריץ אך ורק את תרחישי `@preview` הקריאתיים (סעיף 2.5). זרימות כסף לעולם לא רצות מול preview.

### 4.4 `nightly.yml`

```yaml
on:
  schedule: [{ cron: '30 0 * * *' }]   # 03:30 ישראל בקיץ
  workflow_dispatch:
```

Jobs: `e2e-full` (כל התרחישים כולל פורטל ספק, מול stack מקומי + fake),
`cardcom-contract` (בדיקות החוזה של ה-adapter מול **Cardcom sandbox אמיתי** עם
`CARDCOM_*` של סביבת הבדיקות מ-secrets; אותם asserts כמו מול ה-fake, כך שסטיית ה-fake
מהמציאות מתגלה כאן), `visual` (snapshots של Playwright ב-4 breakpoints: 360/390/768/1440),
`migrations-full` (ה-harness המלא גם בלי שינוי בקבצים). כשל בלילי פותח issue אוטומטי (`gh issue create`).

### 4.5 `db-backup.yml`

יומי עד המעבר ל-Supabase Pro: `pg_dump` של פרויקט ה-dev (ובעתיד prod) דרך connection string
מ-secrets, gzip, artifact עם retention של 30 יום. חובה לפני שקיים תשלום אמיתי (PRODUCTION-OPS 4.4).

### 4.6 חסימת merge (branch protection)

על ענף היעד `cursor/add-supabase-3c830` (ואחר כך main):

- Required checks: `static`, `unit`, `build`, `integration`, `migrations`, `e2e-smoke`.
  (`migrations` מדווח success גם כשדילג, דרך ה-paths-filter הפנימי, ולכן בטוח כ-required.)
- Require branch up to date לפני merge. אסור force-push לענף היעד.
- `preview-e2e`, `nightly`, `visual` לא חוסמים. visual מקודם לחוסם אחרי שבועיים של baseline יציב (D8).
- push ישיר לענף העבודה `phase5/homepage` מותר וממשיך עם כלל ה-push המיידי מ-CLAUDE.md.

---

## 5. Vercel: Preview, קידום לפרודקשן, סודות, rollback

### 5.1 טופולוגיה

| סביבה | Vercel | Supabase | נתונים |
|---|---|---|---|
| Development | localhost:3000 | stack מקומי (Docker) או פרויקט dev | seed |
| Preview | deploy אוטומטי לכל PR | פרויקט dev `ixvwfbuvfxxsjiywhbbb` (eu-north-1) | dev חי, לא דטרמיניסטי |
| Production | `kenyonexpress.co.il`, region `fra1` | פרויקט prod חדש ונקי (eu-central-1), נבנה 001->אחרון דרך MCP | אמיתי |

### 5.2 זרימת קידום

1. עבודה על `phase5/homepage` (או ענף פיצ'ר). כל push מריץ CI וכל commit נדחף מיד.
2. PR לענף היעד -> CI מלא + Vercel Preview + `preview-e2e`.
3. merge מותר רק עם כל ה-required checks ירוקים (סעיף 4.6).
4. merge לענף היעד = טריגר יחיד ל-deploy פרודקשן (D20). אין `vercel --prod` ידני מהמחשב.
5. PR שנוגע במיגרציות: קודם החלה מרוחקת ידנית דרך MCP `apply_migration` + עדכון
   `src/types/database.ts` + STATE.md, ורק אחר כך merge של הקוד (D21, expand/contract:
   הסכמה החדשה חייבת לעבוד עם הקוד הרץ).

### 5.3 משתני env וסודות (שלושת ה-scopes של Vercel)

| משתנה | Development | Preview | Production |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | מקומי | dev project | prod project |
| `SUPABASE_SERVICE_ROLE_KEY` | מקומי | dev | prod (שונה, מסובב רבעונית) |
| `NEXT_PUBLIC_APP_URL` | localhost | `$VERCEL_URL` | `https://kenyonexpress.co.il` |
| `CARDCOM_TERMINAL/USERNAME/API_NAME/API_PASSWORD` | fake | **לא מוגדר** (אין כסף ב-preview) | terminal אמיתי |
| `CARDCOM_WEBHOOK_SECRET` | ערך בדיקה | לא מוגדר | אמיתי |
| `CARDCOM_BASE_URL` | `http://127.0.0.1:4545` (fake) | לא מוגדר | ברירת המחדל של Cardcom. **ה-fake לעולם לא מוגדר ב-Production** |
| `SUPPLIER_QR_SIGNING_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY` | בדיקה | בדיקה/חסר | אמיתי |
| `CHECKOUT_ENABLED` | true | false | true (kill switch, D22) |

אכיפה: `src/lib/env.ts` עם סכמת zod שמפילה build אם משתנה חסר; בדיקת ה-bundle ב-`build`
(סעיף 4.2) מוודאת שאין `service_role` בצד לקוח. סודות GitHub Actions נפרדים מסודות Vercel
(ה-CI לא מקבל שום secret של פרודקשן; רק sandbox של Cardcom וחיבור ה-backup).

### 5.4 נוהל rollback

| שכבה | פעולה | זמן |
|---|---|---|
| אפליקציה | Vercel Instant Rollback ל-deployment הקודם (Dashboard או `vercel rollback`) | פחות מדקה |
| תשלומים בלבד | `CHECKOUT_ENABLED=false` ב-Production + redeploy (או Edge Config בעתיד) | 1-2 דקות |
| DB | **forward-only.** אין down migrations. תקלה בסכמה = מיגרציה מפצה חדשה דרך MCP. שחזור מלא רק מ-backup (עד Pro: ה-dump היומי; אחרי Pro: PITR) | לפי חומרה |
| DNS (קאטאובר) | TTL 300s מראש; חזרה ל-A record של WordPress הישן, שנשאר חי שבועיים | ~5 דקות |

סדר ההחלמה בתקלת prod: קודם kill switch לתשלומים, אחר כך rollback אפליקציה, ורק אז
טיפול ב-DB. לעולם לא מגלגלים אחורה קוד מתחת לסכמה חדשה בלי לוודא תאימות (D21 מבטיח שיש).

---

## 6. אסטרטגיית Seed, Fixtures ו-Cardcom fake

### 6.1 `supabase/seed.sql` (נטען אוטומטית ב-`supabase start`; לעולם לא רץ על מרוחק)

עיקרון: מיגרציות = סכמה, seed = נתוני בדיקה. ה-seeds ההיסטוריים (017/018/022/023/024)
נשארים כמות שהם; נתוני בדיקה חדשים נכנסים רק ל-seed.sql. מזהים קשיחים (uuid קבועים)
כדי ש-E2E ו-visual יהיו דטרמיניסטיים.

**Personas (דרך auth admin + service):**

| uuid (סיומת) | persona | תפקיד |
|---|---|---|
| `...0001` | customer_a | לקוח, בעל הרשומות |
| `...0002` | customer_b | לקוח עוין (בדיקות בידוד RLS) |
| `...0003` | uploader | content_uploader |
| `...0011/0012/0013` | sup_owner / sup_manager / sup_scanner | חברי ספק X |
| `...0021` | sup_other | owner של ספק Y |
| `...0099` | admin | admin |

**ספקים:** X עם `commission_percent=10` (שלושה חברים), Y עם 15 (owner בלבד). כתובת+עיר+lat/lng
+ טלפון + שעות פתיחה מלאים (חובה לבדיקת בלוק פרטי הספק).

**קטלוג (מוצר אחד לכל מצב):** פיזי בלי override (יורש 10 מהספק); פיזי עם `platform_percent=12.5`;
דיל קופון (`total_deal_price=100`, `coupon_price=10`); מוצר `sold_out`; מוצר `draft`;
מנוי (`recurring_amount=49.90`, `platform_percent=20`, `max_billing_cycles=NULL`) - נכנס כשסכמת המנויים תוחל.

**מצב פתיחה:** יתרות ארנק (customer_a: 30 ₪ דרך `fn_wallet_transfer` עם מפתח seed);
הזמנה היסטורית אחת `paid` עם קופון `issued` ופריט `delivered` (בסיס לבדיקות payout וסריקה).

### 6.2 Factories (`tests/helpers/factories.ts`)

יצירת הזמנה/תשלום/קופון/מנוי במצב נתון דרך service client. כל בדיקת integration בונה
את המצב שלה ולא נשענת על שאריות מבדיקה אחרת; ניקוי לפני כל בדיקה הוא truncate לטבלאות
תנועה בלבד (orders, order_items, payments, payment_webhook_events, wallet_transactions
מעל ה-seed, coupon_codes, coupon_redemptions, coupon_scan_events, carts, cart_items),
לעולם לא לסכמה או ל-personas.

### 6.3 שכבות Cardcom והה-fake (`tests/fake-cardcom/`)

שלוש שכבות, מהמהיר לאיטי:

| שכבה | מה מדמה | מתי רצה |
|---|---|---|
| Cardcom fake (שרת HTTP מקומי) | Low Profile create, דף תשלום, שליפת עסקה לאימות, refund, ירי webhook עם חתימה תקפה/שגויה, token למנויים | כל CI, כל E2E |
| Cardcom sandbox אמיתי (terminal בדיקות + `CARDCOM_*` של סביבת test) | החוזה האמיתי: פורמט תשובות, קודי שגיאה, התנהגות token | suite לילי או ידני לפני release; לא חוסם PR |
| פרודקשן (terminal אמיתי) | עסקת אמת אחת בסכום מינימלי + refund מיידי | פעם אחת בקאטאובר, ידנית, לפי checklist |

ה-fake: שרת HTTP קטן (node, אפס תלויות) שמדמה יצירת Low Profile (מחזיר URL מקומי +
`low_profile_id`), דף "תשלום" שמאפשר לבדיקה לבחור הצלחה/דחייה, ירי webhook חתום (או מזויף,
לפי הוראת הבדיקה), endpoint אימות server-to-server עם תשובה נשלטת, refund, ו-token למנויים.
ה-adapter היחיד (`src/lib/payments/cardcom-client.ts`) הוא הנקודה היחידה שמדברת עם Cardcom,
ומחליף בין fake ל-sandbox לאמיתי דרך `CARDCOM_BASE_URL` בלבד. בדיקות החוזה של ה-adapter
רצות מול ה-fake (כל CI) ומול ה-sandbox (לילי) עם אותם asserts, כך שסטייה של ה-fake מהמציאות
מתגלה בריצה הלילית.

### 6.4 תמיכת SQL לבדיקות (`tests/sql/90_test_support.sql`, CI בלבד, לא מיגרציה - D18)

```sql
-- CI/local only. NEVER applied to a remote project. Not part of supabase/migrations.
create schema if not exists test_support;

-- מדמה חלוף זמן בלי לחכות: מזיז expiry אחורה כדי שה-cron ייתפוס
create or replace function test_support.force_order_expiry(p_order_id uuid)
returns void language sql security definer set search_path = public as $$
  update orders set expires_at = now() - interval '1 minute'
  where id = p_order_id and status = 'pending';
$$;

create or replace function test_support.force_coupon_expiry(p_code text)
returns void language sql security definer set search_path = public as $$
  update coupon_codes set expires_at = now() - interval '1 minute'
  where code = p_code and status = 'issued';
$$;

-- מפעיל את לוגיקת ה-cron בלי לחכות ל-scheduler
create or replace function test_support.run_pending_order_cancel()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update orders set status = 'cancelled', cancelled_at = now()
  where status = 'pending' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on all functions in schema test_support from public, anon, authenticated;
```

נימוק D18: כל דבר שנכנס ל-`supabase/migrations/` מגיע בסוף לפרודקשן (ה-bootstrap של פרויקט
ה-prod מריץ את כל הקבצים). פונקציות עקיפת-זמן בפרודקשן הן חור אבטחה. לכן אפס קבצי מיגרציה
לצורכי בדיקה, וה-CI מחיל את הקובץ הזה בנפרד אחרי `supabase start`.

---

## 7. ויזואלי + RTL עברית

### 7.1 שני מסלולים (D7)

1. **התאמת 1:1 ידנית (קיים)**: `scripts/compare.mjs` מצלם את `refs/ke_live_singlefile.html` מול localhost ב-1440px, `scripts/diff-bands.mjs` נותן אחוז חוסר-התאמה בפסים של 100px עם סבילות 24 לערוץ. נשאר ככלי עבודה בפיתוח עיצוב, לא רץ ב-CI. (ניקוי נלווה: `scripts/_diff-bands.mjs` ו-`scripts/_tmp-hero.mjs` הלא-committed ימוזגו או יימחקו.)
2. **רגרסיה אוטומטית**: פרויקט Playwright ייעודי `visual` עם `toHaveScreenshot`, baseline ב-git, threshold ברוח ה-TOL הקיים (`maxDiffPixelRatio` נמוך + סבילות אנטי-aliasing). דטרמיניזם: קפיאת אנימציות, המתנה לטעינת פונט Heebo, נתוני seed קבועים, מסכות על אזורים דינמיים (מונה עגלה, תמונות מ-storage אם משתנות). רץ בלילי; מקודם לחוסם אחרי ייצוב baseline (D8, סעיף 4.6).

### 7.2 מטריצת breakpoints ודפים

| breakpoint | רוחב | ייצוג |
|---|---|---|
| mobile | 390 | iPhone modern, הקהל העיקרי בישראל |
| mobile-small | 360 | Android נפוץ, קצה צר |
| tablet | 768 | גבול פריסת הביניים |
| desktop | 1440 | ה-baseline הקיים של compare.mjs |

דפים בכל breakpoint: דף בית, קטגוריה, דף מוצר (כשייבנה), עגלה, checkout, אזור אישי (הזמנות + ארנק + קופון עם QR), דף סריקה של ספק (מסך ירוק/אדום), ודף אדמין מייצג אחד (טבלת מוצרים). סה"כ בערך 36 צילומים; רצים כ-job נפרד, מזהיר בלבד בהתחלה (D8).

### 7.3 בדיקות RTL פונקציונליות (לא צילום)

רצות כחלק מה-E2E הרגיל:

- `html[dir=rtl][lang=he]` על כל דף (קיים היום לדף הבית, מורחב לכולם).
- מחירים: `formatPrice` מציג ₪ בפורמט he-IL עקבי; אין מספר "הפוך" בתוך משפט עברי (בדיקת bidi על שורת סכום בעגלה ובאישור הזמנה).
- אין overflow אופקי ב-390px (scrollWidth שווה clientWidth על body) בדפי הליבה.
- מיקוד מקלדת וניווט בטפסים (checkout) עובדים בכיוון RTL.
- טקסט תבניות התראה (כשיגיע 031): כללי ה-RTL המחייבים מהמסמך נבדקים על תבנית דוגמה.

---

## 8. עץ קבצי ה-CI והבדיקות הסופי

```
kenyonexpress/
├── .github/
│   ├── actions/
│   │   └── setup/
│   │       └── action.yml              # composite: pnpm + node 22 + cache + install
│   └── workflows/
│       ├── ci.yml                      # static | unit+component | build | integration | migrations | e2e-smoke
│       ├── preview-e2e.yml             # @preview מול Vercel Preview URL (deployment_status)
│       ├── nightly.yml                 # e2e-full | cardcom-contract (sandbox) | visual | migrations-full
│       └── db-backup.yml               # pg_dump יומי -> artifact (עד Supabase Pro)
├── .nvmrc                              # 22
├── vitest.config.ts                    # projects: unit (node) / component (jsdom) / integration (node+stack)
├── vitest.setup.ts
├── playwright.config.ts                # projects: desktop-1440, mobile-390, visual; tags @smoke/@full/@preview
├── e2e/
│   ├── auth.spec.ts                    # קיים, מתוקן (T9)
│   ├── homepage.spec.ts                # קיים
│   ├── checkout-happy-path.spec.ts     # @smoke: אורח -> login -> Cardcom -> webhook -> אימות snapshot מול DB
│   ├── checkout-failures.spec.ts       # @smoke חלקי: נדחה, double submit; @full: השאר
│   ├── supplier-redeem.spec.ts         # @full: סריקה, כפולה, ספק זר, פג
│   ├── subscription.spec.ts            # @full: הרשמה, מחזור 2, ביטול (כשהשלב ייבנה)
│   ├── preview-smoke.spec.ts           # @preview: read-only בלבד
│   └── visual.spec.ts                  # toHaveScreenshot, 4 breakpoints
├── src/
│   ├── lib/money/                      # + *.test.ts צמודים (M, K, S cases)
│   ├── lib/coupons/state-machine.ts    # + state-machine.test.ts (סעיף 2.2)
│   └── components/**/*.test.tsx        # component project (RTL עברית)
├── tests/
│   ├── integration/
│   │   ├── global-setup.ts
│   │   ├── rls-matrix.data.ts          # המטריצה ההצהרתית
│   │   ├── rls-matrix.test.ts          # ה-runner הגנרי
│   │   ├── wallet.test.ts              # WL1-WL8 כולל מרוצים
│   │   ├── redeem-coupon.test.ts       # C1-C10 כולל המרוץ
│   │   ├── checkout-payments.test.ts   # P1-P12, W1-W10, R1-R8
│   │   ├── cart-merge.test.ts          # G1-G3
│   │   └── types-contract.test.ts      # gen types מול src/types/database.ts
│   ├── helpers/
│   │   ├── factories.ts
│   │   ├── personas.ts                 # uuid קבועים + clients לכל persona
│   │   └── webhook.ts                  # harness ירי webhooks
│   ├── fake-cardcom/
│   │   └── server.mjs
│   └── sql/
│       ├── 90_test_support.sql         # סכמת test_support, CI בלבד (D18)
│       └── assert-migrations.sql       # אימותי אחרי-apply-פעמיים
└── supabase/
    └── seed.sql                        # personas, ספקים X/Y, קטלוג לפי סוג, מצב פתיחה
```

שינויים בקבצים קיימים: `vitest.config.ts` עובר למבנה projects; `playwright.config.ts` מקבל
projects + `PLAYWRIGHT_BASE_URL` מ-env + webServer של build (לא dev); `package.json` מקבל
`test:integration`, `test:e2e:smoke`, ו-engines. שום מיגרציה חדשה לא נוצרת (D18).

---

## 9. Definition of Done לכל שלב

תנאי סף משותף לכל השלבים: CI ירוק מלא, אפס אזהרות biome חדשות, STATE.md מעודכן, והאינברינטים מסעיף 2.0 הרלוונטיים לשלב מכוסים בבדיקות שרצות ב-CI.

### 9.1 עגלה (Phase 2, אחרי החלת 026)

- [ ] מודול `src/lib/money/` קיים עם כל טבלת המקרים M1-M17, M19-M22 ומקרי K1-K8 ירוקה (הפיצול נחוץ כבר לתצוגת snapshot בעגלה).
- [ ] בדיקות integration ל-`fn_merge_guest_cart` כולל מקרה המרוץ (double callback) ותקרת 99.
- [ ] RLS matrix מעודכנת ל-`cart_items` וכל התאים ירוקים.
- [ ] E2E: אורח בונה עגלה, מתחבר, העגלה ממוזגת ושורדת; עגלה ריקה לא מגיעה ל-checkout.
- [ ] harness המיגרציות עבר על 026 (פעמיים) כולל אימות שה-rename של `wallet_transactions_legacy` בטוח לריצה חוזרת.
- [ ] אין מחיר בשום שורת cart_items (אינברינט 10 ברמת הסכמה: הבדיקה מוודאת שאין עמודת מחיר ושה-action דוחה קלט מחיר).

### 9.2 checkout ותשלומים (Phase 3)

- [ ] Cardcom adapter + fake + harness ה-webhook קיימים; כל W1-W10 ירוקים.
- [ ] כל R1-R8 (refund) ירוקים.
- [ ] `beginCheckout` נבדק: snapshot נכון לכל שורה (כולל override 12.5 מה-seed), expires_at, אפס שדות כסף מהלקוח (payload עם מחיר נדחה).
- [ ] מעבר paid נבדק כטרנזקציה שלמה: payment succeeded + חיוב ארנק + הנפקת קופונים + מלאי + audit, והכול מתגלגל אחורה יחד בכשל אמצעי.
- [ ] fail-closed ל-rate-limit פעיל ונבדק (D10): הבאג של `rate-limit.ts` סגור.
- [ ] E2E המסלול המאושר המלא ירוק כולל מסלולי הכשל החוסמים.
- [ ] בדיקת חוזה אחת ירוקה מול Cardcom sandbox אמיתי (ידנית או לילית) לפני פתיחת השלב למשתמשים.
- [ ] crons (ביטול pending, reconcile) נבדקים ב-integration עם הזזת זמן מדומה (test_support).

### 9.3 ארנק (עם 026, נאכף לפני שכסף אמיתי נכנס לארנק)

- [ ] כל בדיקות `fn_wallet_transfer` (WL1-WL8) ירוקות, כולל שני מקרי המרוץ ובדיקת ה-cache מול הסכימה הנגזרת.
- [ ] בדיקת ledger append-only: אין policy כתיבה לאף אחד כולל admin (RLS matrix), ו-UPDATE ישיר ב-service נחסם נוהלית (בדיקה שמתעדת שהתיקון היחיד הוא תנועה מפצה).
- [ ] הקצאת ארנק ב-checkout: M19-M21 ברמת unit + התרחיש המלא ב-integration (כולל ארנק מכסה הכול: אפס קריאות ל-fake).
- [ ] refund לארנק (R4) ירוק.
- [ ] שאילתת ה-integrity הלילית (balance מול ledger) קיימת ורצה גם כבדיקה.

### 9.4 ספקים (Phase 5a, אחרי החלת 027 ויורשותיה)

- [ ] RLS matrix מורחבת לכל טבלאות הספקים, כולל שלושת תתי-התפקידים (owner/manager/scanner) ו-`sup_other` כ-persona עוינת.
- [ ] כל בדיקות `redeem_coupon` (C1-C11) ירוקות כולל המרוץ, האנטי-enumeration וה-rate limit.
- [ ] כל בדיקות ה-payout ירוקות (settlement כפול, dispute חוסם, bank_snapshot מוקפא, ביטול משחרר פריטים).
- [ ] אימות חתימת QR: unit לפורמט `KE1.` (תקף/פג/חתימה שבורה/מפתח לא מוכר לפי qid) + חוזה שהחד-פעמיות לא נשענת על ה-QR (אינברינט 8 נאכף רק ב-DB).
- [ ] E2E פורטל ספקים (סעיף 2.5) ירוק.
- [ ] הבדיקה המתעדת של ה-policy השבורה מ-014 הוחלפה בבדיקה החיובית על ה-policy החדשה.

---

## 10. חוב בדיקות לקוד הקיים (מתועדף)

מה שכבר כתוב היום וחשוף, מהדחוף לפחות דחוף:

| # | פריט | סיכון | פעולה |
|---|---|---|---|
| T1 | **אין CI בכלל** | כל האמור במסמך לא נאכף; type-check נשבר בשקט | הקמת `ci.yml` עם static/unit/build עוד לפני שנכתב קוד כסף. יום עבודה |
| T2 | **`rate-limit.ts` fails open + `checkUserRateLimit` בלי קוראים** (באג מתועד) | ברגע שיהיה checkout, כשל RPC שקט מבטל את כל ההגנה | בדיקת unit שמקבעת fail-closed לפעולות כסף; התיקון עצמו ב-Phase 3 (D10) |
| T3 | **`mergeGuestCart` הקיים ב-`src/server/actions/cart.ts` הוא read-merge-write בלי נעילה** (ממצא מתועד) | איבוד/הכפלת פריטים בהתחברות | בדיקת integration שמדגימה את המרוץ על הקוד הקיים (תיכשל, מתועדת כ-known failure), מוחלפת בירוק כש-029 מחליפה ל-RPC |
| T4 | **policy שבורה ב-014** ("products: vendor read own" משווה מול vendors.id) | ספק לא רואה מוצרים; גרוע מזה, תיקון נאיבי עלול לפתוח יותר מדי | בדיקה מתעדת (אפס שורות היום) שתתהפך לבדיקה חיובית עם 027 |
| T5 | **`payment_tokens` תחת ה-policy הישנה מ-001** (owner all, כולל קריאת cardcom_token) | ברגע שיישמרו tokens אמיתיים, דליפה | ה-policy החדשה ב-029; בדיקת ה-42501 נכנסת ל-RLS matrix מיום החלתה. עד אז: אסור לכתוב token אמיתי לטבלה |
| T6 | **דפי אדמין בלי בדיקות authorization** (`requireAdminSession`, actions תחת `src/server/actions/admin/`) | פעולת אדמין חשופה תעבור בשקט | בדיקות integration קצרות: כל admin action נדחה ל-customer. חצי יום |
| T7 | **`formatPrice` כמעט לא נבדק** (בדיקה אחת שבודקת שיש "99") | שבירת תצוגת מחירים ב-refactor | 6-8 מקרים: אגורות, אפס, סכומים גדולים, he-IL |
| T8 | **validations קיימות בלי בדיקות לצד ה-actions** (auth.ts, cart.ts משתמשים ב-supabase ישירות) | שינוי חתימה שקט | בדיקות unit ל-zod של cart (כמות 1-99, uuid) כשנכתב מחדש ב-Phase 2 |
| T9 | **E2E מפנה ל-`/checkout` שלא קיים** (`e2e/auth.spec.ts` בודק redirect לדף שאין לו route) | הבדיקה עוברת על 404 עתידי | לתקן את הבדיקה להצהיר על הצפוי היום, ולעדכן כשה-route ייבנה |
| T10 | **סקריפטים ויזואליים לא ממוסדים** (`_diff-bands.mjs`, `_tmp-hero.mjs` לא ב-git, כפילות עם `diff-bands.mjs`) | אובדן כלי העבודה, בלבול | מיזוג/מחיקה + commit; הקמת פרויקט visual של Playwright לפי סעיף 7 |
| T11 | **אין `supabase/seed.sql` ואין factories** | כל בדיקת integration עתידית תמציא נתונים משלה | הקמה יחד עם ה-runner של ה-RLS matrix, לפני Phase 2 |
| T12 | **drift מול dev לא ממופה** (`coupons` חיה בניגוד לקבצים, היסטוריה מרוחקת לא מסונכרנת) | הפתעות בכל החלת מיגרציה | ריצת השוואה חד-פעמית (schema diff בין dev לבין stack נקי אחרי 001-025) ותיעוד הפערים ב-STATE.md; לא חוסם את ה-harness שרץ על stack נקי |

---

## 11. שאלות פתוחות

1. פרטי sandbox של Cardcom (terminal בדיקות, credentials): צריך פתיחה מול Cardcom לפני Phase 3. עד אז ה-fake נבנה לפי התיעוד הציבורי של Low Profile API.
2. GitHub Actions minutes: הצינור המלא צורך בערך 25-30 דקות מחשב לכל PR. בחשבון free (2,000 דקות לחודש לריפו פרטי) זה בערך 60-70 PRs בחודש. אם יש חריגה: לצמצם את e2e-full ללילי בלבד.
3. שם ענף היעד: ההגנות מוגדרות היום על `cursor/add-supabase-3c830`. כשעוברים ל-main אמיתי צריך להעביר את ה-branch protection.
4. ריצת ה-integrity הלילית של הארנק בפרודקשן (השוואת cache מול ledger): איפה רצה, Vercel cron או pg_cron. תלוי בהחלטת ה-Pro של PRODUCTION-OPS.

(נסגר: מועד קידום visual מ"מזהיר" ל"חוסם" הוכרע, אחרי שבועיים של baseline יציב, סעיף 4.6.)
