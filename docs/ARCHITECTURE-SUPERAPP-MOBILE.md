# ארכיטקטורת Super-App מובייל - KenyonExpress

מסמך תכנון. אין מיגרציה נלווית (מסמך בלבד, שום דבר לא מוחל).

תאריך: 2026-07-08. ענף: `phase5/homepage`.
מסמכים קשורים: `docs/ARCHITECTURE-COMMERCE.md` (026), `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027), `docs/ARCHITECTURE-AI-AGENTS.md` (028), `docs/ARCHITECTURE-ACCOUNT-IDENTITY.md` (029), `docs/ARCHITECTURE-PRODUCTION-OPS.md`.

> הקשר עסקי: שוק ישראלי בלבד. היום: אתר web-first. היעד: super-app שבו כל
> ורטיקל (קומרס, קופונים, משלוחי אוכל, הסעות, שירותים, בסגנון Wolt/Gett)
> **נבנה פנימית, לעולם לא אינטגרציה חיצונית**. עברית RTL. הארנק הפנימי
> (double-entry, 026) הוא הרקמה המחברת בין כל הורטיקלים.

> תיקון עובדתי לבריף: המחסנית בפועל היא **Next 16.2.4 + React 19.2.4**
> (לא Next 15). כל ההנחות במסמך נבדקו מול `package.json` ומול התיעוד
> המקומי ב-`node_modules/next/dist/docs/`.

---

## 0. עקרונות על

1. **הלקוח הוא תמיד אפליקציית ה-web.** כל עוד הקליינט הוא ה-Next app עצמו
   (דפדפן, PWA מותקן, או עטיפת חנות), ה-server actions, ה-RLS וה-RPCs
   הקיימים ממשיכים לעבוד כמות שהם. אין BFF חדש, אין REST layer חדש, אין
   שכתוב קומרס. זה עיקרון ההכרעה המרכזי של סעיף 1.
2. **הליבה המשותפת היא חוזה, לא ספרייה.** זהות, ארנק, תשלומים, התראות
   ו-audit הם חוזים יציבים שכל ורטיקל צורך. ורטיקל לעולם לא נוגע בורטיקל
   אחר, רק בליבה.
3. **הכסף זז רק בצינורות הקיימים.** `orders` + `payments` +
   `fn_wallet_transfer()` + פונקציות SECURITY DEFINER. ורטיקל חדש לא
   ממציא מסלול כסף, הוא מרכיב detail tables על המעטפת הקיימת.
4. **offline הוא cache, השרת הוא אמת.** חתימת Ed25519 מוכיחה אותנטיות
   offline; חד-פעמיות נאכפת רק ב-DB (העיקרון מ-027, סעיף 3.1). אותו
   עיקרון חל על ארנק הקופונים של הלקוח.

---

## 1. בחירת פלטפורמה

### 1.1 שלושת המועמדים מול שלושת הקריטריונים

| קריטריון | PWA (על Next הקיים) | React Native / Expo | Native (Swift/Kotlin) |
|---|---|---|---|
| שיתוף קוד עם Next 16 + TypeScript | **~100%**. אותו קוד בדיוק: RSC, server actions, RLS session, next-intl, Tailwind RTL | ~20%. משתפים טיפוסים, zod schemas ולוגיקה טהורה. **כל ה-UI נכתב מחדש**, ו-server actions לא נגישים מ-RN, נדרש REST/RPC BFF חדש על כל פעולת קומרס | ~0%. שלושה codebases (web+iOS+Android) |
| התראות push בישראל | Android/Chrome: מלא (Web Push). iOS: נתמך מ-iOS 16.4 **רק לאפליקציה שהותקנה למסך הבית**. זו המגבלה האמיתית היחידה | מלא (APNs/FCM) | מלא (APNs/FCM) |
| אילוצי חנויות על קופונים/QR/תשלום | אין חנות, אין ביקורת, deploy מיידי. עדכון באג בקופה תוך דקות | מותר: מוצרים פיזיים ושירותים שנצרכים מחוץ לאפליקציה **חייבים** להיסלק שלא דרך IAP (Apple guideline 3.1.5), כלומר Cardcom תקין וללא עמלת 30%. אבל: כל תיקון עובר app review (ימים) | כמו RN |

שיקולים נוספים שהכריעו:

- **צוות של מפתח אחד + סוכני AI.** כל codebase נוסף מכפיל תחזוקה. RN
  משמעו לתחזק במקביל אתר Next מלא (הוא לא נעלם, הקומרס web-first) ועוד
  אפליקציה, ועוד שכבת API ביניהם.
- **סורק הספקים כבר תוכנן כ-PWA** (027 סעיף 3.5: BarcodeDetector עם
  fallback ל-jsQR). המסלול העסקי הקריטי ביותר (מימוש בקופה) לא צריך חנות.
- **חלוקת השוק הישראלי** בין Android ל-iOS קרובה לחצי-חצי. ב-Android
  הסיפור סגור לגמרי (Web Push + התקנה + TWA לחנות Play כמעט בחינם).
  הפער הוא iOS בלבד, והוא נסגר בשלב מאוחר בעטיפה, בלי לשכתב כלום.
- **סיכון דחייה של עטיפת webview** (Apple guideline 4.2, minimum
  functionality) מטופל בשלב 3ב של סעיף 6: העטיפה מוסיפה יכולות native
  אמיתיות (push, מצלמה, ביומטריה), לא רק webview.

### 1.2 ההמלצה (אחת)

**PWA על אפליקציית ה-Next הקיימת, עם עטיפות חנות דקות בשלב מאוחר:
TWA ל-Google Play, ו-Capacitor shell ל-App Store רק כשמדדי iOS יצדיקו.
לא React Native, לא native.**

נימוק בשורה אחת: הנכס היחיד של הפרויקט הוא codebase אחד שכבר עובד עם
RLS, server actions ו-Cardcom; כל חלופה אחרת שורפת אותו ובונה שכבת API
שאיש לא ביקש, בתמורה ליתרון יחיד (push ב-iOS לא מותקן) שממילא נסגר
בעטיפה.

מה זה אומר בפועל:

```
app/manifest.ts            (מובנה ב-Next 16, MetadataRoute.Manifest)
service worker (Serwist)   precache של app shell + runtime cache
Web Push (VAPID)           web-push בצד השרת, route handlers קיימים
BarcodeDetector + jsQR     סריקה, כבר מתוכנן ב-027
```

---

## 2. ארכיטקטורת ורטיקלים (plug-in)

### 2.1 מה משותף ומה פרטי

```
+--------------------------------------------------------------+
|                        App Shell (Next)                       |
|   ניווט תחתון, דף hub, רישום ורטיקלים, מרכז התראות            |
+--------------------------------------------------------------+
|  (shop)  |  (food)   |  (rides)  |  (services)  |  ורטיקלים   |
|  קיים    |  עתידי    |  עתידי    |  עתידי       |  route groups|
+--------------------------------------------------------------+
|                         ליבה משותפת                           |
|  זהות: profiles, user_role, memberships                       |
|  כסף:  orders (מעטפת), payments, fn_wallet_transfer           |
|  ארנק: wallet_accounts + wallet_transactions (double-entry)   |
|  התראות: notifications_outbox (029) + push_subscriptions      |
|  תשתית: audit_log, rate limits (002/019), storage, agents(028)|
+--------------------------------------------------------------+
```

- **קטלוג הוא לא ליבה.** לכל ורטיקל הדומיין שלו: לקומרס `products`,
  למשלוחי אוכל יהיו `restaurants`/`menus`, להסעות אין קטלוג בכלל. ניסיון
  לכפות "קטלוג גנרי" הוא הטעות הקלאסית של super-apps; לא עושים את זה.
- **הליבה לעולם לא מייבאת מורטיקל. ורטיקל לעולם לא מייבא מורטיקל אחר.**

### 2.2 חוזה C1: זהות והרשאות

- `profiles` + `user_role` נשארים המקור היחיד לזהות. לא מוסיפים ערכי enum
  פר ורטיקל (אותו נימוק כמו ב-027 סעיף 2.1: `ALTER TYPE ADD VALUE` שביר,
  ו-role הוא שער גס בלבד).
- **תבנית ה-membership של 027 היא החוזה.** כמו ש-`supplier_members`
  (owner/manager/scanner) מגדיר מי מפעיל עסק, ורטיקל חדש מביא טבלת
  membership משלו באותה תבנית בדיוק:

```
supplier_members  (קיים, 027)   ->  is_supplier_member()
courier_members   (food, עתידי) ->  is_courier_member()
driver_members    (rides, עתידי)->  is_driver_member()
```

- כל טבלת membership מגיעה עם פונקציות עזר SECURITY DEFINER משלה (שוברות
  רקורסיית RLS), RLS משלה, ו-audit trigger מ-025. משתמש אחד יכול להיות
  לקוח בורטיקל אחד ומפעיל בורטיקל אחר; אין שום קשר בין החברות שלו בשניהם.

### 2.3 חוזה C2: מעטפת הכסף

ההחלטה המרכזית של המסמך: **`orders` היא מעטפת התשלום האוניברסלית של כל
הורטיקלים**, לא טבלה של הקומרס.

- מוסיפים (במיגרציה עתידית) עמודה אחת: `orders.vertical` (ברירת מחדל
  `'shop'`). זה כל השינוי במעטפת.
- ורטיקל חדש מוסיף detail tables משלו שמפנות אל המעטפת, ולא נוגע בשום
  טבלת כסף:

```
food:  delivery_jobs (order_id FK, restaurant_id, courier_id, eta, geo...)
rides: ride_details  (order_id FK, driver_id, pickup, dropoff, route...)
```

- מה מתקבל בחינם עבור כל ורטיקל חדש, בלי שורת קוד כספית אחת:
  - `payments` + `payment_webhook_events` (Cardcom, idempotency, replay
    protection, T3 מ-026)
  - refund flow, reconciliation מול Cardcom (027 סעיף 5.3)
  - snapshot של `platform_percent` פר שורה (`order_items`), settlement
    לספקים/מסעדות/נהגים דרך מנוע ה-statements של 027
  - cashback והחלת ארנק בצ'קאאוט
- **הארנק**: ורטיקל לא כותב לטבלאות הארנק לעולם. הוא קורא ל-
  `fn_wallet_transfer()` בלבד, עם שני כללי namespace:
  1. ערכי `wallet_reason` חדשים נוספים במיגרציה של הורטיקל
     (למשל `ride_fare`, `food_refund_credit`).
  2. `idempotency_key` עם קידומת ורטיקל: `food:order:<uuid>:cashback`.
- זה מה שהופך את הארנק ל"רקמה מחברת": יתרה שנצברה מקופון ניתנת לבזבוז על
  נסיעה, כי שניהם רק תנועות journal מול אותם חשבונות פלטפורמה.

### 2.4 חוזה C3: התראות

שירות אחד (סעיף 4), עם registry של topics בקונבנציית שמות:

```
<vertical>.<entity>.<event>
shop.order.paid | shop.coupon.expiring | food.courier.assigned | rides.driver.arrived
```

ורטיקל שולח דרך פונקציה אחת בצד השרת (`notify(user_id, topic, payload)`),
וה-preferences, חוק הספאם, quiet hours וה-log נאכפים במקום אחד, לא פר
ורטיקל.

### 2.5 חוזה C4: מבנה קוד וגבולות מודולים

```
src/app/(shop)/...            route group פר ורטיקל, layout משלו
src/app/(food)/...
src/components/<vertical>/    UI פרטי לורטיקל
src/components/shared/, ui/   ליבה בלבד
src/server/actions/<vertical>/  server actions פרטיים
src/server/actions/payments/  ליבה: Cardcom בלבד (כלל קיים)
supabase/migrations/          קידומת בתיאור: "food:", "rides:"
```

- אכיפה סטטית: חוק import ב-biome (או בדיקת CI פשוטה): קובץ תחת
  `(food)` לא מייבא מ-`(rides)` ולא להפך; שניהם מייבאים מ-shared/ui/lib.
- אין FK בין טבלאות של שני ורטיקלים. FK מותר רק אל הליבה
  (orders, profiles, wallet, notifications).

### 2.6 רישום ורטיקלים ו-kill switch

טבלת `verticals` (עתידית, בליבה): `key`, `title_he`, `icon`, `status`
(`hidden/beta/active/paused`), `sort_order`, `min_users_percent`
(rollout הדרגתי). דף ה-hub וה-ניווט נבנים ממנה. `paused` מוריד ורטיקל
מה-UI מיידית בלי deploy, באותו דפוס כמו ה-kill switch של `agent_prompts`
(028 סעיף 1.2). כשל בורטיקל אחד (למשל ספק מפות של rides קורס) לא נוגע
באחרים: אין תלות קוד, אין תלות סכימה, רק המעטפות המשותפות.

---

## 3. ארנק קופונים offline-first

### 3.1 מה חייב לעבוד בלי רשת

תרחיש הקצה: לקוח עומד בקופה במרתף בלי קליטה, וצריך להציג QR. לכן:

- **צד הלקוח (הצגה): offline מלא, תמיד.** ה-QR מרונדר בצד הלקוח מתוך
  `qr_token` השמור מקומית; אין תלות בתמונה מהשרת ואין קריאת רשת בזמן
  ההצגה.
- **צד הסורק (מימוש): אימות אותנטיות offline, חד-פעמיות online בלבד.**
  בדיוק גבול האחריות שהוגדר ב-027 סעיף 3.1, בלי שינוי.

### 3.2 אחסון מקומי (צד לקוח)

עקבי עם `docs/ARCHITECTURE-ACCOUNT-IDENTITY.md` סעיף 4.2 (אותה אסטרטגיה
בדיוק); כאן הפירוט המלא.

- IndexedDB, store בשם `coupon_wallet`, רשומה פר קופון:

```
{ coupon_id, code, qr_token, qr_key_id, product_name, business_name,
  face_value_ils, collect_amount_ils, expires_at, status, updated_at }
