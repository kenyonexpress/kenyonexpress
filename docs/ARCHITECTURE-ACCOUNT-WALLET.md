# ארכיטקטורת אזור אישי + ארנק דיגיטלי

סטטוס: DESIGN + IMPLEMENTATION. ענף `feat/account-wallet`, worktree `ke-account`.
תאריך: 2026-07-24. מיגרציה נלווית: `supabase/migrations/055_account_wallet.sql`.

מסמך זה הוא מקור האמת לדומיין החשבון והארנק. הוא לא נוגע בדומיין השוברים
(`ke-voucher`) ולא בדומיין הספקים (`ke-supplier`); כל נקודת מגע ביניהם מסומנת
במפורש בסעיף 8.

---

## 0. כללי היסוד

1. **הארנק פנימי בלבד.** היתרה היא קרדיט לשימוש באתר. אין משיכה, אין העברה
   למשתמש אחר, ואין המרה למזומן. אין endpoint כזה, וזו החלטת מוצר ולא פער מימוש.
2. **אין `tenant_id`.** כל בידוד הנתונים נשען על `auth.uid()` דרך RLS.
3. **עגלת אורח פתוחה.** אפשר לגלוש, להוסיף לעגלה ולהגיע ל-checkout בלי חשבון.
   ההתחברות (Google OAuth) נדרשת רק בלחיצה על תשלום, ואז העגלה ממוזגת.
4. **הפנקס append-only.** `wallet_entries` נכתב פעם אחת ולא מתעדכן ולא נמחק.
   תיקון נעשה בשורת נגד, לא בעריכה.
5. **כל תנועת כסף עוברת דרך `fn_wallet_transfer`.** אין UPDATE ידני ל-`balance_ils`
   בשום מקום בקוד.

---

## 1. הסכימה בפועל, ומה הוחלט לגביה

בבסיס הנתונים המרוחק קיימות **ארבע** צורות ארנק שנוצרו לאורך הפרויקט. זה מצב
הדריפט שהמסמך הזה סוגר:

| טבלה | מקור | מצב במרוחק | הכרעה |
|---|---|---|---|
| `wallets` | 001 | לא קיימת בפועל | מתה. לא נוצרת מחדש. |
| `wallet_balances` | 006 | קיימת, 0 שורות | **DEPRECATED**, מסומנת בהערה. לא נקראת ולא נכתבת. |
| `wallet_transactions` | 006 / 026 | קיימת, 0 שורות | **DEPRECATED**, מסומנת בהערה. |
| `wallet_accounts` + `wallet_entries` | **046 (הוחלה)** | קיימות עם נתונים אמיתיים | **הפנקס הקנוני.** |

**ההכרעה: לא נוצרת צורת ארנק חמישית.** ההוראה המקורית ביקשה
`wallets` + `wallet_transactions`, אבל יצירת זוג טבלאות נוסף מעל שלוש נטושות
הייתה מגדילה את הדריפט במקום לסגור אותו. `wallet_accounts` + `wallet_entries`
הוא כבר בדיוק המבנה שהתבקש: חשבון פר משתמש ופנקס append-only. מיגרציה 052
מרחיבה אותו במקום להחליף אותו.

### 1.1 `wallet_accounts` (קיימת, 046)

```sql
id          uuid PK
user_id     uuid UNIQUE NULL -> profiles(id) ON DELETE CASCADE
code        text UNIQUE NULL          -- חשבונות פלטפורמה בלבד
balance_ils numeric(12,2) NOT NULL DEFAULT 0
CHECK (user_id IS NOT NULL OR code IS NOT NULL)
```

חשבון משתמש: `user_id` מלא, `code` ריק. חשבון פלטפורמה: הפוך. שלושת חשבונות
הפלטפורמה הקיימים: `platform:revenue`, `platform:cashback_reserve`,
`platform:adjustments`.

`balance_ils` הוא **cache מתוחזק**, לא מקור האמת. מקור האמת הוא סכום השורות
ב-`wallet_entries`. `v_wallet_balance_drift` (סעיף 2.3) מאתר פער.

### 1.2 `wallet_entries` (קיימת, 046)

```sql
id              uuid PK
debit_account   uuid NOT NULL -> wallet_accounts
credit_account  uuid NOT NULL -> wallet_accounts
amount_ils      numeric(12,2) NOT NULL CHECK (> 0)
reason          text NOT NULL
idempotency_key text NOT NULL UNIQUE
order_id        uuid NULL -> orders
created_at      timestamptz NOT NULL DEFAULT now()
```

רישום כפול: כל שורה מזיזה סכום חיובי מחשבון אחד לשני. אין סכומים שליליים ואין
שורה חד-צדדית. `idempotency_key` הוא ההגנה מפני חיוב כפול ברמת ה-DB.

---

## 2. מה מיגרציה 052 מוסיפה

### 2.1 `cashback_rules` (חדשה)

הקאשבק היה עד היום קבוע בקוד. הטבלה הופכת אותו לנתון.

