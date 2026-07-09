# ארכיטקטורת בדיקות, איכות ו-CI/CD - KenyonExpress

מסמך תכנון. סטטוס: DESIGN. אין בו קוד ואין בו מיגרציות.
תאריך: 2026-07-09. ענף: `phase5/homepage`.
מסמכים קשורים: `MASTER-ARCHITECTURE.md` (מסמך ההכרעות המחייב), `COMMERCE-ARCHITECTURE.md` (026), `SUPPLIER-REDEMPTION-ARCHITECTURE.md` (027/028), `ACCOUNT-IDENTITY-ARCHITECTURE.md` (029), `PRODUCTION-OPS-ARCHITECTURE.md` (סעיפים 1.4, 4).

> מטרת המסמך: אסטרטגיית בדיקות ו-CI/CD לאתר שמזיז כסף אמיתי (Cardcom, ארנק cashback,
> פיצול platform_percent, קופונים חד-פעמיים) עם בעלים יחיד. באג בקוד הכסף שווה כסף אבוד,
> ולכן ההיררכיה כאן הפוכה מהמקובל: קודם כסף ו-RLS, אחר כך UI.

---

## 0. עובדות מוצא

מה שקיים בפועל בריפו נכון להיום, לא מה שהיה אמור להיות:

| רכיב | מצב בפועל | השלכה |
|---|---|---|
| CI | **אין `.github/workflows` בכלל.** רק husky + lint-staged ב-pre-commit | שום דבר לא נאכף אחרי commit. הפער הגדול ביותר |
| בדיקות קיימות | 4 בלבד: `src/__tests__/example.test.ts` (טריוויאלי), `src/__tests__/auth.validations.test.ts` (zod, טוב), `e2e/auth.spec.ts`, `e2e/homepage.spec.ts` | אפס כיסוי לקוד כסף, עגלה, RBAC, אדמין |
| vitest | `vitest.config.ts`: jsdom, globals, include רק `src/**/*.test.ts(x)` | אין הפרדת unit/integration, אין סביבת node לבדיקות DB |
| Playwright | `playwright.config.ts`: chromium בלבד, `locale he-IL`, baseURL localhost:3000, webServer `pnpm dev` | אין פרויקטים למובייל, אין snapshots |
| לוגיקת כסף בקוד אפליקציה | **לא קיימת.** היחיד הוא `formatPrice` ב-`src/lib/utils.ts` (תצוגה בלבד) | כל חישוב הפיצול ייכתב ב-Phase 2/3, המודול חייב להיוולד עם בדיקות |
| לוגיקת כסף ב-DB | `fn_wallet_transfer`, `redeem_coupon`, `generate_payout_statement` וכו' בטיוטות 026/027 (לא הוחלו) | הבדיקות שלהן הן בדיקות אינטגרציה מול Postgres, לא unit |
| מיגרציות | 001-025 מוחלות על dev, 026-031 טיוטות. drift ידוע: היסטוריה מרוחקת לא מסונכרנת, `coupons` קיימת בניגוד לקבצים | אסור `db push`. בדיקות מיגרציה חייבות לרוץ על stack נקי, לא על dev |
| ויזואלי | `scripts/compare.mjs` (שני צילומי PNG ב-1440px) + `scripts/diff-bands.mjs` (diff בפועל, TOL=24 לערוץ, פסים של 100px) | תשתית טובה כבסיס, אבל ידנית ולא רצה ב-CI |
| Supabase מקומי | `supabase/config.toml` מלא (db 54322, api 54321, db.seed מופעל) אבל Docker לא רץ ואין `supabase/seed.sql` | התשתית לבדיקות אינטגרציה קיימת על הנייר בלבד |

---

## 1. הכרעות מחייבות (D1-D12)

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

---

## 2. פירמידת הבדיקות

```
        E2E (Playwright)          ~10 תרחישים, הזרימות שמזיזות כסף
      ─────────────────────
      Integration (Postgres)      RLS matrix + פונקציות DB + מיגרציות
    ─────────────────────────
    Unit (vitest, טהור)           כל אריתמטיקת הכסף + ולידציות + מיזוג עגלה
```

### 2.0 רשימת האינברינטים (החוזה שהבדיקות אוכפות)

כל שורה כאן חייבת בדיקה אחת לפחות. זו רשימה סגורה שמתעדכנת רק דרך מסמך זה:

1. `platform_fee + supplier_due = total` בכל פריט פיזי, תמיד, בלי drift של אגורה.
2. `charged_on_site + balance_due_at_business = total` בכל פריט, פיזי וקופון.
3. בקופון: `supplier_due = 0` וגם `charged_on_site = platform_fee`.
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

### 2.1 שכבת Unit (vitest, סביבת node, בלי DB)

מה נבדק כאן: רק קוד טהור. המודולים:

| מודול (ייכתב ב-Phase 2/3) | מה בודקים |
|---|---|
| `src/lib/money/agorot.ts` | המרה שקלים לאגורות ובחזרה, הגנת floating point |
| `src/lib/money/split.ts` | פיצול platform/supplier לפי `platform_percent`, שורת קופון מול פיזי |
| `src/lib/money/order-totals.ts` | סכימת שורות, הקצאת ארנק מול חיוב כרטיס |
| `src/lib/money/format.ts` (או `formatPrice` הקיים) | תצוגת ₪ ב-he-IL |
| `src/lib/validations/*` | סכמות zod (קיים חלקית, להרחיב ל-checkout) |
| `src/lib/admin/rbac.ts` | `isAdminRole`, `isStaffRole` על כל חמשת ה-roles |
| לוגיקת מיזוג עגלה (הפונקציה הטהורה שבתוך ה-RPC משוכפלת כ-TS למיזוג צד לקוח אם יהיה) | חיבור כמויות, תקרה 99, איחוד לפי product+variant |

