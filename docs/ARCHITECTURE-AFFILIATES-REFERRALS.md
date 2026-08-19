# ארכיטקטורת שותפים והפניות

תאריך: 2026-08-19.
ענף: `phase5/homepage`.
היקף: docs בלבד. אין להחיל SQL מהמסמך הזה על הפרוד.

מקור אמת לקטלוג החי (audit 2026-07-23):
`docs/DB-SCHEMA.md`
סעיפי
`affiliates`
ו-
`referrals`.
מיגרציות: `010_referrals_affiliates_schema.sql` (טבלאות), `035_security_hardening.sql` (הסרת
`affiliates_user_update`),
`098_referral_program.sql` (הזמן-חבר, סיגנלים, תור אישור).
ארנק:
`docs/ARCHITECTURE-ACCOUNT-WALLET.md`
(פנימי, append-only, בלי משיכה).
כסף: אגורות שלמות דרך
`src/lib/money.ts`.
מודל קופון (C11א): מקדמת האתר נשארת בפלטפורמה. עמלת שותף יוצאת **מחלק הפלטפורמה**, לא מיתרת הקופה בעסק.

המסמך הקצר
`docs/ARCHITECTURE-REFERRALS.md`
נשאר תקציר. המסמך הזה הוא המפרט המלא. בסתירה: כאן גובר.

---

## 0. מה כבר קיים ב-DB (לא להמציא טבלה חמישית)

### 0.1 `public.affiliates` (010, נמדד ב-audit)

עמודות חיות: `id`, `user_id`, `affiliate_code`, `status` (`pending_review|approved|rejected|suspended`), `payout_method` (`bit|bank_transfer|paypal`), `payout_details` jsonb, `channel_description`, `channel_urls`, `approved_at`, `approved_by`, `total_clicks`, `total_conversions`, `total_earnings_ils` numeric, `deleted_at`, timestamps.

אינדקסים: ייחודי על `affiliate_code`, ייחודי על `user_id`.

RLS שנמדד ב-audit 23.07 עדיין כלל
`affiliates_user_update`
על **כל** העמודות (סטטוס, `approved_by`, `total_earnings_ils`). זה self-approval. **035 מחקה את הפוליסי.** אסור להחזיר UPDATE גולמי לשותף.

אין עמודת אחוז עמלה. אין טבלת קליקים. אין שורת המרה פר הזמנה. המונים `total_*` הם cache בלי מקור אמת.

### 0.2 `public.referrals` (010 + 098)

זוג מפנה/מופנה, קוד, סטטוס, הזמנה ראשונה. 098 מוסיף בונוסים באגורות, `flagged`, סיגנלים hashed, הגדרות תוכנית בשורה אחת לא-seeded, `fn_claim_referral` / `fn_complete_referral` / `fn_pay_referral`.

זיכוי דרך
`fn_wallet_transfer`
מ-
`platform:cashback_reserve`.
אין משיכה לבנק.

### 0.3 מה 010 תכנן לא נכון למודל הכסף הנוכחי

`payout_method` ו-
`payout_details`
מתארים כסף החוצה (Bit / העברה / PayPal). זה סותר את מדיניות הארנק. **לא מפעילים את העמודות האלה.** עמלה ובונוס = קרדיט ארנק באתר בלבד. העמודות נשארות לקריאה היסטורית, עם הערה, בלי UI של משיכה.

`total_earnings_ils` הוא numeric. כל כתיבה חדשה באגורות integer. לא מוסיפים float חדש.

---

## 1. שני מסלולים, בלי כפל תשלום

| מסלול | מי | איך מגיעים | מתי משלמים | כמה |
|---|---|---|---|---|
| שותף (affiliate) | חשבון מאושר ב-`affiliates.status=approved` | קישור ` /r/a/{code} ` + cookie 30 יום | הזמנה **paid** שמיוחסת לשותף | אחוז אדמין מתוך הסכום ששולם **באתר** (`coupon_price` בקופון) |
| הזמן-חבר (referral) | כל לקוח עם `profiles.referral_code` | קוד בהרשמה / `?ref=` של לקוח | הזמנה ראשונה paid מעל סף, בחלון, אחרי fraud | סכום קבוע באגורות לשני הצדדים, מ-`referral_program_settings` |

