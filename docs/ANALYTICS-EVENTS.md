# ANALYTICS-EVENTS — הטקסונומיה, ולאן כל אירוע באמת מגיע

נמדד מול פרודקשן (`ixvwfbuvfxxsjiywhbbb`) ב-09.09.2026. טבלת האירועים כאן
נוצרת מ-`src/lib/analytics/events.ts`, וטסט סחיפה
(`src/lib/analytics/docs-events.test.ts`) מאדים ביום שהיא תיפרד מהקוד.

## ‏1. הטקסונומיה

| אירוע | מקור | props חובה |
| --- | --- | --- |
| `page_view` | לקוח | — |
| `view_product` | לקוח | `product_id` |
| `view_category` | לקוח | `category_id` |
| `add_to_cart` | לקוח | `product_id`, `quantity` |
| `remove_from_cart` | לקוח | `product_id` |
| `checkout_step` | לקוח | `step` |
| `web_vital` | לקוח | `metric`, `value` |
| `whatsapp_click` | לקוח | — |
| `begin_checkout` | שרת | — |
| `purchase` | שרת | — |
| `voucher_redeemed` | שרת | — |
| `order_refunded` | שרת | — |

- ‏`checkout_step.step` ∈ `identity`, `address`, `payment_redirect`.
- ‏`web_vital.metric` ∈ `LCP`, `CLS`, `INP`, `TTFB`, `FCP`.
- אצווה מקסימלית ‏20 אירועים; ‏`props` מוגבל ל-4096 בתים, אותו סף בדיוק
  שהפונקציה במסד אוכפת, כדי שאירוע גדול מדי ייפסל לפני סבב רשת.
- ‏**`whatsapp_click` נמצא בטקסטונומיה ואין לו פולט.** הוא ברשימה הלבנה
  הפרוסה, ולכן הוא כאן: הקלקה על וואטסאפ היא יציאה שהמשפך אינו רואה אחרת,
  והשם לא צריך להיות מומצא מחדש אחרת ביום שהכפתור יתחיל לדווח.

## ‏2. שני מסלולים, ושתי הבטחות שונות

| | אירועי לקוח | אירועי שרת |
| --- | --- | --- |
| מי פולט | הדפדפן, דרך `POST /api/a` | ‏`trackServerEvent` בשרת |
| הסכמת עוגיות | **חובה.** בלי `ke_consent=granted` הבקשה מחזירה ‏204 ולא נכתב כלום | **אינה חלה.** אלה רשומות של עסקה שהמשתמש יזם, לא טלמטריה של דפדפן |
| רייט-לימיט | ‏`analytics` — 120 לדקה לפי ‏IP | אין; אין קורא ציבורי |
| יעד ראשון | ‏`analytics_events` דרך `fn_ingest_analytics_events` | אותה פונקציה בדיוק |
| יעד שני | ‏PostHog / GA4 / Meta לפי `third-party.ts` | ‏PostHog, דרך ה-fan-out ב-`track.ts` |

**הפונקציה היא השער היחיד.** גם הדפדפן וגם השרת עוברים דרך
`fn_ingest_analytics_events`, שמסננת כל שם מול רשימה לבנה ו-`CONTINUE` על כל
מה שאינו עליה — **בלי שגיאה, בלי לוג, ‏HTTP 200** — ומחזירה כמה שמרה.

## ‏3. מה שהיה שבור, ומה בדיוק תוקן

הפרויקט רשם ש-`purchase`, ‏`begin_checkout`, ‏`voucher_redeemed`
ו-`order_refunded` מחזירים **0 שורות בשקט**, ותלה את זה ברשימה הלבנה.
**נמדד ב-09.09.2026, בטרנזקציות שהתגלגלו אחורה, אפס שאריות:**

| מה נשלח | תוצאה |
| --- | --- |
| ארבעת השמות **עם** ‏`session_id` | ‏1 מתוך 1 לכל אחד, ‏4 שורות נחתו |
| שם מומצא | ‏0 מתוך 1 — הרשימה הלבנה עדיין עובדת |
| ארבעת השמות **בלי** ‏`session_id` | ‏**23502**, ‏"null value in column session_id violates not-null constraint", אפס שורות |

כלומר ‏**180 הוחלה והרשימה הלבנה כבר לא הסיבה.** מה שנשאר היה
‏`analytics_events.session_id` שהוא **NOT NULL** בזמן ש-`trackServerEvent`
שלח `session_id: anonymousId`, שהוא ‏null בכל בקשה בלי עוגיית ‏guest session.
‏PostgREST מחזירה את השגיאה במקום לזרוק אותה, הקורא רושם
`analytics.track_failed` וממשיך, והאירוע אבד.

