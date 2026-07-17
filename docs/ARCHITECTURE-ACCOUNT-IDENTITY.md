# ארכיטקטורת חשבון לקוח וזהות (Account & Identity)

מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה):
`supabase/migrations/029_accounts.sql`

תאריך: 2026-07-08. ענף: `phase5/homepage`.
מסמכים קשורים: `docs/ARCHITECTURE-COMMERCE.md` (026), `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027), `docs/ARCHITECTURE-AI-AGENTS.md` (028).

> הערת גרסה: הבריף מדבר על Next.js 15, אבל הריפו בפועל על Next 16.2.4.
> ההשלכה המעשית: ה-middleware הוא `src/proxy.ts` (פונקציית `proxy`), לא `middleware.ts`. כל התכנון כאן מיושר למה שקיים בקוד.

---

## 0. עקרונות על

1. **Google הוא שער הכניסה, לא מחסום הקנייה.** עגלת אורח פתוחה לגמרי; ההתחברות נדרשת רק בלחיצת "לתשלום" (נאכף כבר היום ב-`proxy.ts` על `/checkout*`). אחרי ההתחברות הראשונה נשמרים פרטים + טוקן Cardcom, ומכאן רכישה עתידית היא one-click.
2. **RLS הוא גבול האמת.** כל דף באזור האישי קורא עם ה-client של המשתמש (anon key + session). אין service role בשום מסך לקוח. מה שהמשתמש לא אמור לראות, ה-DB פיזית לא מחזיר.
3. **אין כרטיסי אשראי אצלנו, אף פעם.** רק טוקן Cardcom + 4 ספרות אחרונות + מותג + תוקף. הטוקן הגולמי לא נגיש אפילו ל-authenticated (הרשאת עמודה נשללת), רק ל-service role בצד השרת.
4. **מחיקת חשבון = מחיקת PII, לא מחיקת היסטוריה כספית.** הזמנות, תשלומים ותנועות ארנק נשמרות 7 שנים לפי דיני המס, מנותקות מכל פרט מזהה. הפירוט בסעיף 2.4.
5. **כל כתיבה רגישה עוברת דרך פונקציית SECURITY DEFINER** עם ולידציה, rate limit ו-audit, בדיוק כמו ב-026/027 (מיזוג עגלה, בקשת מחיקה, ברירת מחדל של כרטיס).

---

## 1. מצב קיים שהתכנון נשען עליו

| רכיב | מקור | מצב |
|---|---|---|
| `profiles` (email, full_name, phone, avatar_url, role) | 001+003 | חי; owner select/update, שינוי role חסום ב-WITH CHECK |
| `payment_tokens` (cardcom_token, last_4, brand, expiry, is_default) | 001 | חי; **policy רחב מדי "owner all", מוקשח ב-029** |
| `carts` (profile_id/session_id, items jsonb) | 001 | חי; עוגיית אורח `ke_session_id` נקבעת ב-`proxy.ts` |
| `user_addresses` (street, street_number, apartment, entrance, floor, city, zip) | 009 | חי; פורמט ישראלי מלא כבר קיים, is_default יחיד |
| `wallet_balances` + `wallet_transactions` | 006 | חי; מוחלף ב-double-entry של 026 כשתוחל |
| `orders` + `order_items` (item_status, fulfilled_at) | 007 | חי |
| `coupon_codes` (קוד 8 ספרות, סטטוסים, expires_at) | 008 | חי; 027 מוסיפה `qr_token` חתום Ed25519 |
| `signInWithGoogle` + `/auth/callback` + `mergeGuestCart` | `src/server/actions/auth.ts`, `src/app/auth/callback/route.ts`, `src/server/actions/cart.ts` | קיים; **המיזוג אינו race-safe, מוחלף ב-RPC מ-029** |
| הגנת נתיבים `/account*`, `/checkout*` | `src/proxy.ts` | קיים; דפי `(account)` עצמם עדיין ריקים (.gitkeep) |
| rate limits | 002 (IP), 019 (user+action) | חי |
| `audit_log` + `audit_log_trigger_fn` | 011+025 | חי |

---

## 2. זהות (Identity)

### 2.1 Google OAuth דרך Supabase Auth

- flow: PKCE (ברירת המחדל של `@supabase/ssr`). `signInWithGoogle` הקיים כבר שולח `scopes: openid email profile` ו-redirect ל-`/auth/callback?next=...`.
- trigger surface: כפתור "לתשלום" בעגלה מפנה ל-`/login?next=/checkout` כשאין session (נאכף ב-proxy). דף ה-login מציג Google כאופציה ראשית; email/magic-link קיימים כגיבוי.
- יצירת משתמש: `handle_new_user` (023, מורחב ב-026) יוצר `profiles` + ארנק. 029 מוסיפה טריגר נפרד על `profiles` שיוצר שורת העדפות התראות, בלי לגעת שוב ב-`handle_new_user` (כדי לא להתנגש עם הגרסה של 026).
- שמירת פרטים לרכישה עתידית: אחרי תשלום Cardcom ראשון מוצלח, ה-webhook (026) שומר `payment_tokens` דרך service role. הלקוח לא כותב לטבלה הזו לעולם.

### 2.2 אסטרטגיית session ב-App Router

- **מקור אמת יחיד:** עוגיות httpOnly שמנוהלות על ידי `@supabase/ssr` (קיים ב-`src/lib/supabase/server.ts` + `client.ts`).
- **רענון:** `proxy.ts` קורא `supabase.auth.getUser()` בכל בקשה מותאמת matcher, מה שמגלגל refresh token ומעדכן עוגיות. חוק ברזל: **בשרת תמיד `getUser()` ולא `getSession()`**; `getSession` קורא את ה-JWT מהעוגייה בלי אימות מול השרת, ופתוח לזיוף עוגייה.
- **שכבות ה-guard:**
  1. `proxy.ts`: ניתוב גס (redirect ל-login).
  2. layout של `(account)`: guard חדש `requireUserSession()` ב-`lib/admin/rbac.ts` (מקביל ל-`requireAdminSession` הקיים; היום הוא לא קיים בקוד וצריך להתווסף).
  3. RLS: גם אם שתי השכבות למעלה נכשלו, ה-DB מחזיר רק שורות של `auth.uid()`.
- session אורח: עוגיית `ke_session_id` (httpOnly, SameSite=Lax, 30 יום) קיימת. היא **לא** מזהה זהות, רק עגלה.

### 2.3 מיזוג עגלת אורח בהתחברות (race-safe)

הקיים: `mergeGuestCart` ב-`src/server/actions/cart.ts` עושה read-merge-write עם admin client ואז מוחק את עגלת האורח. שתי בעיות:

1. **מרוץ:** שני callbacks מקבילים (double-click על ההתחברות, שני טאבים) קוראים את אותו מצב, כותבים פעמיים, וכמויות הולכות לאיבוד או מוכפלות.
2. **אין עגלת-משתמש יחידה:** אין unique על `carts.profile_id`, כך שהמרוץ יכול גם ליצור שתי עגלות למשתמש.

הפתרון ב-029, פונקציה יחידה `public.fn_merge_guest_cart(p_session_id)` (SECURITY DEFINER):

```
1. auth.uid() חובה (הפונקציה נקראת אחרי exchangeCodeForSession)
2. pg_advisory_xact_lock(hash(uid))        -- מסלסל את כל המיזוגים של אותו משתמש
3. SELECT ... FOR UPDATE על עגלת האורח (session_id, profile_id IS NULL)
   ועל עגלת המשתמש העדכנית