כלל ייחוס ל**הזמנה ראשונה** של משתמש:

1. אם יש שורת
   `referrals`
   פתוחה למופנה: מסלול הזמן-חבר בלבד. אין גם עמלת שותף על אותה הזמנה.
2. אחרת, אם cookie/שיוך שותף בתוקף: מסלול שותף.
3. אחרת: כלום.

החלטה שמרנית (כפל בונוס+עמלה על אותה קנייה ראשונה = פרצת farm). הזמנות הבאות של אותו לקוח יכולות לשלם לשותף אם ה-cookie עדיין חי וההזמן-חבר כבר `completed` או לא היה. הזמן-חבר משלם **פעם אחת** (אינדקס
`referrals_one_per_referred`).

---

## 2. קישורי שותף, UTM, cookie 30 יום

### 2.1 צורה

קוד שותף: 8 תווי Crockford כמו 098 (בלי I L O U), עם קידומת קבועה
`A`
כדי שלא יתנגש בקוד לקוח. דוגמה ציבורית:
`A7K3M9PQ`.

URL קנוני:

```
https://kenyonexpress.co.il/r/a/A7K3M9PQ
```

ראוט זה עושה 302 לדיל או לבית, אחרי הצבת cookie. גם query על כל עמוד:

```
?utm_source=affiliate&utm_medium=cpa&utm_campaign=A7K3M9PQ&aff=A7K3M9PQ
```

`utm_*` נשמרים באירוע אנליטיקה (כבר יש zod ב-
`src/lib/analytics/events.ts`).
הם **לא** מקור האמת לכסף. מקור האמת: שורת
`affiliate_clicks`
+ cookie חתום / קוד בטבלת שיוך.

### 2.2 Cookie

שם:
`ke_aff`.
HttpOnly, Secure, SameSite=Lax, Max-Age=2592000 (30 יום), Path=/, לא
`NEXT_PUBLIC`.

ערך: הקוד + זמן הנפקה. חתימה HMAC עם סוד שרת (אותו דפוס של שובר, סוד נפרד
`AFFILIATE_COOKIE_SECRET`).
בלי חתימה אפשר לזייף קוד של שותף אחר בדפדפן; הקוד עצמו ציבורי אבל זיוף "החלפה אחרי הקלקה" נחסם עם first-touch.

**First-touch:** אם cookie תקין כבר קיים, הבקשה החדשה **לא** דורסת. Last-click נדחה במודע (קל לגנוב המרה בבאנר מעל קופה).

החלון 30 יום נאכף גם בשרת מ-
`clicked_at`,
לא רק מ-Max-Age (משתמש יכול למחוק cookie; אז אין שיוך, וזה בסדר).

אורח: cookie לפני Google. ב-checkout, אחרי
`auth.uid()`,
שורת שיוך נכתבת ל-
`affiliate_attributions`
(user_id, affiliate_id, first_click_id, expires_at). זו הרשומה שנקראת ב-paid.

### 2.3 קליק

כל ביקור מאומת בקוד מאושר (`status=approved`) כותב
`affiliate_clicks`.
Rate limit לפי IP hash. בוטים לא מנפחים
`total_clicks`
ישירות על שורת השותף; ה-cache מתעדכן מטריגר אחרי INSERT.

---

## 3. עמלת שותף (אחוז אדמין)

אין ברירת מחדל במסד. בלי אחוז מפורש השותף לא
`approved`.

```text
commission_percent  numeric(5,2)  CHECK (commission_percent > 0 AND commission_percent <= 50)
```

תקרה 50% חוסמת טעות 100% על כל הקופון. לא 5 וקשיח. האדמין ממלא פר שותף ב-
`/admin/affiliates`.
שינוי אחוז צופה פני עתיד בלבד. ההמרה מצלמת את האחוז לשורת
`affiliate_commissions`.

בסיס הסכום ב-soft-launch (קופון):

```
base_agorot = coupon_price של השורה, באגורות, מה-snapshot של ההזמנה
commission_agorot = floor(base_agorot * commission_percent / 100)
```

רק
`floor`
שלם. אין float במסלול. יתרה בעסק לא נכנסת לבסיס.