#### טבלת מקרי הפיצול (חובה, אחד לאחד)

הנוסחה מ-COMMERCE סעיף 4: `fee_ag = round_half_up(line_total_ag * pp / 100)`, `supplier_ag = line_total_ag - fee_ag`. כל הערכים באגורות (integer):

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

בדיקות נלוות באותו קובץ:

| # | מקרה | ציפייה |
|---|---|---|
| M15 | property test (fast-check או לולאה דטרמיניסטית): לכל total באגורות 1..10^7 ולכל pp ברשת 0.01: `fee + supplier = total`, שניהם ≥ 0, `fee ≤ total` | אינברינטים 1, 4 |
| M16 | המרת float: `A(19.99) = 1999` (למרות ש-`19.99*100 = 1998.999...9`), `A(0.29) = 29`, `A(102.99) = 10299` | round ולא trunc בהמרה |
| M17 | קלט לא חוקי: total שלילי, pp מחוץ ל-0..100, total לא שלם | זריקת שגיאה, לא תוצאה שקטה |
| M18 | שורת קופון: face 40000, pp 10 | `charged_on_site=4000`, `balance_due=36000`, `supplier_due=0`, `platform_fee=4000`; תואם snapshot של `coupon_codes` (400 / 40 / 360) |
| M19 | הקצאת ארנק: total 10000, ארנק 3000 | חיוב כרטיס 7000; הפיצול מחושב על 10000 המלא (הכרעה O5) |
| M20 | ארנק מכסה הכול: total 10000, ארנק 10000 | חיוב כרטיס 0, אין קריאת Cardcom, הזמנה paid |
| M21 | ארנק גדול מהסכום | נחתך ל-total, לעולם לא חיוב שלילי |
| M22 | resolution של האחוז: מוצר עם override, מוצר בלי override עם ספק, מוצר בלי כלום | שרשרת `product.platform_percent -> supplier.commission_percent -> 10` (מקביל TS ל-`product_platform_percent`; ההתאמה בין שניהם נבדקת באינטגרציה) |

זמן ריצה יעד לכל שכבת ה-unit: פחות מ-10 שניות.

#### אינברינטים של ה-ledger ברמת unit

הלוגיקה עצמה ב-`fn_wallet_transfer` (אינטגרציה, סעיף 5.2), אבל שכבת האפליקציה שמייצרת idempotency keys נבדקת כ-unit:

| מקרה | ציפייה |
|---|---|
| נגזרת המפתח: `(order_id, reason)` | דטרמיניסטי, ייחודי לצמד, יציב בין ריצות |
| שני webhooks על אותה הזמנה | אותו מפתח בדיוק (זה מה שמנטרל כפילות) |
| אותה הזמנה, reason שונה (spend מול refund_credit) | מפתחות שונים |

### 2.2 שכבת Integration (vitest, סביבת node, מול Supabase מקומי)

תשתית: `supabase start` מקומי או ב-CI (Docker), החלת כל המיגרציות מאפס, seed personas (סעיף 5.3), ואז שלוש משפחות:

1. **מטריצת RLS** (הרחבה בסעיף 5.2). המטריצה המלאה, role על table על operation:

Personas: `anon`, `customer_a` (בעל הרשומות), `customer_b` (משתמש אחר), `uploader` (content_uploader), `sup_owner` / `sup_manager` / `sup_scanner` (חברי supplier X), `sup_other` (חבר supplier Y), `admin`, `service` (service_role, עוקף RLS, נבדק רק כ-sanity).

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

2. **פונקציות DB** (סעיף 5.2): ארנק, פדיון, payout, מיזוג עגלה, מחיקת חשבון, rate limit, notifications claim.

3. **חוזה מול הסכמה**: `generate_typescript_types` על ה-stack המקומי מושווה ל-`src/types/database.ts` שב-git. drift בטיפוסים מכשיל את הבדיקה (מוודא שה-repo לא משקר לגבי הסכמה).

### 2.3 שכבת E2E (Playwright)

רצה מול `next build && next start` (לא dev server) + Supabase מקומי + Cardcom fake (D3).

**המסלול המאושר (happy path) המלא, בדיקה אחת רציפה:**

1. אורח נכנס לדף הבית (RTL, he), נכנס לקטגוריה, מוסיף מוצר פיזי + דיל קופון לעגלה. עוגיית `ke_session_id` קיימת, העגלה שורדת רענון.
2. לוחץ לתשלום, מופנה ל-`/login?next=/checkout`.
3. מתחבר (משתמש בדיקה, לא Google אמיתי, D4). `fn_merge_guest_cart` רץ: העגלה המלאה מופיעה אצל המשתמש, עגלת האורח נעלמה.
4. checkout: מזין כתובת, לא שולח שום מחיר מהדפדפן. ההזמנה נוצרת pending עם snapshot נכון (המחירים נבדקים מול ה-DB, לא מול ה-UI).
5. הפניה לדף Cardcom fake, "משלם", ה-fake יורה webhook חתום.
6. חזרה לאתר: ההזמנה paid רק אחרי ה-webhook (דף ה-redirect לבדו לא משנה סטטוס: הבדיקה מאמתת שהסטטוס נשאר pending עד ירי ה-webhook).
7. באזור האישי: ההזמנה מופיעה, קוד קופון בן 8 ספרות + QR הונפקו לפריט הקופון, cashback זוכה בארנק אם רלוונטי.