4. אין עגלת משתמש? claim אטומי:
   UPDATE carts SET profile_id = uid, session_id = NULL
   WHERE id = guest_id AND profile_id IS NULL
5. יש? מיזוג jsonb לפי (product_id, variant_id) עם סכימת כמויות (עד 99),
   מחיקת עגלת האורח באותה טרנזקציה
```

זה בדיוק ה-itemKey של הקוד הקיים (`product_id::variant_id`), כך שהחלפת הקריאה ב-callback היא שורה אחת: `supabase.rpc('fn_merge_guest_cart', ...)` במקום המימוש הידני. בנוסף 029 מוסיפה אינדקס ייחודי חלקי `carts(profile_id)` (אחרי דה-דופליקציה), כך שגם באג עתידי לא יוכל ליצור עגלה כפולה.

### 2.4 מחיקת חשבון + כללי שמירת מידע (דין ישראלי)

בסיס משפטי שהתכנון מיישר אליו (לא ייעוץ משפטי; שאלה פתוחה 9.1):

- **חוק הגנת הפרטיות + תיקון 13** (בתוקף מאוגוסט 2025): צמצום מידע, זכות עיון ותיקון, חובת מחיקה כשהמטרה מוצתה, סמכויות אכיפה מורחבות.
- **פקודת מס הכנסה + הוראות ניהול פנקסים**: חובת שמירת רשומות הנהלת חשבונות (חשבוניות, קבלות, רשומות עסקה) **7 שנים**. לכן אי אפשר למחוק הזמנות/תשלומים/ledger, מותר וצריך למחוק את מה שמזהה את האדם.
- **חוק התקשורת סעיף 30א (ספאם)**: דיוור שיווקי הוא opt-in. משפיע על ברירות המחדל בהעדפות התראות (סעיף 3.5).

הזרימה:

```
משתמש מבקש מחיקה ב-/account/privacy (אחרי re-auth, סעיף 5.4)
        |
        v