פיזי (לא בשיגור): בסיס = חלק הפלטפורמה שצולם ל-
`order_items`
(לא הסכום לספק). בלי זה שותף אוכל payout ספק.

Refund / ביטול קופון לפני מימוש: clawback. שורת נגד בארנק עם
`idempotency_key = affiliate:{commission_id}:clawback`.
אחרי מימוש: אין clawback אוטומטי (ההטבה ניתנה). Chargeback: תור ידני.

---

## 4. זיכוי לארנק בלבד

1. אין endpoint משיכה, אין Bit, אין PayPal, אין העברה על עמלת שותף.
2. סיבת ledger חדשה:
   `affiliate_commission`
   (ליד
   `referral_bonus`).
3. מקור: `platform:cashback_reserve` או חשבון
   `platform:affiliate_reserve`
   אם רוצים הפרדה חשבונאית. בלי חשבון נפרד בהתחלה: אותו reserve, reason שונה.
4. `fn_wallet_transfer` בלבד. אסור UPDATE ל-
   `total_earnings_ils`
   מהקליינט. Cache מתעדכן באותה פונקציית SECURITY DEFINER שמזכה.
5. כסף חדש באגורות. `total_earnings_ils` לא נכתב יותר; עמודה חדשה
   `total_earnings_agorot`
   integer. הישנה נשארת 0 / deprecated עד cutover 059.

אידמפוטנטיות: מפתח
`affiliate:{order_id}:{affiliate_id}`.
Webhook כפול לא משלם פעמיים.

---

## 5. דף `/affiliate`

רק
`affiliates.status=approved`
ו-
`user_id = auth.uid()`.
אחרת: טופס בקשה / ממתין לאישור / 403.

תוכן RTL:

- קישור להעתקה + UTM מוכנים.
- קליקים 30 יום, המרות, עמלה ממתינה, עמלה שזוכתה לארנק (אגורות מוצגות כשקלים ב-UI בלבד).
- טבלת הזמנות מיוחסות: תאריך, סכום אתר, עמלה, סטטוס (`pending_credit|credited|clawed_back|flagged`). בלי PII של הקונה מעבר ל"הזמנה #קיצור".
- אחוז נוכחי (קריאה בלבד).
- קישור לארנק:
  `/account/wallet`.

אין עריכת אחוז, סטטוס, או סה"כ. תיאור ערוץ: פונקציה
`fn_affiliate_update_channel`
שמעדכנת רק
`channel_description` / `channel_urls`.

אדמין נשאר
`/admin/affiliates`
(קיים). מוסיפים שדה אחוז + תור flagged.

---

## 6. הזמן-חבר ללקוחות

נשאר 098. לא בונים מסלול שלישי.

- שני הצדדים מקבלים קאשבק ארנק בסכומים מ-
  `referral_program_settings`
  (לא seeded; התוכנית כבויה עד שהאדמין ממלא).
- תנאי: הזמנה ראשונה paid, מעל
  `min_order_agorot`,
  בתוך
  `qualify_window_days`.
- כסף לא זז ב-signup ולא ב-claim, רק אחרי paid + fraud ריק או אישור תור.
- UI לקוח: `/account` בלוק "הזמן חבר" עם הקוד והקישור
  `https://kenyonexpress.co.il/r/c/{CODE}`.

---

## 7. אנטי-הונאה

משותף לשני המסלולים היכן שאפשר (`referral_signals`).

| כלל | שותף | הזמן-חבר |
|---|---|---|
| Self-referral | `orders.user_id = affiliates.user_id` נדחה. גם cookie של הקוד של עצמי | `fn_claim_referral`: referrer = referred |
| כפילות זוג | ייחודי `(order_id)` על עמלות | ייחודי מופנה אחד; ייחודי זוג מ-010 |
| אותו מכשיר / כרטיס (hash) | flagged, לא תשלום אוטומטי | 098 `same_device` / `same_card` |
| אותו IP | מחזק flagged, לא סירוב לבד | 098 |
| תקרות | אופציונלי: מקס המרות ליום לשותף | `max_per_referrer_month/year` |
| קוד לא approved / suspended | הקליק נרשם כ-`ignored`, בלי cookie | N/A |
| החלפת cookie | first-touch, חתימה | claim חד-פעמי |
| הזמנה מתחת לסף | אין עמלה אם האדמין הגדיר min על שותף; ברירת מחדל: אין min מעבר להזמנה paid | `min_order_agorot` |

