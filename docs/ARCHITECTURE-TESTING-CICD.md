# ארכיטקטורת בדיקות ו-CI/CD - KenyonExpress (מסמך מחייב)

סטטוס: FINAL DESIGN. תאריך: 2026-07-17. ענף: `phase5/homepage`.

מסמך זה **מחליף** את `TESTING-CICD-ARCHITECTURE.md` (2026-07-09) ומיישר את כל הבדיקות
למודל העסקי המעודכן ב-`BUSINESS-MODEL.md` וב-`ARCHITECTURE-COMMERCE.md` (2026-07-17, מקור אמת יחיד).
ההכרעות D1-D12 מהמסמך הקודם נשארות בתוקף אלא אם נדרסו כאן במפורש. כל מה שכתוב כאן הוא הכרעה, לא הצעה.

מסמכים קשורים: `MASTER-ARCHITECTURE.md` (v2), `PRODUCTION-OPS-ARCHITECTURE.md`, `SUPPLIER-REDEMPTION-ARCHITECTURE.md`.

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
| כלים | pnpm (lockfile), biome 1.9, tsc strict + `noUncheckedIndexedAccess`, Next 16.2.4, React 19.2 |
| ענף יעד ל-PR | `cursor/add-supabase-3c830` (יוחלף ב-main בקאטאובר) |

---

## 1. הכרעות חדשות (D13-D22, המשך ל-D1-D12)

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