fn_request_account_deletion(reason)
  - rate limit ('account_deletion', 3/יום)
  - שורת account_deletion_requests: status='pending',
    cancel_deadline_at = now() + 30 יום (חלון חרטה)
  - בקשה pending אחת פר משתמש (אינדקס ייחודי חלקי)
        |
   30 יום. המשתמש יכול לבטל בכל רגע: fn_cancel_account_deletion()
   התחברות בתקופת החלון מציגה באנר "החשבון בתהליך מחיקה, לבטל?"
        |
        v
job יומי (cron) מריץ fn_execute_account_deletion(user_id)  [service role בלבד]
```

מה הפונקציה עושה (הכול בטרנזקציה אחת, בסדר הזה):

| # | פעולה | הצדקה |
|---|---|---|
| 1 | `profiles`: email -> tombstone (`deleted-<hash>@removed.invalid`), full_name -> 'משתמש שנמחק', phone/avatar_url/affiliate_code -> NULL, `anonymized_at = now()` | מחיקת PII; השורה נשארת כי הזמנות מפנות ל-user |
| 2 | `user_addresses`: DELETE פיזי | כתובת היא PII טהור; ההזמנות כבר לא מפנות אליה (`SET NULL`) |
| 3 | `payment_tokens`: DELETE פיזי | הטוקן מבוטל קודם מול Cardcom בצד האפליקציה (ראו למטה) |
| 4 | `carts`, `user_notification_preferences`: DELETE | אין ערך שימור |
| 5 | `notifications_outbox`: queued -> cancelled | לא שולחים מייל למי שנמחק |
| 6 | **scrub ל-audit_log**: איפוס `changes`/`ip_address`/`user_agent` בשורות שה-actor או ה-entity הוא המשתמש | הטריגר על profiles תיעד את ה-PII הישן ב-jsonb; חייבים לנקות גם אותו. רץ אחרי צעד 1 כדי לתפוס גם את רשומת ה-scrub עצמה |
| 7 | הבקשה -> completed | |

מה **לא** נמחק, ולמה: `orders`, `order_items`, `payments`, `wallet_transactions` (ledger), `coupon_codes`, `coupon_redemptions`, שורות audit (בלי ה-PII). כולן רשומות כספיות תחת חובת 7 השנים, וכולן מפנות ל-uuid שאחרי הצעדים למעלה לא מצביע על אדם מזוהה (פסאודונימיזציה).

בצד האפליקציה, לפני הקריאה ל-DB fn: `supabase.auth.admin.updateUserById` (איפוס email ל-tombstone + ban) וביטול הטוקן מול Cardcom API. את שורת `auth.users` עצמה אי אפשר למחוק כל עוד יש הזמנות (`orders.user_id` הוא RESTRICT, בכוונה); מחיקה סופית שלה היא job עתידי אחרי תום תקופת השמירה (שאלה 9.2).

---

## 3. האזור האישי (`/account`, route group `(account)` שקיים וריק)

כל המסכים RTL, עברית, `requireUserSession()` ב-layout, קריאות עם ה-client של המשתמש בלבד.

```
/account
  /orders            הזמנות שלי (פיזי + קופונים)
  /orders/[id]       פירוט הזמנה
  /coupons           ארנק הקופונים (סעיף 4)
  /wallet            יתרה + היסטוריית תנועות + cashback
  /payment-methods   כרטיסים שמורים (טוקנים)
  /profile           פרטים אישיים + כתובות
  /notifications     העדפות התראות
  /privacy           ייצוא נתונים + מחיקת חשבון