**וזה בדיוק שלושה מתוך הארבעה,** כי העוגייה קיימת רק כשהבקשה הגיעה דרך
החנות בדפדפן של הקונה עצמו:

| אירוע | ההקשר | היה נוחת? |
| --- | --- | --- |
| ‏`begin_checkout` | קונה בצ'ק-אאוט | ‏**כן** |
| ‏`purchase` | ‏finalize, מאחורי החזרה מ-Cardcom | לא |
| ‏`order_refunded` | פעולת אדמין, דפדפן של אדמין | לא |
| ‏`voucher_redeemed` | קופה של ספק, ראוט ‏API בלי דפדפן שלנו | לא |

האירוע היחיד שהיה לו ‏session הוא זה שלפני שהכסף זז, וכל שלושת אלה שמדווחים
שהכסף **באמת** זז לא נחתו.

**התיקון:** ‏`session_id` נופל ל-`server:<event_id>` כשאין ‏session אמיתי.
פר אירוע ולא פר משתמש — סמן לפי משתמש היה מכווץ חודשים של אירועי שרת לא
קשורים ל"session" אחד ונקרא כאמיתי. ‏`anonymous_id` נשאר ‏null ביושר, והוא
‏nullable. **אין בפרודקשן שום ‏view או ‏matview שקורא את `analytics_events`**,
ואף שאילתה באפליקציה אינה מקבצת לפי ‏`session_id`, ולכן זה אינו יכול לעוות
מדידה קיימת. נעוץ ב-`src/server/analytics/server-event-session-id.test.ts`.

## ‏4. פרטיות: מה לא נשמר

- **‏IP אינו נשמר.** ‏`/api/a` מעביר את הכתובת כ-`p_ip`, ולטבלה
  ‏`analytics_events` **אין עמודת ‏IP כלל** — הפונקציה הפרוסה מתעלמת
  מהפרמטר. כלומר האנונימיזציה כאן היא אי-שמירה ולא ערפול, וזו התכונה החזקה
  יותר. **הפרמטר עצמו מת** ונשאר בחתימה; תועד ולא הוסר, כי הסרה היא שינוי
  חתימה של פונקציה במסד.
- ‏`user_agent` נשמר, חתוך ל-400 תווים.
- ‏`props` הוא ‏jsonb חופשי-למחצה אבל תחום: אובייקט שטוח, ‏4KB, וללא ‏PII
  במוסכמה. ה-fan-out ל-PostHog מעביר **רק** סקלרים ורק מתוך רשימה סגורה
  (`order_id`, `code`, `product_id`, `payment_id`, `step`), כדי שהזמנה או
  פרופיל שלמים לא ייצמדו בטעות.
- **כסף לעולם אינו נכתב כאן.** ההכנסה נקראת מ-`orders` ו-`order_items`.

## ‏5. זהות, ולמה ‏`user_id` הוא דווקא הנפילה האחרונה

`serverDistinctId` בוחר, לפי סדר: עוגיית ה-PostHog של הדפדפן, ואז מזהה
ה-guest session, ואז ‏`user_id`. **‏`user_id` אחרון בכוונה:** ‏PostHog מחבר
משפך לפי ‏`distinct_id` בלבד, ולכן העדפה שלו הייתה מפצלת כל קונה מחובר לחצי
גלישה אנונימי ולחצי רכישה נפרד. ‏`linkAnalyticsIdentity` רושם את הקשר
guest→user לטבלאות הראשוניות, ושם השאלה נענית כמו שצריך.

## ‏6. הסכמה, וגרסת הנוסח

`ke_consent` נשמר כ-`<decision>.<wordingVersion>`. **הגרסה אינה קישוט:**
היא עלתה מ-1 ל-2 ב-10.08 כי הבאנר הבטיח "בלי העברה לצד שלישי", ו-GA4 ופיקסל
של ‏Meta הפכו את המשפט הזה ללא נכון. הסכמה שניתנה לנוסח הישן אינה יכולה
לכסות את גוגל ומטא, ולכן כל מבקר נשאל מחדש. תוקף העוגייה ‏12 חודשים.

`web_vital` יושב מאחורי אותו שער למרות שאינו התנהגותי, כי הוא רוכב על אותו
צינור ועל אותם מזהי ‏session.

## ‏7. שאלה פתוחה שלא הוכרעה כאן