```

- service worker (Serwist) עושה precache ל-app shell של מסך הארנק, כך
  שגם הניווט אל `/account/wallet` עובד offline, לא רק הדאטה.
- **iOS eviction**: Safari רשאי לפנות storage של אתר לא מותקן אחרי אי
  שימוש ממושך. לכן ה-IDB הוא cache בלבד: כל פתיחת אפליקציה מרעננת אותו
  מהשרת, והתקנה למסך הבית (שלב 1, סעיף 6) מקשיחה את ההתמדה. אין מצב שבו
  אובדן ה-cache מאבד קופון, כי השרת הוא האמת.
- אין שום סוד באחסון: `qr_token` הוא bearer של הלקוח עצמו, והחתימה ממילא
  לא מקנה מימוש (רק אותנטיות). נעילה ביומטרית של מסך הארנק היא תוספת
  עתידית בשלב עטיפת ה-Capacitor.

### 3.3 אסטרטגיית סנכרון

- **משיכה**: בכל פתיחת אפליקציה + בכל focus, שאילתת דלתא לפי cursor:
  `coupon_codes` של המשתמש עם `updated_at > last_sync` (ה-RLS הקיים מ-008
  כבר מגביל ל-user_id שלו). תוצאה ריקה = סנכרון בחינם.
- **דחיפה**: push בנושא `shop.coupon.issued` (אחרי תשלום) ו-
  `shop.coupon.redeemed` מפעיל סנכרון ברקע, כך שקופון חדש מגיע לארנק
  לפני שהלקוח פותח את המסך.
- **קונפליקטים אין**: סטטוס קופון נע בכיוון אחד בלבד
  (`issued -> used/expired/refunded`, מכונת המצבים של 026 סעיף 3.3),
  והשרת הוא הכותב היחיד. הלקוח לעולם לא כותב סטטוס; המקומי נדרס תמיד.
- באנר "עודכן לאחרונה לפני X" כשאין רשת, כדי שקופון שמומש ממכשיר אחר לא
  יפתיע בקופה.

### 3.4 אימות חתום offline (צד סורק הספק)

- טוקן: `KE1.<base64url(payload)>.<base64url(sig)>`, Ed25519, כמוגדר
  ב-027 סעיף 3.1. ה-payload כולל `cid`, `c` (הקוד הידני), `sid` (ספק),
  `exp`, `v`.
- סורק ה-PWA מטמיע מפת מפתחות ציבוריים לפי `kid` (מ-`qr_key_id`),
  ומרענן אותה מנקודת קצה ציבורית בכל טעינה online. רוטציה: מפתח חדש
  נכנס לרשימה, ישנים נשארים לאימות קופונים שהונפקו לפניו.
- בדיקה offline בסורק: חתימה תקפה + `exp` בעתיד + `sid` שלי. עובר?
  מוצג "קופון תקין, נדרש אישור אונליין" והמימוש נכנס לתור סנכרון
  (`redeem_intents` ב-IDB של הסורק: code, מועד, מכשיר).
- בחזרת רשת: התור מנוקז אל `redeem_coupon()` אחד-אחד. ה-UPDATE האטומי
  הוא שיפוט הסופי; `already_used` על intent מהתור מוצג לספק כהתראה
  (ייתכן כפל מול סריקה ממכשיר אחר).
- **הכלל העסקי לא מתרכך**: לא מוסרים סחורה לפני אישור online (027,
  איום 5.2/6.2). ה-offline flow קיים כדי שהקופה לא תיתקע, לא כדי לוותר
  על אכיפת חד-פעמיות.

---

## 4. התראות push

### 4.1 תשתית: 029 היא הבסיס, חסרה רק שכבת ה-push

מיגרציה 029 (טיוטה, `docs/ARCHITECTURE-ACCOUNT-IDENTITY.md`) כבר מגדירה
את שתי אבני היסוד:

- `notifications_outbox`: תור שליחה גנרי (kind, channel email/push/inapp,
  scheduled_for, dedup, סטטוס), כולל `fn_enqueue_coupon_expiry_reminders`.
- `user_notification_preferences`: העדפות פר משתמש (כרגע עמודות boolean
  פר סוג, למשל `coupon_expiry_email/inapp`).

מה שמסמך זה מוסיף עליהן (מיגרציה עתידית, לא כאן):

```
push_subscriptions        חדש: user_id, endpoint UNIQUE, p256dh, auth,
                          user_agent, locale, platform(web/apns/fcm),
                          last_seen_at, failed_count (מחיקה אחרי N כשלי 410)