```

### 3.1 ההזמנות שלי

- מקור: `orders` (RLS: user_id = auth.uid) + `order_items`.
- פריט פיזי: `item_status` (pending/issued/shipped/delivered/cancelled/refunded) + carrier/tracking מ-027 (`update_shipping_status`). ציר זמן: שולם -> נשלח -> נמסר.
- פריט קופון: לא מציגים סטטוס משלוח אלא מצב הקופון (`coupon_codes.status`): פעיל / מומש (+מתי ואצל מי) / פג / הוחזר. לחיצה קופצת ל-`/account/coupons#<id>`.
- מה שולם באתר מול מה לתשלום בעסק: מוצג מהסנפשוטים `charged_on_site_ils` / `balance_due_at_business_ils` (026), לא מחישוב חי.

### 3.2 הארנק שלי

- יתרה: `wallet_balances` היום; אחרי החלת 026, `wallet_accounts.balance_ils` של המשתמש. ה-UI קורא דרך שאילתה אחת שמנסה את החדש ונסוגה לישן (feature detection בצד השרת), כך שהדף לא תלוי בסדר החלת המיגרציות.
- היסטוריה: תנועות ledger שלו בלבד (ה-RLS של 026 כבר מסנן), עם תרגום `reason` לעברית: צבירת cashback, מימוש בהזמנה, פקיעה, זיכוי, בונוס הפניה, התאמת אדמין.
- cashback שנצבר: סכימת `cashback_earned_ils` על `order_items` של הזמנות שלו.
- אין שום פעולת כתיבה מהדף. טעינת/חיוב ארנק קורים רק בצנרת התשלום (026).

### 3.3 אמצעי תשלום שמורים

- מציג `last_4`, `card_brand`, תוקף, ברירת מחדל. **בגלל הרשאות העמודה החדשות (סעיף 5.1), ה-select חייב לפרט עמודות; `select('*')` ייכשל ב-42501.** זה פיצ'ר, לא באג.
- פעולות לקוח: מחיקת כרטיס (DELETE ישיר תחת RLS) וקביעת ברירת מחדל דרך `fn_set_default_payment_token` (מאפס את השאר אטומית).
- הוספת כרטיס: אין טופס כרטיס אצלנו לעולם. "הוסף כרטיס" פותח Low Profile של Cardcom לעסקה בסכום אפס/מינימלי עם בקשת טוקן, וה-webhook שומר את הטוקן (service role). ראו סקיל `cardcom-payments`.

### 3.4 פרופיל וכתובות

- פרופיל: עדכון full_name + phone על `profiles` (ה-policy הקיים כבר חוסם שינוי role). email מנוהל דרך Supabase Auth בלבד (עם אימות), לא בעריכה חופשית.
- כתובות: CRUD על `user_addresses` (009). הפורמט הישראלי כבר בסכימה: רחוב, מספר, דירה, כניסה, קומה, עיר, מיקוד, הערות לשליח. ולידציה בצד אפליקציה: טלפון `05x-xxxxxxx`, מיקוד 7 ספרות. ברירת מחדל יחידה נאכפת באינדקס חלקי קיים.

### 3.5 העדפות התראות (`user_notification_preferences`, חדש ב-029)

| שדה | ברירת מחדל | הערה |
|---|---|---|
| `order_updates_email` | true | טרנזקציוני; ה-UI מציג אבל מסמן "מומלץ" |
| `coupon_expiry_email` | true | תזכורות פקיעה (סעיף 4.3) |
| `coupon_expiry_inapp` | true | פעמון באתר |
| `wallet_activity_email` | false | |
| `marketing_email` | **false** | חוק הספאם: opt-in בלבד |
| `marketing_sms` | **false** | כנ"ל |
| `locale` | 'he' | |

שורה נוצרת אוטומטית בטריגר על `profiles` (וגם backfill לקיימים). RLS: owner select/insert/update; אדמין select.

---

## 4. ארנק קופונים: UX וזמינות

### 4.1 מסך `/account/coupons`

```
טאבים: פעילים | מומשו | פגו/הוחזרו
+--------------------------------------------------+
| עיסוי זוגי 60 דק' - ספא ביוטי חיפה               |
| בתוקף עד 12/08/2026 (עוד 21 יום)                 |
|          [ QR גדול ]                             |
|          קוד ידני: 1234 5678                     |
| שולם באתר: 40 ש"ח | לתשלום בעסק: 360 ש"ח        |
| [הוסף ליומן] [שתף]                               |
+--------------------------------------------------+
```