```sql
cashback_rules (
  id                uuid PK,
  name_he           text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  percent           numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  every_nth_order   integer NULL CHECK (every_nth_order IS NULL OR every_nth_order >= 1),
  min_order_ils     numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_order_ils >= 0),
  max_cashback_ils  numeric(12,2) NULL CHECK (max_cashback_ils IS NULL OR max_cashback_ils > 0),
  category_id       uuid NULL -> categories ON DELETE CASCADE,
  starts_at         timestamptz NULL,
  ends_at           timestamptz NULL,
  priority          integer NOT NULL DEFAULT 100,
  created_at, updated_at,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
)
```

- `every_nth_order = 5` פירושו: הכלל חל רק כשההזמנה המשולמת היא כל חמישית של
  אותו משתמש. `NULL` פירושו כל הזמנה.
- `category_id` מצמצם את הכלל למוצרים מקטגוריה אחת. `NULL` = כל הקטלוג.
- `priority` נמוך יותר גובר. הכלל הראשון שמתאים הוא הכלל שחל; אין צבירה של
  כמה כללים על אותה הזמנה, כדי שהחישוב יישאר ניתן להסבר ללקוח.
- RLS: קריאה ציבורית לכללים פעילים בלבד (לתצוגת "תקבלו X בחזרה"), כתיבה staff.

### 2.2 `fn_wallet_cashback_percent(p_user_id, p_order_total_ils, p_category_ids)`

פונקציית `STABLE SECURITY DEFINER` שמחזירה את האחוז החל, או 0. היא סופרת
הזמנות משולמות קודמות של המשתמש כדי להעריך `every_nth_order`. הפונקציה נקראת
**בתוך טרנזקציית ה-webhook**, אחרי שהתשלום אומת, ולא בצד הלקוח.

### 2.3 תצוגות

| view | תפקיד |
|---|---|
| `v_wallet_ledger` | הפנקס מנקודת מבט המשתמש: שורה אחת לתנועה עם `signed_amount_ils` חיובי לזיכוי ושלילי לחיוב, `direction`, `reason`, `order_id`. מסונן ל-`auth.uid()`. |
| `v_wallet_balance_drift` | פער בין `wallet_accounts.balance_ils` לסכום הפנקס. אמור להיות ריק תמיד. כלי אדמין. |

`v_wallet_ledger` מוגדרת `security_invoker = true` כדי שה-RLS של הטבלאות שמתחת
יחול על הקורא ולא יעקוף אותו.

### 2.4 מדיניות RLS שהייתה חסרה

| טבלה | מה חסר היה | מה נוסף |
|---|---|---|
| `wallet_entries` | רק אדמין יכול לקרוא. משתמש לא ראה את הפנקס של עצמו כלל. | `wallet_entries_owner_read`: קריאה כששורה נוגעת בחשבון של הקורא. |
| `payment_tokens` | קריאה בלבד. אי אפשר היה למחוק כרטיס שמור. | `payment_tokens_owner_delete` + `payment_tokens_owner_update` (רק `is_default`). |

**אין** מדיניות INSERT/UPDATE/DELETE ל-`wallet_entries` ול-`wallet_accounts`
לאף תפקיד. כל הכתיבה עוברת ב-service role דרך `fn_wallet_transfer`. זו הסיבה
שהפנקס באמת append-only ולא רק בהסכמה.

---

## 3. הגנת double-spend

שלוש שכבות, מהחיצונית לפנימית:

1. **ולידציה ב-`beginCheckout`**: הסכום המבוקש חייב להיות `<= balance_ils`
   ו-`<= total`. זו בדיקה מייעצת בלבד; היא לא מחייבת כלום ולא נועלת כלום.
2. **חיוב בפועל רק ב-webhook**, אחרי אימות התשלום מול Cardcom, בתוך אותה
   טרנזקציה שמסמנת את ההזמנה כמשולמת. הכסף לא יורד מהארנק לפני שהחיוב באשראי
   אושר.
3. **`fn_wallet_transfer` ברמת ה-DB**:
   - `SELECT ... FOR UPDATE` על שני החשבונות **בסדר id דטרמיניסטי**, כך ששתי
     טרנזקציות מקבילות לא יכולות להיכנס ל-deadlock.
   - חשבון משתמש לא יכול לרדת מתחת לאפס. חשבון פלטפורמה כן (הוא התחייבות).
   - `idempotency_key UNIQUE`. מפתח החיוב הוא `order:<order_id>:wallet`, כך
     ששני webhooks על אותה הזמנה מייצרים שורה אחת בדיוק. השני מקבל את ה-id
     של הראשון וממשיך כאילו הצליח.

התרחיש שהשכבות האלה חוסמות: לקוח עם 50 ש"ח פותח שני טאבים ומתחיל שני checkouts
של 50 ש"ח כל אחד. שניהם עוברים את שלב 1. שניהם מגיעים ל-webhook. הראשון נועל
את החשבון, מוריד 50, מגיע ל-0. השני ממתין על הנעילה, מתעורר, ורואה יתרה 0
ונכשל על החוקה של האי-שליליות. ההזמנה השנייה נשארת עם חוב לגבייה באשראי ולא
עם ארנק שירד פעמיים.

