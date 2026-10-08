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

## ‏8. ‏PostHog: משפך, שימור, הקלטה ו-Do Not Track (‏STEP 26, ‏07.10)

**נמדד לפני כתיבה.** מסלול ה-capture ל-PostHog (‏fetch בלי ‏SDK, ‏`lib/observability/posthog.ts`),
חמשת אירועי המשפך, ‏`cashback_tier` כמאפיין אדם, ועוגיית ‏opt-in להקלטה מאזור החשבון, כולם
כבר היו. מה שחסר: אף בדיקת ‏DNT/GPC בשום מקום, הקלטה שרצה על כל הביקור של מי שאישר,
ומשפך ו-cohorts שהתקיימו כהערות בקוד בלבד ולא כאובייקטים ב-PostHog.

### ‏8.1 המשפך

‏`$pageview → view_item → add_to_cart → begin_checkout → purchase`, כמו
‏`PURCHASE_FUNNEL` ב-`lib/analytics/posthog-funnel.ts`. ‏`scripts/posthog/insights.mjs` בונה
את ה-payload של ה-insight (‏`FunnelsQuery`, צעדים מסודרים, חלון ‏14 יום), ו-`insights.test.mjs`
נועל את רשימת הצעדים לרשימה שהאפליקציה שולחת: שינוי שם של אירוע נופל ב-CI ולא בדשבורד.

```bash
pnpm posthog:provision:dry   # מדפיס את כל ה-payloads, לא נוגע בכלום
pnpm posthog:provision       # upsert לפי שם; דורש POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID
```

בלי המפתח האישי הסקריפט מדפיס שורה ויוצא ‏0, כמו ‏`sentry:alerts`. ‏`POSTHOG_API_HOST` הוא
ה-host של ה-API (‏`us.posthog.com`), לא של ה-ingestion (‏`us.i.posthog.com`).

### ‏8.2 ‏cohorts של שימור

אחרי כל ‏`purchase` בשרת, ‏`server/analytics/retention-cohorts.ts` קורא את ‏`orders.paid_at`
של המשתמש (אותה עמודה שעליה בנוי ה-grid באדמין) וכותב ‏`$set` עם ארבעה מאפייני אדם:
‏`purchase_count`, ‏`first_purchase_at`, ‏`last_purchase_at`, ‏`acquisition_month`
(‏YYYY-MM בשעון ישראל). מי שלא קנה מקבל כלום, לא אפס. על זה הסקריפט מקים שישה ‏cohorts
(‏first-time, ‏repeat ‏2+, ‏loyal ‏4+, ‏lapsed ‏90 יום, ‏cashback gold, ‏replayed sessions) ושני
‏insights של ‏retention: ‏`purchase` חודשי ו-`$pageview` שבועי, שניהם ‏first-time.

### ‏8.3 הקלטה רק של ביקורים עם תקלה

שלושה שערים, כולם חובה: הסכמה בבאנר, ‏opt-in מאזור החשבון, **ואות תקלה**. ה-SDK נטען אחרי
שני הראשונים אבל עם ‏`disable_session_recording: true`; ההקלטה מתחילה רק כש-
‏`lib/analytics/replay-trigger.ts` מסמן את הטאב: ‏`error` לא תפוס, ‏`unhandledrejection`, או
‏error boundary (‏`app/error.tsx`, ‏`app/global-error.tsx` קוראים ל-`markSessionBuggy`). הסימון
יושב ב-sessionStorage ולכן ניסיון חוזר אחרי התקלה מוקלט גם הוא. רגע ההתחלה נשלח כאירוע
‏`replay_started` עם ‏`reason`, דרך ה-SDK כדי שיישא ‏`$session_id`. הרעש ש-Sentry מתעלם ממנו
(‏ResizeObserver, תוספי דפדפן) לא מדליק הקלטה. מה שאבד בכוונה: השניות שלפני התקלה
הראשונה; ‏buffering דורש ‏trigger מרוחק בהגדרות הפרויקט, ונעדר-בשקט הוא הכשל שלא רצינו.

### ‏8.4 ‏Do Not Track ו-Global Privacy Control

‏`isDoNotTrackSignalled` ב-`lib/analytics/consent.ts` קורא ‏`navigator.doNotTrack` (ושני
הכתיבים הישנים) ו-`navigator.globalPrivacyControl`. האות פועל בכיוון אחד בלבד: הוא הופך
"מאושר" ל"נדחה" ולעולם לא להפך. ‏`isBehavioralTrackingAllowed` הוא השער היחיד של הדפדפן,
וקוראים לו ‏tracker.ts (‏first-party), ‏commerce-client.ts (‏PostHog), ‏ThirdPartyTags
(‏GA4/Meta) ו-PostHogReplay. בשרת, ‏`Sec-GPC: 1` או ‏`DNT: 1` על הבקשה מפיל את ה-fan-out
ל-PostHog בלבד; הרשומה ב-`analytics_events` נכתבת בכל מקרה, כי היא רשומה עסקית.