- ה-QR מרונדר בצד לקוח מ-`coupon_codes.qr_token` (הטוקן החתום של 027). אין תלות ב-storage וב-`qr_code_url` הישן.
- מומש: מציג מתי ובאיזה עסק (מ-`used_at`), מסך אפור עם חותמת "מומש".
- RLS קיים מ-008: המשתמש רואה רק `user_id = auth.uid()`.

### 4.2 אסטרטגיית offline

הבעיה: הלקוח עומד בקופה במרתף בלי קליטה.

- הדף עובד כ-PWA קלה: בכניסה ל-`/account/coupons` נשמרים הקופונים הפעילים (id, שם דיל, קוד ידני, `qr_token`, expires_at, סכום לתשלום בעסק) ב-IndexedDB, וה-route נכלל ב-service worker cache.
- בלי רשת: הרשימה וה-QR מרונדרים מהמטמון, עם באנר "מצב לא מקוון, הנתונים מרגע הסנכרון האחרון".
- זה בטוח כי המימוש בפועל תמיד מאומת אונליין בצד הסורק של העסק (ה-UPDATE האטומי של 027). ה-QR של הלקוח הוא bearer של *הצגה*, לא של מימוש; screenshot ממילא אפשרי, וההגנה היא חד-פעמיות ב-DB.
- אין לשמור ב-cache קופונים שכבר מומשו (מקטין בלבול בקופה).

### 4.3 תזכורות פקיעה (ארכיטקטורה)

```
cron יומי (Vercel cron -> route מוגן secret, או pg_cron)
   -> fn_enqueue_coupon_expiry_reminders()   [SECURITY DEFINER, service בלבד]
        סורק coupon_codes בסטטוס issued שפג בעוד <=7 ימים או <=48 שעות,
        מצליב מול user_notification_preferences,
        INSERT ל-notifications_outbox עם dedupe_key ייחודי
        ('coupon_expiry_7d:<coupon_id>' / 'coupon_expiry_48h:<coupon_id>')
        ON CONFLICT DO NOTHING  => לעולם לא נשלחת אותה תזכורת פעמיים
   -> worker שליחה (route/edge function) מושך queued, שולח, מסמן sent/failed
```

- `notifications_outbox` היא תשתית כללית (kind/channel/payload/status), לא רק לקופונים: אותו צינור ישרת עדכוני משלוח והתראות ארנק בהמשך.
- ספק המייל עדיין לא קיים בפרויקט (אין שום תשתית דיוור בקוד). בחירת ספק היא שאלה פתוחה 9.3; ה-outbox מנתק את ההחלטה הזו מהסכימה.
- ערוץ in-app: פעמון באתר קורא את השורות שלו מה-outbox (RLS: owner select), מסומן כנקרא בצד אפליקציה.

---

## 5. אבטחה

### 5.1 כספת הטוקנים (`payment_tokens`)

המצב היום מסוכן: policy יחיד `owner all` מ-001 מאפשר ללקוח לקרוא את `cardcom_token` הגולמי, ואף להכניס/לעדכן שורות (למשל להצביע על טוקן של מישהו אחר אם ידלוף). ההקשחה ב-029:

1. **הרשאת עמודה:** `REVOKE SELECT` על הטבלה מ-authenticated, ואז `GRANT SELECT` רק על העמודות הבטוחות (בלי `cardcom_token`). גם אדמין בדפדפן לא רואה טוקן גולמי; רק service role.
2. **policies:** owner SELECT + owner DELETE בלבד. אין INSERT/UPDATE ללקוח בכלל; כתיבה רק דרך service role (webhook של Cardcom) ו-`fn_set_default_payment_token` לברירת מחדל.
3. **audit ייעודי:** טריגר שכותב ל-`audit_log` את פעולות הטבלה **בלי** עמודת הטוקן (הטריגר הגנרי של 025 היה מתעד את הטוקן בתוך `changes`).
4. הטוקן חסר ערך בלי מספרי הטרמינל וה-API של Cardcom שנמצאים רק ב-env של השרת. עדיין מתייחסים אליו כסוד.