---

## 4. מסלול הכסף בארנק

הקודים למטה הם מה ש-`finalize.ts` באמת כותב, ואומתו מול הפנקס החי. כל שינוי
בהם מחייב עדכון של `WALLET_REASON_LABELS` ב-`src/server/queries/account.ts`,
אחרת עמוד הארנק יציג את הקוד הגולמי במקום תווית בעברית.

| אירוע | חיוב | זיכוי | `reason` | `idempotency_key` | ממומש |
|---|---|---|---|---|---|
| קאשבק על הזמנה | `platform:cashback_reserve` | ארנק המשתמש | `order_cashback` | `order:<id>:cashback` | כן |
| שימוש בארנק בתשלום | ארנק המשתמש | `platform:revenue` | `order_spend` | `order:<id>:spend` | כן |
| החזר על ביטול הזמנה | `platform:revenue` | ארנק המשתמש | `order_refund` | `order:<id>:refund` | לא, מתוכנן |
| זיכוי ידני של אדמין | `platform:adjustments` | ארנק המשתמש | `admin_credit` | `adj:<uuid>` | לא, מתוכנן |

פקיעת קופון בלי מימוש מזכה גם היא את הארנק, אבל השורה הזאת נכתבת בדומיין
השוברים (`ke-voucher`) ולא כאן. סעיף 8.

---

## 5. מסכי `/account`

קבוצת ראוטים `src/app/(account)/account/`, כולה מאחורי בדיקת session בשרת.
משתמש לא מחובר מנותב ל-`/login?next=/account/...`.

| מסלול | תוכן |
|---|---|
| `/account` | סקירה: יתרת ארנק, הזמנה אחרונה, קופונים פעילים, קיצורים |
| `/account/details` | שם מלא, טלפון, אימייל (קריאה בלבד, מגיע מ-OAuth) |
| `/account/orders` | רשימת הזמנות עם סטטוס וסכום |
| `/account/orders/[id]` | פירוט שורות, כתובת, תשלום |
| `/account/coupons` | קופונים שנרכשו: קוד, QR, תוקף, סטטוס |
| `/account/wallet` | יתרה + פנקס תנועות מתוך `v_wallet_ledger` |
| `/account/addresses` | CRUD כתובות, סימון ברירת מחדל |
| `/account/tokens` | כרטיסים שמורים: 4 ספרות אחרונות, מותג, תוקף, מחיקה |

עיצוב: Electro home-v7, Heebo, RTL מלא, container 1320px, צהוב `#fed700`.
כל המסכים server components; אינטראקציה (מחיקת כתובת, קביעת ברירת מחדל, מחיקת
טוקן) דרך server actions.

---

## 6. עגלת אורח והתחברות בשלב התשלום

1. אורח מוסיף לעגלה. העגלה נשמרת ב-`carts` לפי `session_id`.
2. אורח נכנס ל-`/checkout` ורואה סיכום מלא. אין חסימה.
3. לחיצה על תשלום בלי session מפנה ל-Google OAuth עם `next` חתום.
4. אחרי חזרה: `mergeGuestCart` ממזג את עגלת ה-session לעגלת המשתמש, ורק אז
   `beginCheckout` רץ.
5. שדה הארנק ב-checkout מוצג רק למשתמש מחובר עם יתרה חיובית.

---

## 7. בדיקות

| שכבה | מה נבדק |
|---|---|
| unit | חישוב הקאשבק: בחירת כלל לפי priority, `every_nth_order`, `min_order_ils`, תקרת `max_cashback_ils`, חלון תאריכים |
| unit | חישוב שימוש בארנק: cap ליתרה, cap לסכום ההזמנה, אפס, סכום שלילי |
| sql | `fn_wallet_transfer`: אי-שליליות לחשבון משתמש, idempotency, סדר נעילה |
| RLS | משתמש א לא רואה את הפנקס, הכתובות, הטוקנים והקופונים של משתמש ב |

---

## 8. נקודות מגע עם worktrees אחרים

| דומיין | מגע | הכלל |
|---|---|---|
| `ke-voucher` | פקיעת קופון מזכה את הארנק | הדומיין הזה **חושף** את `fn_wallet_transfer` ואת חשבון `platform:adjustments`. השורה נכתבת שם. אין כאן קוד שוברים. |
| `ke-supplier` | payout לספק | לא נוגע בארנק המשתמש כלל. חשבונות נפרדים. אין כאן קוד ספקים. |
| `ke-payments` | webhook שמזכה קאשבק ומחייב ארנק | הקריאות ל-`fn_wallet_transfer` יושבות ב-`finalize.ts` שבבעלות payments. כאן מוגדרים הפונקציה, הכללים והמפתחות בלבד. |

קבצים שאסור לגעת בהם מהענף הזה: כל מה שתחת `src/server/domain/vouchers/`,
`src/app/api/supplier/`, ו-`supabase/migrations/051_payout_terms.sql`.