**מסלולי כשל (כל אחד בדיקה נפרדת):**

| תרחיש | ציפייה |
|---|---|
| כרטיס נדחה (ה-fake מחזיר decline) | payment נשאר failed, הזמנה לא paid, מלאי לא ירד, אין קוד קופון, אין תנועת ארנק |
| נטישה בדף התשלום + חלוף 30 דקות (cron מדומה) | הזמנה cancelled, payment failed |
| לחיצה כפולה על "שלם" (double submit) | הזמנה אחת, payment אחד (idempotency key) |
| webhook כפול על אותה עסקה | state לא משתנה בפעם השנייה, אין cashback כפול |
| יתרת ארנק לא מספיקה בין ולידציה לחיוב (מרוץ מדומה) | ההזמנה מסומנת לטיפול, אין יתרה שלילית |
| מלאי אזל בין עגלה ל-checkout | checkout נדחה עם הודעה, לא נוצרת הזמנה |
| אורח מנסה `/checkout` ו-`/account` ישירות | redirect ל-login (קיים היום ב-e2e/auth.spec.ts, נשמר) |
| משתמש מחובר עם עגלה ריקה נכנס ל-checkout | הפניה לעגלה, אין הזמנת אפס |

**E2E לפורטל ספקים (Phase 5a):** התחברות scanner, סריקת קוד תקף (מסך ירוק + `collect_amount`), סריקה שנייה של אותו קוד (מסך אדום + מועד פדיון ראשון), קוד של ספק אחר (מוצג not found גנרי), קוד פג תוקף.

Smoke ב-PR (חוסם): המסלול המאושר + כרטיס נדחה + double submit. השאר בריצה לילית/לפני release (מזהיר).

---

## 3. בדיקות תשלומים Cardcom

### 3.1 אסטרטגיית sandbox

שלוש שכבות, מהמהיר לאיטי:

| שכבה | מה מדמה | מתי רצה |
|---|---|---|
| Cardcom fake (שרת HTTP מקומי שעוטף את ה-adapter) | Low Profile create, שליפת עסקה לאימות, refund, ירי webhook עם חתימה תקפה/שגויה | כל CI, כל E2E |
| Cardcom sandbox אמיתי (terminal בדיקות + `CARDCOM_*` של סביבת test) | החוזה האמיתי: פורמט תשובות, קודי שגיאה, התנהגות token | suite לילי או ידני לפני release; לא חוסם PR |
| פרודקשן (terminal אמיתי) | עסקת אמת אחת בסכום מינימלי + refund מיידי | פעם אחת בקאטאובר, ידנית, לפי checklist |

ה-adapter היחיד (`src/server/actions/payments/` + `src/lib/payments/cardcom-client.ts` עתידי) הוא הנקודה היחידה שמדברת עם Cardcom. ה-fake וה-sandbox מתחלפים ב-env בלבד. בדיקות חוזה (contract tests) על ה-adapter רצות מול שניהם עם אותם asserts, כך שסטייה של ה-fake מהמציאות מתגלה בריצה הלילית.

### 3.2 harness לסימולציית webhook

כלי בדיקה (סקריפט + helper לבדיקות) שמייצר POST ל-`/api/payments/cardcom/webhook` עם שליטה מלאה על: חתימה (תקפה/שגויה/חסרה), מזהי LowProfileId/TranzactionId, סכום, סטטוס, כפילות. בצד השני ה-fake עונה לקריאת האימות server-to-server עם תשובה שנשלטת גם היא. כל בדיקת webhook בודקת שלושה דברים: קוד תשובה (תמיד 200), רשומת `payment_webhook_events` שנכתבה עם הדגלים הנכונים, ומצב ההזמנה/תשלום/ארנק/קופונים אחרי.

### 3.3 מקרי replay והתקפה (חובה, כל אחד בדיקה)

| # | תקיפה | ציפייה |
|---|---|---|
| W1 | אותו webhook פעמיים (אותו external_event_id) | הפעם השנייה נעצרת על `UNIQUE (provider, external_event_id)` לפני כל שינוי state; אין cashback כפול, אין קופון כפול, אין הפחתת מלאי כפולה |
| W2 | חתימה שגויה | נרשם `signature_valid=false`, מוחזר 200, אפס כתיבות state, alert |
| W3 | חתימה חסרה | כמו W2 |
| W4 | חתימה תקפה אבל אימות ה-API מחזיר סכום אחר (עסקת 1 ₪ על הזמנת 500 ₪) | נדחה, `verified_against_api` שלילי לוגית, הזמנה נשארת pending, alert |
| W5 | חתימה תקפה, אימות API מחזיר סטטוס לא-משולם | אין מעבר ל-paid |
| W6 | webhook על payment לא מוכר | נרשם עם `payment_id NULL`, alert, אפס כתיבות |
| W7 | webhook מאחר: מגיע אחרי שה-cron ביטל את ההזמנה (expiry 30 דקות) | התנהגות מוגדרת ונבדקת: ההזמנה לא קופצת מ-cancelled ל-paid בשקט; המקרה מסומן ל-reconcile ידני (הכסף נגבה אצל Cardcom אבל ההזמנה בוטלה) |
| W8 | אותו `cardcom_transaction_id` על שתי רשומות payment | נחסם ב-UNIQUE; בדיוק payment אחד succeeded אי פעם |
| W9 | קריאת redirect/success URL ישירה עם פרמטרים מזויפים | אפס שינוי state (רק ה-webhook המאומת כותב) |
| W10 | מרוץ: webhook תקף + cron reconcile רצים במקביל על אותו payment | בדיוק מעבר אחד ל-succeeded; ה-idempotency של תנועת הארנק נשמר |