PAN אסור בסיגנלים. רק hash של brand+last4+expiry עם מלח שרת, כמו 098.

חשד: סטטוס
`flagged`
על שורת עמלה, תור אדמין, בלי זיכוי עד אישור. Clawback אחרי זיכוי = שורת נגד, לא DELETE.

---

## 8. זרימות

### 8.1 שותף

```
קליק /r/a/{code}
  → קוד approved?
       לא: redirect בלי cookie
       כן: first-touch cookie + INSERT affiliate_clicks
  → (אופציונלי) Google בקופה: UPSERT affiliate_attributions
  → order paid
       → אם יש referral pending לאותו user: דילוג שותף
       → אם attribution בתוקף ולא self: INSERT affiliate_commissions (snapshot %)
       → fraud ריק: fn_wallet_transfer affiliate_commission
       → fraud: flagged
```

### 8.2 הזמן-חבר

כמו 098: claim ב-signup → complete ב-paid ראשון → pay או תור.

---

## 9. סכמה טיוטה (לא להחיל)

מיגרציה עתידית ב-
`migrations/pending/`
אחרי אישור. אידמפוטנטית. בלי `db push`. בלי DEFAULT לאחוז.

```sql
-- DRAFT ONLY. Do not apply.

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS total_earnings_agorot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_agorot integer NOT NULL DEFAULT 0;

ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_commission_percent_check;
ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_commission_percent_check
  CHECK (
    commission_percent IS NULL
    OR (commission_percent > 0 AND commission_percent <= 50)
  );

COMMENT ON COLUMN public.affiliates.payout_method IS
  'DEPRECATED. Affiliate earnings credit the internal wallet only. Do not expose cash-out.';
COMMENT ON COLUMN public.affiliates.payout_details IS
  'DEPRECATED. Unused. Wallet-only.';
COMMENT ON COLUMN public.affiliates.total_earnings_ils IS
  'DEPRECATED numeric. New writes go to total_earnings_agorot.';

-- Approve must set a percent. Enforce in SECURITY DEFINER, not only UI:
-- UPDATE ... status=approved rejected unless commission_percent IS NOT NULL.

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  landing_path  text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  ip_hash       text,
  device_hash   text,
  ignored       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_aff_created_idx
  ON public.affiliate_clicks (affiliate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.affiliate_attributions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  affiliate_id    uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  first_click_id  uuid REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_attributions_one_open UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id         uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  order_id             uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  user_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  click_id             uuid REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  base_agorot          integer NOT NULL CHECK (base_agorot >= 0),
  commission_percent   numeric(5,2) NOT NULL,
  commission_agorot    integer NOT NULL CHECK (commission_agorot >= 0),
  status               text NOT NULL DEFAULT 'pending_credit'
                       CHECK (status IN ('pending_credit','credited','clawed_back','flagged','rejected')),
  flagged_reasons      text[],
  credited_at          timestamptz,
  idempotency_key      text NOT NULL UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commissions_one_per_order UNIQUE (order_id)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.affiliate_commissions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

פונקציות (שלד): `fn_affiliate_register_click`, `fn_affiliate_attribute_user`, `fn_affiliate_on_order_paid`, `fn_affiliate_credit`, `fn_affiliate_clawback`. כולן SECURITY DEFINER, `search_path = public, pg_temp`, GRANT ל-service_role בלבד. אחוז נקרא מהשותף **ומצולם**. self-check לפני INSERT.

הרחבת enum סיבת ארנק: ערך
`affiliate_commission`
באותו דפוס של 097 (טרנזקציה נפרדת מ-ADD VALUE).

---

## 10. RLS טיוטה

כל טבלה חדשה:
`ENABLE ROW LEVEL SECURITY`.
אין פוליסי = deny ל-anon/authenticated (כמו
`referral_signals`
ו-
`payment_webhook_events`).

```sql
-- DRAFT ONLY.

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- Clicks: hashed IP/device. Partners see counts via a view, not raw hashes.
DROP POLICY IF EXISTS affiliate_clicks_admin_all ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_admin_all
  ON public.affiliate_clicks FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- No user SELECT on raw clicks.