‏`voucher_redeemed` נשלח עם ‏`userId` של **חבר הצוות בקופה**, לא של הלקוח
שהשובר שלו נשרף. זו החלטת מודל ולא באג, והיא משפיעה על כל משפך שמנסה לעקוב
אחרי לקוח יחיד מרכישה למימוש. תועד ולא שונה.

## ‏8. ‏PostHog: השמות שהמשפך בנוי עליהם (05.10.2026, W11)

‏PostHog הוא היעד השלישי, ולו טבלת שמות אחת, ‏`src/lib/analytics/posthog-names.ts`,
ששני ה-fan-outs עוברים דרכה (`commerce-client.ts` בדפדפן, ‏`track.ts` בשרת).
הסיבה: שני צינורות אחרים קובעים שמות שאינם שלנו, ‏GA4 דורש ‏`view_item`
והרשימה הלבנה הפרוסה ב-`fn_ingest_analytics_events` מחזיקה ‏`voucher_redeemed`
ואינה משתנה בלי מיגרציה. ל-PostHog אין מגבלה כזאת, ומי שקורא את המשפך קיבל את
ששת השמות שלמטה. **לפני הטבלה שניים מהשישה הגיעו בשם אחר** ולוח שנבנה על
הרשימה הראה אפס צפיות ואפס מימושים בזמן ששניהם נשלחו.

| שם ב-PostHog | מגיע מ- | הפולט | שער הסכמה |
| --- | --- | --- | --- |
| `view_product` | ‏`view_item` של ‏GA4 | ‏`ViewTracker` → ‏`trackCommerce` | ‏`ke_consent` בדפדפן |
| `add_to_cart` | אותו שם | ‏`AddToCartButton` → ‏`trackCommerce` | ‏`ke_consent` בדפדפן |
| `begin_checkout` | אותו שם | ‏`CheckoutForm` (דפדפן) **וגם** ‏`beginCheckout` (שרת, עם ‏`order_id`) | דפדפן כן, שרת לא |
| `purchase` | אותו שם | ‏`finalizeOrder` בלבד, לעולם לא מהדפדפן | אין |
| `gift_sent` | **‏PostHog בלבד** | ‏`finalizeOrder` כשמייל מתנה נכנס לתור (`channel=purchase`), ‏`transferVoucher` (`channel=transfer`) | אין |
| `coupon_redeemed` | ‏`voucher_redeemed` של הרשימה הלבנה | מסלול הקופה ‏`/api/supplier/vouchers/redeem` | אין |

- ‏`begin_checkout` מגיע פעמיים לאותו ‏`distinct_id`, פעם מהדפדפן עם הערך ופעם
  מהשרת עם מזהה ההזמנה. משפך ב-PostHog סופר אנשים ולא אירועים, ולכן זה אינו
  מכפיל המרות; ספירת אירועים גולמית תראה כפול. תועד ולא שונה.
- ‏`gift_sent` אינו ברשימה הלבנה הפרוסה ולכן אינו עובר ב-`trackServerEvent`
  (שהיה מפיל אותו בשקט עם ‏HTTP 200 ושורת ‏`analytics.event_rejected` לכל מתנה);
  הוא נשלח דרך ‏`trackPostHogServerEvent`. הרשומה הראשונית של מתנה היא שורת
  האודיט של ‏`recordGiftAudit`.
- ‏`$identify` נשלח מהשרת בכל אחד משלושת מסלולי הכניסה (`signInWithEmail`,
  ‏`verifyPhoneOtp`, ‏`/auth/callback`) עם ‏`distinct_id` = מזהה ה-auth
  ו-`$anon_distinct_id` = עוגיית ה-PostHog של הדפדפן (או מזהה ה-guest session).
  **מותנה בהסכמה, בניגוד לאירועי הכסף**: הוא קיים רק כדי לחבר גלישה לאדם, וזה
  בדיוק מה שהבאנר שואל עליו. בלי ‏`ke_consent=granted.<גרסה נוכחית>` לא נשלח
  דבר. בלי אימייל, בלי שם, בלי ‏`$set`.
- אימות מקומי בלי מפתח: ‏`scripts/posthog-sink.mjs` מקשיב כ-`/capture/` מקומי,
  והאפליקציה נבנית ומורצת עם ‏`NEXT_PUBLIC_POSTHOG_KEY` ו-`NEXT_PUBLIC_POSTHOG_HOST`
  שמצביעים אליו. ההוראות בראש הסקריפט.
- **בפרודקשן ‏PostHog עדיין אינרטי**: ‏`NEXT_PUBLIC_POSTHOG_KEY` חסר ב-Vercel
  Production (‏`BACKLOG` סעיף 20). הטבלה והפולטים ממתינים למפתח ולפריסה.