### 3.4 בדיקות refund

| # | תרחיש | ציפייה |
|---|---|---|
| R1 | refund מלא של הזמנה פיזית (admin) | שורת payments חדשה kind=refund עם `refund_of_payment_id`; המקור עובר refunded רק אחרי אישור Cardcom (ב-fake: רק אחרי תשובת ההצלחה) |
| R2 | refund של פריט קופון במצב issued | מוחזר `charged_on_site_ils` בלבד (עמלת הפלטפורמה ששולמה באתר); הקופון עובר refunded; סריקה אחריו נכשלת עם scan_result=refunded |
| R3 | ניסיון refund של קופון שכבר נפדה (used) | נדחה. אין refund אחרי מימוש |
| R4 | הזמנה ששולמה חלקית בארנק | חלק הארנק חוזר לארנק (תנועת `refund_credit` מ-adjustments), חלק הכרטיס לכרטיס; לעולם לא כל הסכום לכרטיס |
| R5 | refund כפול על אותו payment | השני נחסם (idempotency + סטטוס refunded) |
| R6 | refund בסכום גדול מהמקור | נדחה בוולידציה |
| R7 | קריאת `refundPayment` על ידי לא-admin | נדחית ב-`requireAdminSession` |
| R8 | refund אחרי שהפריט כבר נכנס ל-payout statement | לא משנה statement סגור; נרשם לטיפול כשורת adjustment בתקופה הבאה (O3; עד למימוש האוטומטי, הבדיקה מוודאת לפחות שה-statement ההיסטורי לא השתנה) |

---

## 4. ויזואלי + RTL עברית

### 4.1 שתי מסלולים

1. **התאמת 1:1 ידנית (קיים)**: `scripts/compare.mjs` מצלם את `refs/ke_live_singlefile.html` מול localhost ב-1440px, `scripts/diff-bands.mjs` נותן אחוז חוסר-התאמה בפסים של 100px עם סבילות 24 לערוץ. נשאר ככלי עבודה בפיתוח עיצוב, לא רץ ב-CI. (ניקוי נלווה: `scripts/_diff-bands.mjs` ו-`scripts/_tmp-hero.mjs` הלא-committed ימוזגו או יימחקו.)
2. **רגרסיה אוטומטית (חדש)**: פרויקט Playwright ייעודי `visual` עם `toHaveScreenshot`, baseline ב-git, threshold ברוח ה-TOL הקיים (`maxDiffPixelRatio` נמוך + סבילות אנטי-aliasing). דטרמיניזם: קפיאת אנימציות, המתנה לטעינת פונט Heebo, נתוני seed קבועים, מסכות על אזורים דינמיים (מונה עגלה, תמונות מ-storage אם משתנות).

### 4.2 מטריצת breakpoints ודפים

| breakpoint | רוחב | ייצוג |
|---|---|---|
| mobile | 390 | iPhone modern, הקהל העיקרי בישראל |
| mobile-small | 360 | Android נפוץ, קצה צר |
| tablet | 768 | גבול פריסת הביניים |
| desktop | 1440 | ה-baseline הקיים של compare.mjs |

דפים בכל breakpoint: דף בית, קטגוריה, דף מוצר (כשייבנה), עגלה, checkout, אזור אישי (הזמנות + ארנק + קופון עם QR), דף סריקה של ספק (מסך ירוק/אדום), ודף אדמין מייצג אחד (טבלת מוצרים). סה"כ בערך 36 צילומים; רצים כ-job נפרד, מזהיר בלבד בהתחלה (D8).

### 4.3 בדיקות RTL פונקציונליות (לא צילום)

רצות כחלק מה-E2E הרגיל:

- `html[dir=rtl][lang=he]` על כל דף (קיים היום לדף הבית, מורחב לכולם).
- מחירים: `formatPrice` מציג ₪ בפורמט he-IL עקבי; אין מספר "הפוך" בתוך משפט עברי (בדיקת bidi על שורת סכום בעגלה ובאישור הזמנה).
- אין overflow אופקי ב-390px (scrollWidth שווה clientWidth על body) בדפי הליבה.
- מיקוד מקלדת וניווט בטפסים (checkout) עובדים בכיוון RTL.
- טקסט תבניות התראה (כשיגיע 031): כללי ה-RTL המחייבים מהמסמך נבדקים על תבנית דוגמה.

---

## 5. בדיקות DB

### 5.1 harness של idempotency למיגרציות

Job בשם `migrations` שרץ על כל PR שנוגע ב-`supabase/migrations/**` (וגם בריצה הלילית):