### 5.2 מטריצת RLS של האזור האישי (מה משתמש מחובר רואה)

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | שלו | (טריגר) | שלו, בלי role | לא |
| `user_addresses` | שלו | שלו | שלו | שלו (soft) |
| `orders` / `order_items` | שלו | לא (checkout בשרת) | לא | לא |
| `payments` (026) | שלו | לא | לא | לא |
| `coupon_codes` | שלו | לא | לא | לא |
| `wallet_accounts` / `wallet_transactions` (026) | שלו | לא | לא | לא |
| `payment_tokens` | שלו, עמודות בטוחות בלבד | לא | לא (רק fn) | שלו |
| `user_notification_preferences` | שלו | שלו | שלו | לא |
| `notifications_outbox` | שלו | לא | לא | לא |
| `account_deletion_requests` | שלו | רק דרך fn | רק דרך fn | לא |
| `carts` | שלו | שלו | שלו | שלו |

עיקרון: אפס policies של כתיבה על כל מה שכספי; פונקציות definer הן המסלול היחיד.

### 5.3 הגנות חטיפת session

- עוגיות httpOnly + Secure + SameSite=Lax (ברירת המחדל של `@supabase/ssr`): JS בדפדפן לא נוגע בטוקנים, וניווט cross-site לא שולח אותן ב-POST.
- PKCE flow: קוד ה-OAuth חסר ערך בלי ה-verifier שנשאר בעוגייה.
- רוטציית refresh token + refresh token reuse detection מובנים ב-Supabase Auth (שימוש חוזר בטוקן ישן מפיל את כל המשפחה). JWT קצר (ברירת מחדל שעה) נשאר.
- `getUser()` בכל בקשת שרת (קיים ב-proxy): עוגייה מזויפת נופלת מיד.
- `signOutAll` (קיים) = `scope: global`, מנתק את כל המכשירים; מוצג ב-`/account/privacy` כ"התנתק מכל המכשירים".
- ולידציית `next` בקולבק (קיימת: חייב להתחיל ב-`/`) נגד open redirect.
- server actions של Next מוגנות origin-check מובנה; בנוסף כל פעולה רגישה עוברת rate limit 019.

### 5.4 אימות מחדש (re-auth) לפעולות רגישות

פעולות רגישות: מחיקת חשבון, מחיקת/הוספת אמצעי תשלום, שינוי email.

- guard אפליקטיבי `requireRecentAuth(maxAgeMinutes = 15)`: קורא את ה-JWT (אחרי `getUser()`), בודק את חותמת הזמן האחרונה ב-claim `amr`. ישן מדי? redirect ל-`/login?reauth=1&next=...`.
- ב-reauth עם Google: `signInWithOAuth` עם `queryParams: { prompt: 'select_account', max_age: '0' }` שמכריח את Google לאמת מחדש ולא להחזיר session שקוף.
- שכבת עומק ב-DB: הפונקציות הרגישות (בקשת מחיקה, ברירת מחדל כרטיס) עושות rate limit פר משתמש, כך שגם session חטוף לא יכול להריץ אותן בקצב.

### 5.5 מודל איומים מרוכז

| # | איום | מיטיגציה |
|---|---|---|
| 5.5.1 | גניבת עוגיות (XSS) | httpOnly: אין גישת JS; CSP בהמשך; טוקן כרטיס ממילא לא נשלף לדפדפן |
| 5.5.2 | עוגייה מזויפת / JWT ישן | `getUser()` בשרת, לא `getSession()` |
| 5.5.3 | קריאת טוקן Cardcom דרך ה-Data API | הרשאת עמודה נשללה; אין דרך לבקש את העמודה גם עם RLS עובר |
| 5.5.4 | ניפוח עגלת אורח / הרעלת מיזוג | המיזוג ב-fn נעול advisory + FOR UPDATE; כמות עד 99; עגלה בלי מחירים, הכול מתומחר מחדש ב-checkout (026) |
| 5.5.5 | חטיפת session + מחיקת חשבון זדונית | re-auth טרי + חלון חרטה 30 יום + מייל "בקשת מחיקה נפתחה" עם קישור ביטול |
| 5.5.6 | enumeration של קופונים מהאזור האישי | הלקוח רואה רק את שלו (RLS); הקוד המלא מוצג רק לבעלים, וזה לגיטימי (הוא צריך אותו בקופה) |
| 5.5.7 | PII שורד ב-audit אחרי מחיקה | צעד 6 בפונקציית המחיקה מנקה changes/ip/user_agent |
| 5.5.8 | ספאם תזכורות / הצפת outbox | dedupe_key ייחודי + cron יחיד + סטטוסים; שיווק רק opt-in |

---

## 6. מה 029 כוללת (ומה לא)