-- Attributions: user may see own row (no hashes here).
DROP POLICY IF EXISTS affiliate_attr_user_select ON public.affiliate_attributions;
CREATE POLICY affiliate_attr_user_select
  ON public.affiliate_attributions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS affiliate_attr_admin_all ON public.affiliate_attributions;
CREATE POLICY affiliate_attr_admin_all
  ON public.affiliate_attributions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- No INSERT/UPDATE from authenticated. Service role / definer only.

-- Commissions: affiliate reads own, never other people's user_id details
-- beyond what the view strips. Prefer a view for /affiliate.
DROP POLICY IF EXISTS affiliate_comm_partner_select ON public.affiliate_commissions;
CREATE POLICY affiliate_comm_partner_select
  ON public.affiliate_commissions FOR SELECT TO authenticated
  USING (
    affiliate_id IN (
      SELECT id FROM public.affiliates
      WHERE user_id = auth.uid() AND deleted_at IS NULL AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS affiliate_comm_admin_all ON public.affiliate_commissions;
CREATE POLICY affiliate_comm_admin_all
  ON public.affiliate_commissions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- No partner UPDATE/INSERT.

-- affiliates row: keep 035. SELECT own. Admin ALL.
-- Recreate NOTHING like affiliates_user_update.
-- Channel edits: fn_affiliate_update_channel only.

DROP POLICY IF EXISTS affiliates_user_select ON public.affiliates;
CREATE POLICY affiliates_user_select
  ON public.affiliates FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS affiliates_admin_all ON public.affiliates;
CREATE POLICY affiliates_admin_all
  ON public.affiliates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS affiliates_support_select ON public.affiliates;
CREATE POLICY affiliates_support_select
  ON public.affiliates FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);
```

תצוגה לדשבורד שותף (בלי
`user_id`
של הקונה, בלי hashes):

```sql
CREATE OR REPLACE VIEW public.v_affiliate_my_stats AS
SELECT
  c.id,
  c.created_at,
  c.base_agorot,
  c.commission_percent,
  c.commission_agorot,
  c.status
FROM public.affiliate_commissions c
JOIN public.affiliates a ON a.id = c.affiliate_id
WHERE a.user_id = auth.uid() AND a.deleted_at IS NULL;
```

RLS על VIEW ב-Postgres עוקב אחרי הטבלאות. ודאו שהשותף לא קורא
`affiliate_commissions.user_id`
מהקליינט: השאילתה באפליקציה בוחרת עמודות מפורשות, לא
`select('*')`.

`referral_program_settings`: נשאר אדמין-SELECT כמו 098. אין policy כתיבה ל-authenticated.

---

## 11. אפליקציה (כשייכתב קוד, לא עכשיו)

| משטח | תפקיד |
|---|---|
| `src/app/(store)/r/a/[code]/route.ts` | קליק + cookie + redirect |
| `src/app/(store)/r/c/[code]/route.ts` | שמירת קוד הזמן-חבר ל-signup |
| `src/app/(account)/affiliate/page.tsx` | דשבורד שותף |
| checkout paid hook | `fn_affiliate_on_order_paid` אחרי שובר, באותו סדר כמו 098 complete |
| `/admin/affiliates` | אחוז חובה לפני approve |

טסטים: first-touch לא נדרס; self נדחה; ייחודי order_id; clawback אידמפוטנטי; אחוז מצולם; קופון base = coupon_price לא פנים; RLS שותף א לא רואה שותף ב.

---

## 12. מה לא עושים

- לא מפעילים `payout_method`.
- לא מחזירים `affiliates_user_update`.
- לא seed לאחוז או לבונוס.
- לא משלמים על קליק או על signup.
- לא מוסיפים float.
- לא מחילים את הטיוטה בלי קובץ ב-
  `migrations/pending`
  ואישור בעלים (עצירה 3).

---

## Revision

| Date | Change |
|---|---|
| 2026-08-19 | מפרט מלא מול audit של affiliates/referrals: cookie 30d, אחוז אדמין, ארנק בלבד, /affiliate, הזמן-חבר, אנטי-הונאה, סכמה+RLS טיוטה |