user_notification_preferences   הרחבה: הסכמת שיווק עם audit מלא לחוק הספאם:
                          marketing_opted_in, consent_source,
                          consent_text_version, consented_at, revoked_at
notifications_outbox      הרחבה: kind בקונבנציית topics של סעיף 2.4
                          (shop.coupon.expiring וכד') כשהוורטיקלים יגיעו
```

- שליחה: worker שמנקז את ה-outbox (cron), וב-channel `push` שולח דרך
  `web-push` (VAPID) לפי מתכון ה-PWA בתיעוד המקומי של Next 16
  (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`).
- ה-dedup של ה-outbox הוא ההגנה מכפילויות: תזכורת `expiry:<coupon_id>:7d`
  נשלחת פעם אחת ויחידה, גם אם ה-cron רץ פעמיים.

### 4.2 שלוש מחלקות תוכן, ומה מותר לשלוח בלי הסכמה

| מחלקה | דוגמאות | בסיס משפטי |
|---|---|---|
| תפעולי (service) | ההזמנה שולמה, החבילה נשלחה, קופון הונפק, קבלה על מימוש, "הנהג בדרך" | הודעת שירות על עסקה שהמשתמש יזם. לא "דבר פרסומת". נשלח כברירת מחדל, עם אפשרות כיבוי |
| תזכורות תוקף | "הקופון שלך פג בעוד 3 ימים" | מתייחס למוצר ששולם, האינטרס של הלקוח מובהק. מסווג service. עמדה מומלצת, טעונה אישור יועץ (שאלה פתוחה 8.3) |
| שיווקי | דילים חדשים, מבצעי cashback, "חזרנו עם..." | **דבר פרסומת. opt-in מפורש בלבד** |