1. `supabase start` על stack ריק (Docker, image ננעל לגרסת Postgres 17).
2. **מעבר ראשון**: החלת כל הקבצים בסדר לקסיקוגרפי (001..031, כולל 0075 במקומו) דרך psql מקומי, קובץ קובץ, עצירה בשגיאה הראשונה.
3. **מעבר שני**: אותם קבצים, אותו סדר, שוב. כל כשל = המיגרציה לא idempotent = הבדיקה נכשלת (D6, אינברינט 13).
4. אימותים אחרי שני המעברים: ספירת policies ב-`pg_policies` יציבה בין המעברים (מעבר שני לא הכפיל ולא מחק), אין טבלה עם RLS כבוי בסכמת public (מלבד רשימת חריגים מפורשת), כל ה-enums מכילים את הערכים הצפויים, וה-seed accounts של הארנק קיימים פעם אחת בדיוק.
5. הפקת טיפוסים והשוואה ל-`src/types/database.ts` (סעיף 2.2, משפחה 3).

הערות תיחום: ה-harness בודק את הקבצים כפי שהם, מול stack נקי. הוא לא פותר את ה-drift מול dev (הטבלה `coupons` החיה); הוא כן מוודא שה-bootstrap של פרויקט הפרודקשן העתידי (P0 ב-PRODUCTION-OPS) יעבור חלק. סדר תלויות (027 דורש 016/019/025, 031 דורש 029 וכו') נאכף ממילא על ידי ה-exception guards שכבר קיימים בקבצים: ה-harness פשוט מפעיל אותם.

### 5.2 עיצוב ה-RLS test runner ובדיקות הפונקציות

**Runner**: קובץ vitest אחד גנרי (סביבת node) + קובץ מטריצה הצהרתי (הטבלה מסעיף 2.2 כ-data). לכל persona נוצר משתמש אמיתי דרך admin API של ה-stack המקומי, מקבל role/חברות דרך service client, ונשמר לו access token. ה-runner מריץ כל תא במטריצה עם ה-client של ה-persona ומאמת מותר/נדחה, כולל אפס-שורות ואי-שינוי. תוצאה: הוספת policy בלי עדכון המטריצה מפילה את הבדיקה לשני הכיוונים (גם הרחבה, גם צמצום).

**בדיקות פונקציות SECURITY DEFINER** (integration, מול ה-stack המקומי):

| פונקציה | מקרים חובה |
|---|---|
| `fn_wallet_transfer` | סכום שלילי/אפס נדחה; debit=credit נדחה; replay של idempotency key מחזיר את אותו id בלי תנועה שנייה; חריגת יתרה של משתמש נכשלת על ה-CHECK ומבטלת את כל הטרנזקציה; חשבון פלטפורמה כן יכול להישלל (cashback_reserve); **מרוץ**: שתי העברות מקבילות של 60 מתוך יתרת 100, בדיוק אחת מצליחה; אחרי N העברות אקראיות, balance_ils שווה לסכימה הנגזרת מה-ledger (בדיקת ה-cache, אותה שאילתה שתשמש את ה-integrity job הלילי) |
| `redeem_coupon` | success מלא עם snapshot נכון (400/40/360); **מרוץ**: שתי סריקות מקבילות, בדיוק אחת success והשנייה already_used; wrong_supplier מוחזר כ-not_found גנרי אבל נרשם מדויק ב-scan_events; expired/refunded מוחזרים בכנות; לא-חבר מקבל unauthorized; rate limit 30/60 נאכף (הסריקה ה-31 בדקה נדחית) וכל ניסיון כולל כושל רושם שורת scan_event; קוד לא קיים לא חושף כלום |
| `fn_merge_guest_cart` | מיזוג כמויות לפי product+variant עם תקרה 99; claim אטומי של עגלת אורח כשאין עגלת משתמש; **מרוץ**: שתי קריאות מקבילות (double callback) לא מכפילות כמויות ולא משאירות שתי עגלות; ה-UNIQUE החלקי על carts(profile_id) שורד |
| `generate_payout_statement` | לא-admin נדחה; פריט delivered בתקופה נכנס עם הסכומים המוקפאים בלבד (אין חישוב מחדש); פריט שכבר בשורת statement לא-מבוטל לא נכנס שוב (הגנת settlement כפול); ביטול statement מחזיר פריטים למאגר; שורות קופון אינפורמטיביות עם payout 0; `mark_payout_statement_paid` נחסם עם dispute פתוח ונכשל בהיעדר חשבון בנק פעיל; bank_snapshot מוקפא ולא משתנה אחרי החלפת חשבון |
| `approve_supplier_application` | לא-admin נדחה; אישור יוצר supplier + חברות owner; העלאת profiles.role נרשמת ב-audit |
| `update_shipping_status` | רק חבר ספק על פריט שלו; מעברי סטטוס לא חוקיים נדחים |
| `fn_set_default_payment_token` | רק על token בבעלות הקורא; is_default יחיד |
| `fn_request/cancel/execute_account_deletion` | rate limit 3/24h; ביטול בתוך חלון החסד; execute רק service_role; אחרי execute: PII מנוקה, רשומות כספיות נשארות |
| `check_user_rate_limit` | מעל הסף מוחזר false; חלון מתגלגל; `cleanup_user_rate_limits` מוחק ישנים; **החוזה fail-closed** בצד האפליקציה (D10): כשה-RPC נופל, checkout וסריקה נעצרים |
| `fn_claim_notification_batch` (כשתוחל 031) | שני workers במקביל לא מקבלים את אותה שורה (SKIP LOCKED); reclaim אחרי 10 דקות |

### 5.3 seed data ו-fixtures

- קובץ `supabase/seed.sql` ייעודי לבדיקות (נטען רק ב-stack המקומי; `db.seed` כבר מופעל ב-config.toml). ה-seed לא נכנס לעולם למיגרציות: מיגרציות הן סכמה, seed הוא נתוני בדיקה. (ה-seeds ההיסטוריים 017/018/022/023/024 נשארים כמות שהם, אבל נתוני בדיקה חדשים לא מתווספים אליהם.)
- תוכן ה-seed: 9 ה-personas מסעיף 2.2; שני ספקים (X עם owner+manager+scanner, Y עם owner) עם `commission_percent` שונים (10 ו-15); קטלוג מינימלי: מוצר פיזי בלי override, מוצר פיזי עם `platform_percent` override (12.5), דיל קופון, מוצר אזל מלאי, מוצר draft; יתרות ארנק התחלתיות; הזמנה היסטורית אחת paid עם קופון issued ופריט delivered (בסיס ל-payout ולסריקה).
- **builders** בצד הבדיקות (`tests/helpers/factories.ts`): יצירת הזמנה/תשלום/קופון במצב נתון דרך service client, כדי שכל בדיקה בונה את המצב שלה ולא נשענת על שאריות מבדיקה אחרת. כל בדיקת integration רצה בתוך ניקוי לפני (truncate לטבלאות התנועות, לא לסכמה).
- מזהים קבועים (uuid קשיחים) ל-personas ולמוצרי ה-seed, כדי שצילומי visual ו-E2E יהיו דטרמיניסטיים.

---

## 6. צינור CI/CD (GitHub Actions)

### 6.1 שלבים

Workflow יחיד `ci.yml` על push לענפי עבודה ועל pull_request לענף היעד. שלבים כ-jobs עם תלויות:

| # | Job | תוכן | תלוי ב | יעד זמן | חוסם merge |
|---|---|---|---|---|---|
| 1 | `static` | `pnpm lint` (biome CI mode), `pnpm type-check` | - | פחות מדקה | כן |
| 2 | `unit` | `pnpm test` (פרויקט unit בלבד) | - | פחות מדקה | כן |
| 3 | `build` | `next build` + אימות ש-`SUPABASE_SERVICE_ROLE_KEY` לא הודלף ל-client bundle (grep על output) | 1 | 2-3 דק' | כן |
| 4 | `integration` | supabase start, החלת מיגרציות מאפס, RLS matrix, בדיקות פונקציות DB, השוואת טיפוסים | 1 | 4-6 דק' | כן |
| 5 | `migrations` | ה-harness מסעיף 5.1 (apply פעמיים + אימותים) | - | 3-4 דק' | כן, כשה-PR נוגע ב-`supabase/migrations/**` (path filter); אחרת לא רץ |
| 6 | `e2e-smoke` | Playwright: המסלול המאושר + נדחה + double submit, מול build + stack מקומי + Cardcom fake | 3,4 | 4-5 דק' | כן |
| 7 | `e2e-full` | כל שאר תרחישי ה-E2E + פורטל ספקים | 6 | 10+ דק' | לא (מזהיר; חוסם רק בריצה לילית לפני release) |
| 8 | `visual` | פרויקט visual, 4 breakpoints | 3 | 5 דק' | לא בהתחלה; מקודם לחוסם אחרי ייצוב baseline (D8) |
| 9 | `nightly` (schedule) | e2e-full + visual + בדיקות חוזה מול Cardcom sandbox אמיתי + migrations harness מלא | - | - | פותח issue אוטומטי בכשל |

הפרדת vitest לשני פרויקטים (`unit`: jsdom/node, מהיר, בלי DB; `integration`: node, דורש stack) נעשית ב-`vitest.config.ts` דרך projects, כך ש-`pnpm test` המקומי ממשיך לעבוד.

### 6.2 caching למהירות

| cache | מפתח | חוסך |
|---|---|---|
| pnpm store (`actions/setup-node` + cache pnpm) | `pnpm-lock.yaml` | 1-2 דק' לכל job |
| Playwright browsers | גרסת `@playwright/test` | ~1 דק' בכל job E2E/visual |
| `.next/cache` | lockfile + קבצי מקור | חצי מזמן ה-build בריצות חוזרות |
| Docker images של Supabase (`supabase start` מושך ~6 images) | גרסת CLI | 2-3 דק' ב-integration/migrations |

יעד כולל ל-PR רגיל (בלי מיגרציות): ירוק בתוך 8-10 דקות. עיקרון: jobs 1, 2, 5 רצים במקביל מיידית; הכבדים מחכים רק למה שהם באמת צריכים.

### 6.3 מדיניות חסימה

- **חוסם merge**: static, unit, build, integration, migrations (כשרלוונטי), e2e-smoke. נאכף ב-branch protection על ענף היעד (D12) עם required checks.
- **מזהיר בלבד**: e2e-full, visual, Lighthouse/Speed Insights (P2 של PRODUCTION-OPS).
- **אסור ב-CI בשום שלב**: `supabase db push` לכל פרויקט מרוחק, החלת מיגרציות על dev/prod, שימוש ב-service key של פרויקט מרוחק. ה-CI נוגע רק ב-stack המקומי שלו. החלה על מרוחק נשארת ידנית דרך MCP `apply_migration` + תיעוד ב-STATE.md (הנוהל הקיים).

### 6.4 שילוב Vercel Preview

- כל PR מקבל Vercel Preview אוטומטי מול פרויקט ה-dev של Supabase (המדיניות מ-PRODUCTION-OPS 1.1: preview על נתוני dev, לא prod).
- ה-CI לא תלוי ב-preview (הכול רץ על stack מקומי), אבל אחרי שה-preview עולה רץ job קטן אופציונלי `preview-smoke`: דף בית 200, `html[dir=rtl]`, אין שגיאות קונסול קריטיות. מזהיר בלבד: סביבת ה-preview חולקת DB חי ולכן לא דטרמיניסטית.
- deploy לפרודקשן (כשיקום): merge לענף היעד בלבד, אחרי CI ירוק מלא. אין deploy ידני מהמחשב. משתני env מנוהלים בשלושת ה-scopes של Vercel (Production/Preview/Development) לפי PRODUCTION-OPS 1.2, וה-fake של Cardcom לעולם לא מוגדר בסביבת Production.

---

## 7. Definition of Done לכל שלב

תנאי סף משותף לכל השלבים: CI ירוק מלא, אפס אזהרות biome חדשות, STATE.md מעודכן, והאינברינטים מסעיף 2.0 הרלוונטיים לשלב מכוסים בבדיקות שרצות ב-CI.

### 7.1 עגלה (Phase 2, אחרי החלת 026)

- [ ] מודול `src/lib/money/` קיים עם כל טבלת המקרים M1-M22 ירוקה (הפיצול נחוץ כבר לתצוגת snapshot בעגלה).
- [ ] בדיקות integration ל-`fn_merge_guest_cart` כולל מקרה המרוץ (double callback) ותקרת 99.
- [ ] RLS matrix מעודכנת ל-`cart_items` וכל התאים ירוקים.
- [ ] E2E: אורח בונה עגלה, מתחבר, העגלה ממוזגת ושורדת; עגלה ריקה לא מגיעה ל-checkout.
- [ ] harness המיגרציות עבר על 026 (פעמיים) כולל אימות שה-rename של `wallet_transactions_legacy` בטוח לריצה חוזרת.
- [ ] אין מחיר בשום שורת cart_items (אינברינט 10 ברמת הסכמה: הבדיקה מוודאת שאין עמודת מחיר ושה-action דוחה קלט מחיר).

### 7.2 checkout ותשלומים (Phase 3)

- [ ] Cardcom adapter + fake + harness ה-webhook קיימים; כל W1-W10 ירוקים.
- [ ] כל R1-R8 (refund) ירוקים.
- [ ] `beginCheckout` נבדק: snapshot נכון לכל שורה (כולל override 12.5 מה-seed), expires_at, אפס שדות כסף מהלקוח (payload עם מחיר נדחה).
- [ ] מעבר paid נבדק כטרנזקציה שלמה: payment succeeded + חיוב ארנק + הנפקת קופונים + cashback + מלאי + audit, והכול מתגלגל אחורה יחד בכשל אמצעי.
- [ ] fail-closed ל-rate-limit פעיל ונבדק (D10): הבאג של `rate-limit.ts` סגור.
- [ ] E2E המסלול המאושר המלא ירוק כולל מסלולי הכשל החוסמים.
- [ ] בדיקת חוזה אחת ירוקה מול Cardcom sandbox אמיתי (ידנית או לילית) לפני פתיחת השלב למשתמשים.
- [ ] crons (ביטול pending, reconcile) נבדקים ב-integration עם הזזת זמן מדומה.

### 7.3 ארנק (עם 026, נאכף לפני שכסף אמיתי נכנס לארנק)

- [ ] כל בדיקות `fn_wallet_transfer` מסעיף 5.2 ירוקות, כולל שני מקרי המרוץ ובדיקת ה-cache מול הסכימה הנגזרת.
- [ ] בדיקת ledger append-only: אין policy כתיבה לאף אחד כולל admin (RLS matrix), ו-UPDATE ישיר ב-service נחסם נוהלית (בדיקה שמתעדת שהתיקון היחיד הוא תנועה מפצה).
- [ ] הקצאת ארנק ב-checkout: M19-M21 ברמת unit + התרחיש המלא ב-integration (כולל ארנק מכסה הכול: אפס קריאות ל-fake).
- [ ] refund לארנק (R4) ירוק.
- [ ] שאילתת ה-integrity הלילית (balance מול ledger) קיימת ורצה גם כבדיקה.

### 7.4 ספקים (Phase 5a, אחרי החלת 027 ויורשותיה)

- [ ] RLS matrix מורחבת לכל טבלאות הספקים, כולל שלושת תתי-התפקידים (owner/manager/scanner) ו-`sup_other` כ-persona עוינת.
- [ ] כל בדיקות `redeem_coupon` ירוקות כולל המרוץ, האנטי-enumeration וה-rate limit.
- [ ] כל בדיקות ה-payout ירוקות (settlement כפול, dispute חוסם, bank_snapshot מוקפא, ביטול משחרר פריטים).
- [ ] אימות חתימת QR: unit לפורמט `KE1.` (תקף/פג/חתימה שבורה/מפתח לא מוכר לפי qid) + חוזה שהחד-פעמיות לא נשענת על ה-QR (אינברינט 8 נאכף רק ב-DB).
- [ ] E2E פורטל ספקים (סעיף 2.3) ירוק.
- [ ] הבדיקה המתעדת של ה-policy השבורה מ-014 הוחלפה בבדיקה החיובית על ה-policy החדשה.

---

## 8. חוב בדיקות לקוד הקיים (מתועדף)

מה שכבר כתוב היום וחשוף, מהדחוף לפחות דחוף:

| # | פריט | סיכון | פעולה |
|---|---|---|---|
| T1 | **אין CI בכלל** | כל האמור במסמך לא נאכף; type-check נשבר בשקט | הקמת `ci.yml` עם jobs 1-3 (static/unit/build) עוד לפני שנכתב קוד כסף. יום עבודה |
| T2 | **`rate-limit.ts` fails open + `checkUserRateLimit` בלי קוראים** (באג מתועד) | ברגע שיהיה checkout, כשל RPC שקט מבטל את כל ההגנה | בדיקת unit שמקבעת fail-closed לפעולות כסף; התיקון עצמו ב-Phase 3 (D10) |
| T3 | **`mergeGuestCart` הקיים ב-`src/server/actions/cart.ts` הוא read-merge-write בלי נעילה** (ממצא מתועד) | איבוד/הכפלת פריטים בהתחברות | בדיקת integration שמדגימה את המרוץ על הקוד הקיים (תיכשל, מתועדת כ-known failure), מוחלפת בירוק כש-029 מחליפה ל-RPC |
| T4 | **policy שבורה ב-014** ("products: vendor read own" משווה מול vendors.id) | ספק לא רואה מוצרים; גרוע מזה, תיקון נאיבי עלול לפתוח יותר מדי | בדיקה מתעדת (אפס שורות היום) שתתהפך לבדיקה חיובית עם 027 |
| T5 | **`payment_tokens` תחת ה-policy הישנה מ-001** (owner all, כולל קריאת cardcom_token) | ברגע שיישמרו tokens אמיתיים, דליפה | ה-policy החדשה ב-029; בדיקת ה-42501 נכנסת ל-RLS matrix מיום החלתה. עד אז: אסור לכתוב token אמיתי לטבלה |
| T6 | **דפי אדמין בלי בדיקות authorization** (`requireAdminSession`, actions תחת `src/server/actions/admin/`) | פעולת אדמין חשופה תעבור בשקט | בדיקות integration קצרות: כל admin action נדחה ל-customer. חצי יום |
| T7 | **`formatPrice` כמעט לא נבדק** (בדיקה אחת שבודקת שיש "99") | שבירת תצוגת מחירים ב-refactor | 6-8 מקרים: אגורות, אפס, סכומים גדולים, he-IL |
| T8 | **validations קיימות בלי בדיקות לצד ה-actions** (auth.ts, cart.ts משתמשים ב-supabase ישירות) | שינוי חתימה שקט | בדיקות unit ל-zod של cart (כמות 1-99, uuid) כשנכתב מחדש ב-Phase 2 |
| T9 | **E2E מפנה ל-`/checkout` שלא קיים** (`e2e/auth.spec.ts` בודק redirect לדף שאין לו route) | הבדיקה עוברת על 404 עתידי | לתקן את הבדיקה להצהיר על הצפוי היום, ולעדכן כשה-route ייבנה |
| T10 | **סקריפטים ויזואליים לא ממוסדים** (`_diff-bands.mjs`, `_tmp-hero.mjs` לא ב-git, כפילות עם `diff-bands.mjs`) | אובדן כלי העבודה, בלבול | מיזוג/מחיקה + commit; הקמת פרויקט visual של Playwright לפי סעיף 4 |
| T11 | **אין `supabase/seed.sql` ואין factories** | כל בדיקת integration עתידית תמציא נתונים משלה | הקמה יחד עם ה-runner של ה-RLS matrix, לפני Phase 2 |
| T12 | **drift מול dev לא ממופה** (`coupons` חיה בניגוד לקבצים, היסטוריה 2 מול 31) | הפתעות בכל החלת מיגרציה | ריצת השוואה חד-פעמית (schema diff בין dev לבין stack נקי אחרי 001-025) ותיעוד הפערים ב-STATE.md; לא חוסם את ה-harness שרץ על stack נקי |

---

## 9. שאלות פתוחות

1. פרטי sandbox של Cardcom (terminal בדיקות, credentials): צריך פתיחה מול Cardcom לפני Phase 3. עד אז ה-fake נבנה לפי התיעוד הציבורי של Low Profile API.
2. מתי מקדמים את visual מ"מזהיר" ל"חוסם": מוצע אחרי שבועיים של baseline יציב בלי false positives.
3. GitHub Actions minutes: הצינור המלא צורך בערך 25-30 דקות מחשב לכל PR. בחשבון free (2,000 דקות לחודש לריפו פרטי) זה בערך 60-70 PRs בחודש. אם יש חריגה: לצמצם את e2e-full ללילי בלבד.
4. שם ענף היעד: ההגנות מוגדרות היום על `cursor/add-supabase-3c830`. כשעוברים ל-main אמיתי צריך להעביר את ה-branch protection.
5. ריצת ה-integrity הלילית של הארנק בפרודקשן (השוואת cache מול ledger): איפה רצה, Vercel cron או pg_cron. תלוי בהחלטת ה-Pro של PRODUCTION-OPS.