כוללת:
- enums: `deletion_request_status`, `notification_status`.
- `profiles.anonymized_at`; טריגר יצירת העדפות התראות + backfill.
- `user_notification_preferences`, `account_deletion_requests`, `notifications_outbox` + RLS מלא + audit.
- הקשחת `payment_tokens` (policies + הרשאות עמודה + audit בטוח) + `fn_set_default_payment_token`.
- `fn_merge_guest_cart` + דה-דופליקציה ואינדקס ייחודי על עגלות.
- `fn_request_account_deletion` / `fn_cancel_account_deletion` / `fn_execute_account_deletion`.
- `fn_enqueue_coupon_expiry_reminders`.

לא כוללת: קוד אפליקציה (דפי account, requireUserSession, PWA, worker שליחה), בחירת ספק מייל, שינוי `handle_new_user`, שום תלות ב-026/027/028 (רפרנסים לטבלאות שלהן מוגנים או נדחים לאפליקציה).

תלויות ב-DB החי: 001, 003, 008 (coupon_codes), 009, 011+025 (audit fn), 019 (rate limit). אין תלות ב-026/027.

## 7. הוראות החלה (כשיוחלט)

- להחיל דרך Supabase MCP `apply_migration` בלבד (ההיסטוריה במרוחק לא מסונכרנת; `db push` ייכשל).
- לפני: לוודא 019 ו-025 חיים (כמו שאומת ב-STATE.md).
- אחרי: `generate_typescript_types` ועדכון `src/types/database.ts`; החלפת `mergeGuestCart` לקריאת RPC; הוספת `requireUserSession`.

---

## 8. סיכום החלטות

1. Google OAuth ב-PKCE נשאר השער היחיד לתשלום; אורח חופשי עד "לתשלום" (קיים, רק מתועד ומהודק).
2. מיזוג עגלה עובר מהאפליקציה ל-RPC אטומי עם advisory lock + claim; נוסף unique חלקי על `carts.profile_id`.
3. `payment_tokens` ננעלת: אין כתיבת לקוח, אין קריאת `cardcom_token` לאף תפקיד דפדפן (הרשאת עמודה), audit בלי הטוקן.
4. מחיקת חשבון = פסאודונימיזציה: PII נמחק/מנוקה (כולל בתוך audit_log), רשומות כספיות נשמרות 7 שנים לפי דיני מס; חלון חרטה 30 יום; `auth.users` נשאר כ-shell חסום.
5. העדפות התראות בטבלה ייעודית; שיווק opt-in בלבד (חוק הספאם), טרנזקציוני דולק כברירת מחדל.
6. תזכורות פקיעת קופון: cron -> פונקציית enqueue עם dedupe -> outbox כללי -> worker שליחה; ספק המייל מנותק מהסכימה.
7. offline לקופונים: cache מקומי של הרשימה הפעילה + רינדור QR מ-`qr_token`; הביטחון נשען על חד-פעמיות בצד הסורק, לא על הלקוח.
8. re-auth לפעולות רגישות דרך גיל `amr` + הכרחת Google לאמת מחדש; `getUser()` בלבד בשרת.

## 9. שאלות פתוחות

1. **אישור משפטי** לפרשנות תיקון 13 + 7 שנות שמירה: אורך חלון החרטה (30 יום?), האם נדרשת גם מחיקת גיבויים, נוסח הודעת הפרטיות.
2. **מחיקה סופית של `auth.users`**: מתי (אחרי 7 שנים? לעולם לא?) ומי מריץ. דורש שחרור ה-RESTRICT או ניתוב הזמנות ל-tombstone user.
3. **ספק דיוור** (Resend / SES / אחר) ו-push provider. ה-outbox מוכן לשניהם.
4. **ייצוא נתונים (זכות עיון)**: ב-scope של דף privacy או נדחה? מוצע: JSON פשוט מכל הטבלאות שלו, דרך server action.
5. **טלפון בפרופיל מול טלפון בכתובת**: כרגע כפול (profiles.phone + user_addresses.phone). לאחד או להשאיר (טלפון לשליח שונה לפעמים)? מוצע להשאיר.
6. **email change flow**: Supabase תומך ב-double confirm; לוודא תבניות בעברית לפני חשיפת הכפתור.
7. **מספר כרטיסים שמורים מקסימלי** (הצעה: 3) ומדיניות טוקנים שפג תוקפם (ניקוי cron?).