## ‏9. ניסויי ‏A/B: דגלי ‏PostHog, חותמת ‏`$feature/<flag>` ודוח מובהקות (‏STEP 66, ‏09.10)

**ארבעה ניסויים רשומים ב-`lib/analytics/experiments.ts`**, וכל אחד הוא דגל ‏multivariate
ב-PostHog שמפתחות הגרסאות שלו הם בדיוק רשימת ה-`variants`, עם ‏`control` ראשון:

| דגל | גרסאות | חשיפה | מטרה |
|---|---|---|---|
| ‏`checkout_variant` | ‏`control`, ‏`express_summary` | ‏`checkout_step` | ‏`purchase` |
| ‏`home_hero` | ‏`control`, ‏`static_hero`, ‏`no_benefit_bar` | ‏`page_view` עם ‏`route = /` | ‏`purchase` |
| ‏`cta_copy` | ‏`control`, ‏`invite` | ‏`view_product` | ‏`purchase` |
| ‏`checkout_button_color` | ‏`control`, ‏`green` | ‏`checkout_step` | ‏`purchase` |

**החלטה אחת לביקור.** הדף הראשון של ביקור עם הסכמה שואל את ‏`/decide` של ‏PostHog פעם
אחת (‏`lib/analytics/feature-flags.ts`, בלי ‏SDK, ‏timeout של שתי שניות), והתשובה לכל
הדגלים נשמרת כמפה אחת ב-sessionStorage תחת ‏`ke_ph_variants` (‏`lib/analytics/variant-cache.ts`).
‏`null` פירושו שעוד לא הוחלט; ‏`{}` פירושו ש-PostHog ענה והדפדפן הזה לא באף ניסוי. כשל
(רשת, ‏5xx, ערך מחוץ לרשימה, דגל בוליאני) נשמר כ-`{}` ולא כ-`control`: ניסיון חוזר בדף הבא
היה יכול להחליף גרסה באמצע קנייה, ו-`control` על מי ש-PostHog לא הקצה היה מרפד את זרוע
הבקרה בתנועה לא אקראית. בלי הסכמה אין קריאה כלל, והדף מרונדר בבקרה.

**בקרה קודם, ואז החלפה אחת.** ‏`useExperimentVariant(experiment)` מתחיל מבקרה בשרת ובלקוח
כאחד ומחליף פעם אחת ב-effect, אחרי ההידרציה; קריאה של המטמון ב-initialiser הייתה שגיאת
הידרציה שלא מוחלת. לכן ה-HTML של השרת, הבקרה ושער ההשוואה זהים ביט-לביט למה שהיה
לפני הניסוי. הגרסה מגיעה למסך כמאפיין על האלמנט (‏`data-checkout-variant`,
‏`data-home-hero-variant`, ‏`data-cta-variant`, ‏`data-pay-color`), שנעדר בבקרה.

**החותמת.** ה-tracker (‏`lib/analytics/tracker.ts`) מוסיף לכל שורת ‏first-party
‏`$feature/<flag>` לכל דגל שהביקור נמצא בו, **מתחת** למאפייני הקורא; ‏`commerce-client` ו-
‏`AnalyticsProvider` עושים זאת לעותק של ‏PostHog, שקורא את השם הזה בניתוח הניסויים שלו.
כשהחלטה אפשרית אך עדיין תלויה, האירוע הראשון של הביקור (ה-`page_view` וה-`view_product`
שהם בדיוק שורות החשיפה) ממתין לה עד שתי שניות לפני שהוא נכנס לתור; חותמת הזמן לא זזה.

**הדוח** ב-`/admin/experiments` (‏`server/analytics/experiments.ts` → ‏`experiment-events.ts` →
‏`experiment-stats.ts`): חשיפה היא הזהות הראשונה שרונדרה גרסה (עוגיית אורח, אחרת משתמש
שקושר לאורח, אחרת משתמש, אחרת סשן), המרה היא ‏`purchase` של אותה זהות, ‏Wilson ‏95% לכל זרוע,
‏z-test דו-צדדי של שתי פרופורציות מול הבקרה, ‏p ו-lift, ואין פסק דין מתחת ל-100 חשיפות
בזרוע. ניסוי שהחשיפה שלו היא ‏`page_view` נושא ‏`exposureFilter` ברישום, והטוען מצמצם איתו
את שורות החשיפה (‏`props->>route = '/'`) כדי לא לקרוא את כל ה-page_view של החודש.