מקרי חובה M1-M17, M19-M22 (הטבלה המלאה מהמסמך הקודם נשארת מחייבת אחד-לאחד):
M1 קנוני 40000/10% = 4000+36000; M3 עמלה מתעגלת ל-0; M4-M6 half-up ולא banker's
(15 באג' ב-50% = 8, 25 ב-50% = 13); M7-M8 אחוז עשרוני (12.5%, 33.33%); M10-M13 קצוות 0/100/0.01/99.99;
M14 עיגול לשורה ולא ליחידה (3333×3 ב-10% = 1000, לא 999); M15 property test:
לכל total ב-1..10^7 ולכל pp ברשת 0.01: `fee + supplier = total`, שניהם אי-שליליים;
M16 המרת float (`A(19.99)=1999`); M17 קלט לא חוקי זורק; M19-M21 הקצאת ארנק
(ארנק מקטין חיוב כרטיס בלבד, הפיצול על המלא, ארנק מכסה הכול = אפס קריאת Cardcom);
M22 שרשרת ה-fallback `product.platform_percent -> supplier.commission_percent -> 10`.

**מקרי שורת קופון (K, מחליפים את M18 הישן בהתאם ל-D13):**

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

שלוש משפחות, כמו במסמך הקודם, בתוקף מלא:

1. **מטריצת RLS** data-driven (D5): הטבלה המלאה מהמסמך הקודם (personas: anon, customer_a/b,
   uploader, sup_owner/manager/scanner, sup_other, admin) נשארת המחייבת, כולל בדיקות הדגל
   (customer_b לא רואה כלום של customer_a; `payment_tokens.cardcom_token` לא קריא לאף role
   דפדפני; `wallet_transactions` בלי policy כתיבה לאף אחד כולל admin; policy פיקטיבית מרחיבה
   חייבת להפיל את ה-runner).
2. **פונקציות DB**: `fn_wallet_transfer`, `redeem_coupon`, `fn_merge_guest_cart`,
   `generate_payout_statement` ומשפחתה, `update_shipping_status`, `check_user_rate_limit`,
   `fn_request/cancel/execute_account_deletion`. מקרי החובה בסעיף 3.
3. **חוזה סכמה**: `supabase gen types` על ה-stack המקומי מושווה ל-`src/types/database.ts`. drift מכשיל.

### 2.5 E2E (Playwright)

רץ מול `next build && next start` + Supabase מקומי + Cardcom fake (PR) או Cardcom sandbox (לילי).

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

**מסלולי כשל E2E** (כרטיס נדחה, נטישה+expiry, double submit, webhook כפול, מלאי אזל,
אורח ישירות ל-`/checkout`, עגלה ריקה) - הטבלה מהמסמך הקודם בתוקף. `@smoke` חוסם:
המסלול המאושר + כרטיס נדחה + double submit. השאר `@full` (לילי).

**E2E פורטל ספק:** סריקה תקפה (ירוק + `collect_amount`), סריקה שנייה (אדום + מועד ראשון),
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
| W2 | חתימה שגויה | `signature_valid=false` נרשם, מוחזר 200, אפס כתיבות |
| W3 | חתימה חסרה | כמו W2 |
| W4 | חתימה תקפה, אימות server-to-server מחזיר סכום אחר | נדחה, הזמנה נשארת `pending`, התראה |
| W5 | אימות API מחזיר סטטוס לא-משולם | אין מעבר ל-paid |
| W6 | webhook על payment לא מוכר | נרשם עם `payment_id NULL`, אפס כתיבות |
| W7 | webhook מאחר אחרי שה-cron ביטל | ההזמנה לא קופצת מ-cancelled ל-paid בשקט; מסומן ל-reconcile ידני |
| W8 | אותו `cardcom_transaction_id` על שני payments | UNIQUE חוסם; בדיוק payment אחד succeeded |
| W9 | קריאת success-URL ישירה עם פרמטרים מזויפים | אפס שינוי state; רק webhook מאומת כותב |
| W10 | מרוץ webhook מול cron reconcile | בדיוק מעבר אחד ל-succeeded; מפתח הארנק `(order_id, reason)` מנטרל כפילות |

כלי: harness ב-`tests/helpers/webhook.ts` שיורה POST ל-`/api/payments/cardcom/webhook`
עם שליטה על חתימה/מזהים/סכום/כפילות, וה-fake עונה לקריאת האימות. כל בדיקה מאמתת שלושה
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
| C1 | סריקה תקינה | UPDATE אטומי אחד, `used`, שורת `coupon_redemptions` (UNIQUE על `coupon_code_id`), שורת `coupon_scan_events` | integration |
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
| WL4 | חריגת יתרה של משתמש | נכשל על `wallet_accounts_user_nonneg`, כל הטרנזקציה מתבטלת |
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

- `migrations` בודק **פעמיים מלא** על stack נקי (D6, אינברינט 13). `assert-migrations.sql` מוודא:
  ספירת `pg_policies` זהה בין שני המעברים, אין טבלה ב-public עם RLS כבוי (מלבד רשימת חריגים),
  כל ה-enums בערכים הצפויים, חשבונות הפלטפורמה קיימים פעם אחת בדיוק.
- שני קונפליקטי הטיוטות הידועים (`payout_status` 026 מול 027, `products.platform_percent`
  NOT NULL מול nullable) חייבים להיפתר לפי MASTER 1.1/1.4 **לפני** שה-job הזה יעבור. זה פיצ'ר: ה-CI תופס אותם.
- `supabase db push` לכל פרויקט מרוחק אסור בכל שלב ב-CI. החלה מרוחקת נשארת ידנית דרך MCP `apply_migration`.
- caching: pnpm store (מפתח lockfile), דפדפני Playwright (מפתח גרסה), `.next/cache`, images של Supabase.
  יעד: PR רגיל ירוק בתוך 8-10 דקות.

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

## 6. אסטרטגיית Seed ו-Fixtures

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
את המצב שלה; ניקוי לפני כל בדיקה הוא truncate לטבלאות תנועה בלבד (orders, order_items,
payments, payment_webhook_events, wallet_transactions מעל ה-seed, coupon_codes,
coupon_redemptions, coupon_scan_events, carts, cart_items), לעולם לא לסכמה או ל-personas.

### 6.3 Cardcom fake (`tests/fake-cardcom/`)

שרת HTTP קטן (node, אפס תלויות) שמדמה: יצירת Low Profile (מחזיר URL מקומי + `low_profile_id`),
דף "תשלום" שמאפשר לבדיקה לבחור הצלחה/דחייה, ירי webhook חתום (או מזויף, לפי הוראת הבדיקה),
endpoint אימות server-to-server עם תשובה נשלטת, refund, ו-token למנויים. ה-adapter היחיד
(`src/lib/payments/cardcom-client.ts`) מחליף בין fake ל-sandbox לאמיתי דרך `CARDCOM_BASE_URL` בלבד.
בדיקות החוזה של ה-adapter רצות מול ה-fake (כל CI) ומול ה-sandbox (לילי) עם אותם asserts.

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

## 7. עץ קבצי ה-CI והבדיקות הסופי

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