### 4.3 מודל ההסכמה מול חוק הספאם

הבסיס: סעיף 30א לחוק התקשורת (בזק ושידורים) (תיקון 40, 2008) אוסר משלוח
"דבר פרסומת" בלי הסכמה מפורשת מראש, בערוצים המנויים בחוק (הודעה
אלקטרונית, SMS, פקס, חייגן אוטומטי). push לא מנוי בחוק במפורש, אבל
ההחלטה התכנונית כאן: **מחילים על push שיווקי את מלוא משטר 30א**, משלוש
סיבות: זה עתיד-בטוח רגולטורית, זה ממילא ה-UX הנכון, וזה מאחד מדיניות
אחת לכל הערוצים (כשיתווספו SMS/מייל, שכן מנויים בחוק, שום דבר לא ישתנה).

כללי היישום:

1. **opt-in מפורש, לעולם לא checkbox מסומן מראש.** ההסכמה נאספת בהקשר
   (אחרי רכישה ראשונה: "רוצה לקבל דילים לפני כולם?"), לא כתנאי לרכישה.
2. **תיעוד הסכמה מלא**: `consented_at`, `consent_source` (איזה מסך),
   `consent_text_version` (נוסח ההסכמה שהוצג). זו ההגנה בתביעת ספאם
   (החוק מקנה פיצוי ללא הוכחת נזק עד 1,000 ש"ח להודעה). זו ההרחבה
   הנדרשת מעל ה-booleans של 029.
3. **זיהוי שולח**: כל הודעה שיווקית פותחת ב"קניון EXPRESS" ומסומנת
   כפרסומת היכן שהערוץ דורש (ב-SMS עתידי: המילה "פרסומת" בתחילת ההודעה).
4. **הסרה בקליק**: כל הודעה שיווקית נושאת deep link למסך
   `/account/notifications`; ההסרה חלה מיידית (שורת revoke ב-preferences)
   ובאותו ערוץ שבו הגיעה ההודעה, בחינם.
5. **ברירות מחדל**: תפעולי on, תזכורות תוקף on (עם כיבוי), שיווקי off.
6. **ריסון מוצרי** (מדיניות, לא חוק): תקרת הודעות שיווקיות (למשל 2
   בשבוע), שעות שקט 21:00 עד 08:00, ושבת. נאכף ב-`notify()` המרכזי.

### 4.4 תזמון תזכורות תוקף

- הצנרת כבר מתוכננת ב-029: cron יומי קורא ל-
  `fn_enqueue_coupon_expiry_reminders()` שמכניס שורות ל-outbox עם dedup,
  ו-worker מנקז לפי `scheduled_for`. התוספת של מסמך זה: ה-worker שולח
  גם ב-channel `push` (דרך `push_subscriptions`), לא רק מייל/in-app.
- אותו cron הוא גם הרץ הטבעי של `expire_coupons()` (קיים ב-027).

---

## 5. Deep links ושיתוף WhatsApp

### 5.1 עיקרון: כתובת https אחת לכל דבר

אין scheme פרטי (`kenyon://`). כל יעד הוא URL קנוני באתר, מה שאומר
שקישור עובד היום בדפדפן, מחר ב-PWA מותקן, ומחרתיים בעטיפת החנות, בלי
שינוי:

```
/products/[slug]          מוצר
/category/[slug]          קטגוריה
/deals/[slug]             דיל קופון
/account/wallet           הארנק שלי
/account/coupons/[id]     קופון ספציפי (יעד ה-push של תזכורת תוקף)
/supplier/scan            סורק הספק
/r/[code]                 קישור שיתוף קצר (redirect + מדידה)
```

בשלב העטיפות (סעיף 6): `assetlinks.json` (Android App Links, נדרש ממילא
ל-TWA) ו-apple-app-site-association (iOS Universal Links) גורמים לאותם
URLs בדיוק להיפתח באפליקציה המותקנת. deferred deep link (התקנה מתוך
קישור): ב-Android דרך install referrer; ב-iOS נשארים עם פתיחה בדפדפן,
פתרון מלא הוא שאלה פתוחה 8.5.

### 5.2 שיתוף יוצא (לקוח משתף דיל)

- כפתור שיתוף = `navigator.share()` (native sheet, כולל WhatsApp) עם
  fallback לקישור `https://wa.me/?text=<encoded>`.
- הקישור המשותף הוא `/r/[code]` קצר, שמפנה ליעד ונושא ייחוס:
  `?ref=<affiliate_or_referral_code>`. הייחוס נשמר 30 יום (המנגנון של
  010: `profiles.affiliate_code`, `referrals`, עמודות
  `total_clicks/conversions` ב-`affiliates`). route ה-redirect הוא נקודת
  המדידה של clicks.
- תגיות OG בעברית פר מוצר/דיל (תמונה, מחיר, שם עסק) כדי שהתצוגה
  המקדימה ב-WhatsApp תמכור בעצמה. `og:locale` = `he_IL`, טקסט קצר בלי
  תלות בכיווניות (WhatsApp מציג RTL אוטומטית לפי תוכן).
- **לעולם לא משתפים קופון עצמו**: לא `qr_token` ולא קוד 8 ספרות בשום
  קישור שיתוף. משתפים את הדיל; הקופון נשאר בארנק של הרוכש בלבד
  (עולה בקנה אחד עם איום 6.2 של 027).

### 5.3 שיחות WhatsApp נכנסות (לקוח אל עסק)

- דף מוצר/דיל מציג "שאלה לעסק? WhatsApp" עם
  `https://wa.me/<business_whatsapp>?text=<שם הדיל + קישור>`.
  השדה `business_whatsapp` כבר מתוכנן בטבלת `products`
  (STATE.md, שדות דף המוצר).
- הודעות תפעוליות יוצאות ב-WhatsApp (אישור הזמנה, קופון) דורשות
  WhatsApp Business API דרך ספק (Twilio/360dialog וכד'), בתשלום פר
  הודעה, וכפופות גם הן ל-30א כשהן שיווקיות. לא בשלב הזה: push + מייל
  מכסים. שאלה פתוחה 8.6.

---

## 6. מסלול מיגרציה: מאתר רספונסיבי לאפליקציה מותקנת

עיקרון המסלול: **בשום שלב לא נבנה מחדש הקומרס.** כל שלב הוא תוספת על
אותו codebase, וכל שלב עומד בפני עצמו עם שער יציאה מדיד.

### שלב 0 (תנאי מוקדם, לא חלק מהמובייל): סגירת הליבה המסחרית

- יישוב התנגשות 026/027 (`payout_status` + שני מנועי settlement; שאלה
  פתוחה 9.1 של 028, ההמלצה שם: 027 קובעת), החלת המיגרציות דרך MCP
  `apply_migration`, בניית checkout מלא מול Cardcom.
- בלי זה אין מה להתקין: אפליקציה היא ערוץ, לא מוצר.

### שלב 1: PWA foundation (האתר הופך להתקנה)

- `app/manifest.ts` (שם, אייקונים 192/512, `display: standalone`,
  `start_url: /`, `dir: rtl`, `lang: he`).
- service worker עם Serwist: precache ל-app shell, runtime cache
  network-first לדפי תוכן, cache-first לתמונות מ-Supabase storage.
- ארנק הקופונים ה-offline (סעיף 3) הוא ה-feature המכונן של השלב: הוא
  הסיבה שלקוח מתקין.
- תשתית push (סעיף 4.1) + הפעלה ב-Android/desktop. מסך
  `/account/notifications` עם מודל ההסכמה.
- prompt התקנה מותאם: ב-Android דרך `beforeinstallprompt` ברגע ערך
  (אחרי רכישה ראשונה, "הקופון בארנק, התקן כדי לגשת אליו גם בלי רשת");
  ב-iOS מסך הדרכה "הוסף למסך הבית" (אין prompt מערכתי).
- **שער יציאה**: התקנה עובדת בשני בתי היום; QR מוצג במטוס-mode בשטח;
  push נוחת ב-Android; Lighthouse installable נקי.

### שלב 2: UX של אפליקציה

- ניווט תחתון קבוע במובייל (בית, קטגוריות, ארנק, חשבון), דף hub שנבנה
  מ-registry הורטיקלים (סעיף 2.6, בשלב זה ורטיקל אחד: shop).
- מרכז התראות in-app (נשען על `notifications_outbox` ב-channel inapp),
  badge על הארנק.
- iOS: אחרי התקנה למסך הבית push עובד גם שם (16.4+); ה-onboarding של
  ההתקנה הוא הממיר המרכזי ב-iOS בשלב הזה.
- **שער יציאה**: שיעור התקנות ושיעור הסכמת push נמדדים; זמן טעינה חוזרת
  (shell מה-cache) מתחת לשנייה.

### שלב 3א: Google Play דרך TWA

- Bubblewrap עוטף את ה-origin הקיים כ-Trusted Web Activity + פרסום
  ב-Play. אפס כפילות קוד; נדרש רק `assetlinks.json` וחתימת APK.
- push נשאר Web Push (עובד ב-TWA כרגיל). התשלום נשאר Cardcom (מוצרים
  ושירותים פיזיים, מחוץ ל-Play Billing כדין).
- **שער יציאה**: האפליקציה ב-Play, deep links נפתחים בה, דירוג תקין.

### שלב 3ב: App Store דרך Capacitor (רק כשנדרש)

- טריגר עסקי, לא טכני: נתח iOS גבוה עם שיעור התקנת PWA נמוך, או צורך
  ב-push למשתמשי iOS שלא מתקינים.
- Capacitor shell שטוען את אפליקציית ה-web, בתוספת יכולות native אמיתיות
  (דרישת 4.2 של Apple): APNs push דרך plugin (טבלת `push_subscriptions`
  מקבלת עמודת `platform` ו-token native; ה-`notify()` המרכזי מפצל
  web-push/APNs), סורק מצלמה native ב-`/supplier/scan`, ביומטריה לנעילת
  ארנק, Wallet pass לקופון (nice-to-have).
- הקוד המסחרי לא משתנה: אותם server actions, אותו session של Supabase.
- **שער יציאה**: אישור review; קופון נרכש ב-iOS app נסלק ב-Cardcom
  ותקין מול 3.1.5.

### שלב 4: הפעלת מסגרת הורטיקלים

- מיגרציית ליבה: `verticals` registry + `orders.vertical` + הרחבות
  ההתראות מסעיף 4.1 (אם טרם הוחלו בשלב 1).
- הורטיקל החדש הראשון (למשל משלוחי אוכל) נבנה לפי החוזים של סעיף 2:
  route group משלו, membership משלו (`courier_members`), detail tables
  על מעטפת `orders`, topics משלו, אפס נגיעה ב-shop.
- ההוכחה שהארכיטקטורה עובדת: ה-PR של הורטיקל הראשון לא נוגע באף קובץ
  של ורטיקל קיים, רק מוסיף.

---

## 7. סיכום החלטות

| # | החלטה |
|---|---|
| D1 | פלטפורמה: PWA על ה-Next הקיים; עטיפות חנות דקות בהמשך (TWA ל-Play, Capacitor ל-App Store); לא React Native ולא native |
| D2 | הלקוח הוא תמיד אפליקציית ה-web: אין BFF, אין REST layer, ה-server actions וה-RLS נשארים הממשק היחיד |
| D3 | `orders` הופכת למעטפת התשלום האוניברסלית (עמודת `vertical`); ורטיקל חדש = detail tables בלבד, כל הכסף בצינורות הקיימים |
| D4 | הארנק חוזה יחיד: `fn_wallet_transfer()` עם `wallet_reason` ו-idempotency key בעלי namespace פר ורטיקל |
| D5 | הרשאות מפעילים פר ורטיקל בתבנית `supplier_members` (membership + פונקציות definer), לא ערכי enum חדשים ב-role |
| D6 | ארנק קופונים offline: IndexedDB כ-cache, רינדור QR מקומי מ-`qr_token`, סטטוסים חד-כיווניים, השרת תמיד אמת |
| D7 | מימוש offline בסורק: אימות Ed25519 בלבד; חד-פעמיות נשארת ב-`redeem_coupon()` online; אין מסירת סחורה לפני אישור |
| D8 | push שיווקי מטופל כ"דבר פרסומת" לפי סעיף 30א גם שהחוק לא מונה push: opt-in מפורש, תיעוד הסכמה, הסרה בקליק; תפעולי כברירת מחדל |
| D9 | deep links = https בלבד, בלי scheme פרטי; שיתוף תמיד של הדיל (עם ייחוס `/r/[code]`), לעולם לא של הקופון עצמו |
| D10 | מסלול מדורג 0 עד 4 שבו הקומרס לא נבנה מחדש באף שלב; כל שלב עם שער יציאה מדיד |

## 8. שאלות פתוחות

1. **סדר החלת ההתראות**: 029 (outbox + preferences) קודמת; ההרחבות של
   סעיף 4.1 (push_subscriptions + audit הסכמת שיווק) במיגרציה נפרדת אחרי
   029, לפני שלב 1 של המובייל. אישור סדר?
2. **domain קבוע ל-production**: TWA, Universal Links וקבצי ה-asset
   links דורשים origin סופי. מה הדומיין הקנוני?
3. **סיווג תזכורות תוקף כהודעת שירות** (לא פרסומת): עמדה מומלצת במסמך,
   דורשת אישור יועץ משפטי יחד עם שאלת תוקף השוברים (שאלה 9.3 של 027).
4. **מפתח iOS Developer וחשבון Play**: נדרשים רק בשלב 3; למי יירשמו
   (עוסק/חברה) ומתי לפתוח?
5. **deferred deep linking ב-iOS**: אין פתרון נקי בלי SDK ייחוס צד ג'
   (Branch/AppsFlyer, כסף ופרטיות). לחיות בלי? החלטה בשלב 3ב.
6. **WhatsApp Business API**: הודעות תפעוליות ב-WhatsApp הן upgrade
   מובהק בשוק הישראלי אבל בתשלום פר הודעה ודורשות ספק. לתמחר בשלב 2?
7. **ביומטריה לארנק**: נעילת מסך הקופונים ב-Face ID/טביעת אצבע אפשרית
   רק בעטיפת Capacitor (שלב 3ב) או דרך WebAuthn כבר ב-PWA. נדרש בכלל?
8. **retention ל-`notifications_log`**: append-only שגדל מהר (כמו שאלה
   9.4 של 028 לגבי agent_run_steps). purge אחרי 90 יום?
