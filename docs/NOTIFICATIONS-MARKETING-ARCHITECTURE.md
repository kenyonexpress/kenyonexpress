# ארכיטקטורת התראות, הודעות ואוטומציית שיווק (Notifications, Messaging & Marketing)

מסמך תכנון. מיגרציה נלווית (טיוטה, **לא הוחלה**):
`supabase/migrations/031_notifications.sql`

תאריך: 2026-07-08. ענף: `phase5/homepage`.
מסמכים קשורים: `docs/COMMERCE-ARCHITECTURE.md` (026), `docs/SUPPLIER-REDEMPTION-ARCHITECTURE.md` (027), `docs/AI-AGENTS-ARCHITECTURE.md` (028), `docs/ACCOUNT-IDENTITY-ARCHITECTURE.md` (029).

> תלות קריטית: 031 בנויה **מעל** תשתית ההתראות של 029
> (`notifications_outbox`, `user_notification_preferences`, enum `notification_status`,
> `fn_enqueue_coupon_expiry_reminders`). היא לא מחליפה אותן אלא מרחיבה.
> אין להחיל את 031 לפני 029. המיגרציה נכשלת מוקדם ובמכוון אם 029 חסרה.

---

## 0. עקרונות על

1. **הפרדה קשיחה בין טרנזקציוני לשיווקי.** הודעה טרנזקציונית (אישור הזמנה, קבלה, קופון, משלוח) נשלחת תמיד, בכל ערוץ שהמשתמש לא כיבה. הודעה שיווקית (עגלה נטושה, win-back, ירידת מחיר) נשלחת רק עם opt-in מפורש, עם מנגנון הסרה בכל הודעה, בחלון שעות מותר, ותחת מכסת תדירות. הדגל `is_marketing` על כל שורת outbox הוא ההפרדה ברמת הדאטה, לא רק ברמת הקוד.
2. **אירוע נפרד ממשלוח.** טריגרים על טבלאות הליבה כותבים עובדות ל־`notification_events` (append-only). שלב fan-out נפרד מתרגם עובדה להודעות: מצליב העדפות, הסכמות, ערוצים ותבניות, וכותב ל־`notifications_outbox`. ההפרדה מאפשרת replay, ייחוס הכנסות, והחלפת כללי ניתוב בלי לגעת בטריגרים.
3. **at-least-once עם דה־דופ בכל שכבה.** `dedupe_key` ייחודי על אירועים ועל שורות outbox, claim אטומי עם `FOR UPDATE SKIP LOCKED`, ו־`provider_message_id` נשמר. כפילות היא no-op, לא הודעה כפולה.
4. **ההסכמה היא דאטה, לא צ'קבוקס.** כל שינוי הסכמה (מתן, הסרה, תלונה) נרשם ב־`consent_events` (append-only) עם מקור, נוסח, IP וזמן. זו הראיה מול חוק הספאם.
5. **עברית RTL כברירת מחדל.** תבניות ב־`notification_templates` עם `locale='he'`, כללי bidi מחייבים (סעיף 3.5). וואטסאפ הוא ערוץ ראשי לשוק הישראלי, מייל משני, SMS טרנזקציוני בלבד.
6. **הספק מנותק מהסכימה.** ה־outbox לא יודע מי שולח בפועל. worker בצד האפליקציה מושך batch, פותר תבנית וכתובת, שולח, ומדווח. החלפת ספק = החלפת adapter, אפס שינוי DB.

---

## 1. מצב קיים שהתכנון נשען עליו

| רכיב | מקור | מצב |
|---|---|---|
| `notifications_outbox` (kind/channel/payload/dedupe_key/status/scheduled_for/read_at) | 029 | טיוטה, לא הוחלה |
| `user_notification_preferences` (order_updates_email, coupon_expiry_email/inapp, wallet_activity_email, marketing_email/sms, locale) | 029 | טיוטה |
| enum `notification_status` ('queued','sent','failed','cancelled') | 029 | טיוטה |
| `fn_enqueue_coupon_expiry_reminders()` (7 ימים + 48 שעות, email+inapp, dedupe) | 029 | טיוטה; 031 לא נוגעת בה |
| `orders` (user_id, status, total_ils, invoice_number), `order_items` (item_status) | 007 | חי |
| `coupon_codes` (user_id, status issued/used/expired/refunded, expires_at) | 008 | חי |
| `carts` (profile_id/session_id, items jsonb, updated_at) | 001 | חי |
| `profiles` (email, phone, full_name) | 001 | חי |
| `payments` + `payment_webhook_events` | 026 | טיוטה; טריגר עליה מוגן `to_regclass` |
| `audit_log` + `audit_log_trigger_fn()` | 011+025 | חי |
| `check_user_rate_limit()` | 019 | חי |
| `agent_escalations` (channel אנושי, לא דיוור) | 028 | טיוטה, מחוץ ל־scope |

אין בקוד שום תשתית שליחה (מייל/SMS/וואטסאפ). כל בחירת ספק כאן היא החלטת תכנון, לא תיעוד קיים.

---

## 2. ארכיטקטורת ערוצים

### 2.1 סיווג הודעות: טרנזקציוני מול שיווקי

הקו המשפטי (חוק התקשורת סעיף 30א): "דבר פרסומת" דורש הסכמה מפורשת מראש. הודעת שירות על עסקה שהמשתמש ביצע אינה פרסומת, כל עוד אין בה תוכן קידומי.

| הודעה | סיווג | בסיס | ברירת מחדל |
|---|---|---|---|
| אישור הזמנה + קבלה (`order_paid`) | טרנזקציוני | שירות על עסקה | דולק |
| הקופון שלך מוכן (`coupon_delivered`) | טרנזקציוני | מסירת המוצר עצמו | דולק |
| עדכון משלוח (`order_item_shipped` / `delivered`) | טרנזקציוני | שירות | דולק |
| החזר/ביטול (`order_refunded`, `coupon_refunded`) | טרנזקציוני | שירות | דולק |
| תזכורת פקיעת קופון (7d/48h) | טרנזקציוני (על נכס שנרכש) | שירות; בלי תוכן קידומי בגוף ההודעה | דולק, ניתן לכיבוי |
| פעילות ארנק | טרנזקציוני אופציונלי | שירות | כבוי (029) |
| עגלה נטושה | **שיווקי** | 30א: opt-in בלבד | כבוי |
| ירידת מחיר | **שיווקי** | 30א | כבוי |
| win-back (לקוח רדום) | **שיווקי** | 30א | כבוי |
| ניוזלטר/מבצעים | **שיווקי** | 30א | כבוי |

כלל אצבע: אם ההודעה הייתה נשלחת גם בלי שום כוונה מסחרית נוספת, היא שירות. אם מטרתה לגרום לרכישה חדשה, היא פרסומת. תזכורת פקיעה נשארת שירות רק כל עוד היא "הקופון שקנית פג בעוד 48 שעות" בלי "ואולי תקנה עוד".

### 2.2 בחירת ספקים לישראל + מודל עלויות

כל המחירים הערכה נכונה ל־2026, לאימות מול המחירון העדכני לפני חתימה (שאלה פתוחה 10.1).

**וואטסאפ (הערוץ הראשי בישראל):**

| קריטריון | Meta Cloud API ישיר | 360dialog | Twilio |
|---|---|---|---|
| עלות תשתית | חינם | דמי חודש קבועים (~50 יורו) | markup פר הודעה (~$0.005) |
| עלות הודעת utility (ישראל) | ~$0.005 | כנ"ל, בלי markup | כנ"ל + markup |
| עלות הודעת marketing (ישראל) | ~$0.035 | כנ"ל | כנ"ל + markup |
| מענה בחלון שירות 24h | חינם | חינם | חינם + markup |
| תבניות עברית RTL | נתמך, דורש אישור Meta לכל תבנית | כנ"ל | כנ"ל |

**החלטה: Meta Cloud API ישיר.** בנפחים של פלטפורמה צעירה אין הצדקה ל־BSP בתשלום; ה־API של Meta מספיק (webhooks, תבניות, media). נדרש: מספר טלפון עסקי ייעודי, אימות עסק ב־Meta Business Manager, ואישור מראש לכל תבנית (utility מאושר מהר, marketing נבדק קפדני).

**מייל:**

| קריטריון | Resend | AWS SES | ActiveTrail/smoove (ישראלי) |
|---|---|---|---|
| עלות ל־50K/חודש | ~$20 | ~$5 | יקר יותר, חבילות שיווק |
| DX / תבניות React Email | מצוין | ידני | ממשק ויזואלי, API חלש |
| RTL | מלא (אנחנו שולטים ב־HTML) | מלא | מובנה |
| Deliverability tooling | מובנה | ידני (SNS לניתוב bounce) | מובנה + כלי חוק ספאם |

**החלטה: Resend** לטרנזקציוני ולשיווקי כאחד בשלב ראשון (צינור אחד, פחות תשתית), עם מעבר עתידי ל־SES אם הנפח יצדיק. חובה לפני שליחה ראשונה: SPF + DKIM + DMARC על דומיין ייעודי, והפרדת סאב־דומיינים: `txn.` לטרנזקציוני, `mkt.` לשיווקי, כדי שתלונות שיווק לא יהרסו deliverability של קבלות.

**SMS (טרנזקציוני בלבד):**

| קריטריון | אגרגטור ישראלי (InforUMobile / 019) | Twilio |
|---|---|---|
| עלות לסגמנט | ~0.04-0.08 ש"ח | ~$0.10 |
| Sender ID אלפאנומרי בעברית | נתמך | חלקי |
| תמיכת "הסר" מקומית | מובנה | ידני |

**החלטה: אגרגטור ישראלי** (לבחור בין InforUMobile ל־019 לפי הצעת מחיר). SMS משמש רק לעדכון משלוח קריטי ("החבילה אצל השליח") וכ־fallback כשאין וואטסאפ. עברית ב־SMS היא UCS-2: סגמנט = 70 תווים (67 בשרשור), לכן תבניות SMS קצרות בלבד. אין SMS שיווקי בכלל בשלב זה (הערוץ הרגיש ביותר משפטית והכי שנוא על משתמשים).

**עלות פר הזמנה (סדר גודל):** אישור הזמנה במייל (~$0.0004) + וואטסאפ utility (~$0.005) + עדכון משלוח וואטסאפ (~$0.005) + SMS יום מסירה (~0.06 ש"ח) = פחות מ־10 אגורות להזמנה. זניח מול AOV; אין סיבה לחסוך בערוצים טרנזקציוניים.

### 2.3 מטריצת ניתוב (event -> channels)

fan-out קורא את המטריצה הזו (מקודדת ב־`fn_fanout_notification_events`; שינוי כללים = מיגרציה או העברה לטבלת ניתוב בעתיד):

| אירוע | inapp | email | whatsapp | sms |
|---|---|---|---|---|
| `order_paid` | תמיד | `order_updates_email` | `order_updates_whatsapp` | לא |
| `coupon_delivered` | תמיד | `order_updates_email` | `order_updates_whatsapp` | לא |
| `order_item_shipped` | תמיד | `order_updates_email` | `order_updates_whatsapp` | לא |
| `order_item_delivered` | תמיד | לא | `order_updates_whatsapp` | לא |
| `order_refunded` / `coupon_refunded` | תמיד | תמיד (מסמך כספי) | לא | לא |
| פקיעת קופון (029) | `coupon_expiry_inapp` | `coupon_expiry_email` | `coupon_expiry_whatsapp` (חדש) | לא |
| עגלה נטושה | לא | `marketing_email` | `marketing_whatsapp` | לא |
| win-back | לא | `marketing_email` | `marketing_whatsapp` | לא |

וואטסאפ נשלח רק אם יש `profiles.phone` תקין. אין phone = דילוג שקט (נרשם `skipped`).

---

## 3. צנרת מבוססת אירועים (outbox pattern)

### 3.1 זרימה

```
טבלאות ליבה (orders / order_items / coupon_codes / payments*)
   | טריגר AFTER UPDATE/INSERT על מעבר סטטוס
   v
notification_events            (append-only, dedupe_key ייחודי, עובדות בלבד)
   | fn_fanout_notification_events()   [cron דקה, service role]
   |   מצליב: העדפות + הסכמה + טלפון קיים + מכסת תדירות
   v
notifications_outbox           (029, מורחבת: template_key, attempts, next_attempt_at,
   |                            locked_at/by, provider_message_id, is_marketing, journey_key)
   | fn_claim_notification_batch(worker, n)   [FOR UPDATE SKIP LOCKED]
   v
worker שליחה (Vercel cron -> route מוגן CRON_SECRET, service role)
   |  פותר תבנית active לפי (template_key, channel, locale)
   |  בדיקת send-time: suppression + הסכמה עדיין בתוקף
   |  שולח לספק, ואז fn_mark_notification_sent / _failed / _skipped
   v
ספקים (Resend / Meta Cloud API / אגרגטור SMS)
   | webhooks: delivered / bounced / complained / read
   v
notification_delivery_events   (dedupe על (provider, external_event_id), כמו payment_webhook_events)
   -> bounce קשיח: channel_suppressions ; תלונה: opt-out אוטומטי + consent_event
```

(*) הטריגר על `payments` נוצר רק אם הטבלה קיימת (026 טיוטה). קבלה על תשלום מכוסה בפועל על ידי `order_paid` (ה־payload כולל `invoice_number`), כך שאין תלות קשיחה ב־026.

### 3.2 טריגרים -> אירועים

| טבלה | מעבר | אירוע | dedupe_key |
|---|---|---|---|
| `orders` | `pending -> paid` | `order_paid` | `order_paid:<order_id>` |
| `orders` | `* -> refunded` | `order_refunded` | `order_refunded:<order_id>` |
| `order_items` | `* -> shipped` | `order_item_shipped` | `order_item_shipped:<item_id>` |
| `order_items` | `shipped -> delivered` | `order_item_delivered` | `order_item_delivered:<item_id>` |
| `coupon_codes` | INSERT בסטטוס `issued` | `coupon_delivered` | `coupon_delivered:<coupon_id>` |
| `coupon_codes` | `issued -> refunded` | `coupon_refunded` | `coupon_refunded:<coupon_id>` |

הטריגרים כותבים רק ids ועובדות מינימליות ל־payload (order_id, total_ils, invoice_number, coupon_id). שום PII (שם, כתובת, טלפון) לא נכנס ל־payload; ה־worker פותר פרטי נמען בזמן שליחה. זה מונע מ־payloads לשרוד מחיקת חשבון (029 כבר מבטלת שורות queued במחיקה).

### 3.3 retry, backoff, dead-letter

- `attempts` + `next_attempt_at` על שורת ה־outbox. כישלון: `attempts+1`, backoff מעריכי `5min * 2^attempts` עם תקרה של 6 שעות.
- אחרי 5 ניסיונות: `status='dead'` (ערך enum חדש). שורות `dead` הן ה־dead-letter queue: נשארות בטבלה, מוצגות בדשבורד אדמין, ניתנות ל־requeue ידני (`fn_requeue_dead_notification`).
- claim תוקע: `locked_at` ישן מ־10 דקות נחשב נטוש וזמין ל־claim מחדש (worker קרס באמצע).
- `cancelled` נשאר כמו ב־029 (מחיקת חשבון), `skipped` חדש: נפסל בבדיקת send-time (הסרה שהתרחשה אחרי enqueue, suppression, אין טלפון). ההבחנה בין skipped ל־failed קריטית למדדים: skipped הוא הצלחה של מערך ההסכמות, לא תקלה.

### 3.4 אידמפוטנטיות (שכבות)

1. אירוע: `notification_events.dedupe_key` ייחודי; טריגר שרץ פעמיים = שורה אחת.
2. הודעה: `notifications_outbox.dedupe_key` ייחודי (029); fan-out שרץ פעמיים = no-op.
3. claim: `FOR UPDATE SKIP LOCKED`; שני workers לא מקבלים אותה שורה.
4. ספק: idempotency key בבקשת השליחה היכן שנתמך (Resend: `Idempotency-Key` = outbox id); וואטסאפ: אין, לכן חלון הסיכון היחיד הוא קריסת worker בין send ל־mark-sent, מקרה נדיר שמתקבל כ־at-least-once מודע.
5. webhook ספק: `UNIQUE (provider, external_event_id)`, אותו דפוס כמו `payment_webhook_events` ב־026.

### 3.5 תבניות: `notification_templates` + עברית RTL

```
notification_templates (
  template_key, channel, locale ('he'), version,
  subject, body_text, body_html, whatsapp_template_name,
  variables jsonb, is_active, notes, created_by
)
UNIQUE (template_key, channel, locale, version)
אחת active לכל (template_key, channel, locale)   [אינדקס חלקי ייחודי]
```

- **גרסאות:** עריכה = שורת version חדשה; הפעלה = העברת הדגל `is_active` (טרנזקציה אחת דרך `fn_activate_template`). ה־worker חותם על שורת ה־outbox את `template_id` שבו השתמש בפועל בזמן השליחה, כך שכל הודעה שנשלחה משוחזרת לגרסת התבנית המדויקת.
- **משתנים:** placeholders בסגנון `{{full_name}}`, `{{order_number}}`, `{{expires_at}}`. `variables` מתעד את הסכמה הצפויה; ה־worker מוודא שכל המשתנים קיימים לפני שליחה (חוסר = failed עם שגיאה ברורה, לא הודעה עם חור).
- **וואטסאפ:** הגוף האמיתי חי אצל Meta (תבנית מאושרת). אצלנו נשמר רק `whatsapp_template_name` + מיפוי משתנים לפי סדר. שינוי נוסח וואטסאפ = תבנית חדשה ב־Meta + version חדש אצלנו.
- **כללי RTL מחייבים (email HTML):**
  1. `<html dir="rtl" lang="he">` + `dir="rtl"` על כל טבלת layout (קליינטים של מייל מתעלמים מ־CSS חיצוני).
  2. כל טוקן LTR משובץ (מספר הזמנה `KE-...`, URL, סכום עם ILS, קוד קופון) נעטף ב־`<bdi>` או `&#8207;` כדי שסימני פיסוק לא יקפצו.
  3. מספרים וסכומים: ספרות מערביות, ש"ח אחרי הסכום.
  4. Heebo עם fallback ל־Arial; אין להסתמך על webfont בקליינט מייל.
  5. preheader בעברית; subject בלי אימוג'י בהתחלה (חיתוך RTL ב־Gmail).
  6. הודעת שיווק: המילה "פרסומת" בתחילת ה־subject (דרישת 30א), קישור הסרה בעברית ב־footer + כתובת העסק + `List-Unsubscribe` + `List-Unsubscribe-Post` headers (דרישת Gmail/Yahoo bulk senders).
- **SMS:** תבנית טקסט בלבד, עד 134 תווים (2 סגמנטים UCS-2), בלי קישורים מקוצרים חשודים (פוגע ב־filtering).

---

## 4. הסכמה, העדפות וחוק הספאם

### 4.1 הרחבת `user_notification_preferences` (031)

עמודות חדשות (נוספות לקיימות מ־029):

| שדה | ברירת מחדל | הערה |
|---|---|---|
| `order_updates_whatsapp` | false | utility; נדלק ב־opt-in ראשון בצ'קאאוט ("עדכוני הזמנה בוואטסאפ?") |
| `coupon_expiry_whatsapp` | false | כנ"ל |
| `marketing_whatsapp` | **false** | 30א: opt-in בלבד |
| `quiet_hours_override` | NULL | עתידי, פר משתמש; המדיניות הגלובלית בסעיף 4.4 |

`marketing_email` + `marketing_sms` כבר קיימות ב־029 עם ברירת מחדל false. אין שינוי בהן.

### 4.2 `consent_events` (append-only, הראיה המשפטית)

```
consent_events (
  user_id, channel ('email'|'sms'|'whatsapp'|'all'),
  topic ('marketing'|'order_updates'|'coupon_expiry'|'wallet'),
  action ('opt_in'|'opt_out'),
  source ('account_page'|'checkout'|'unsubscribe_link'|'sms_reply'|
          'whatsapp_reply'|'complaint_webhook'|'admin'),
  wording_version, ip, user_agent, created_at
)
```

- כתיבה רק דרך `fn_set_marketing_consent` (משתמש על עצמו, עם rate limit) או service role (הסרה מקישור חתום, תלונת ספק). אין UPDATE/DELETE לאף אחד.
- `wording_version` מצביע על נוסח בקשת ההסכמה שהוצג. חובה לשמור את הנוסחים בריפו.
- שינוי הסכמה מעדכן את `user_notification_preferences` באותה טרנזקציה: ההעדפות הן ה־state, האירועים הם ההיסטוריה.

### 4.3 זרימות הסרה (unsubscribe)

- **מייל:** קישור בכל הודעה שיווקית + `List-Unsubscribe: <mailto>, <https>` ו־`List-Unsubscribe-Post: List-Unsubscribe=One-Click`. הקישור נושא טוקן חתום (HMAC על `user_id + scope + exp`, סוד בצד שרת). ה־route מאמת ומריץ `fn_unsubscribe_marketing` עם service role, **בלי דרישת login** (הסרה חייבת להיות חופשית ופשוטה לפי החוק). דף אישור: "הוסרת. טרנזקציוני ימשיך להישלח".
- **SMS:** מענה "הסר" מטופל ב־webhook של האגרגטור -> opt-out ל־`marketing_sms`.
- **וואטסאפ:** כפתור "הפסקת עדכונים" בתבניות שיווק + טיפול במילות STOP בעברית ("הסר", "הפסק") ב־webhook -> opt-out ל־`marketing_whatsapp`. חובת Meta בלאו הכי.
- **תלונה (spam complaint) במייל:** webhook -> opt-out אוטומטי מכל השיווק + שורת suppression. תלונה שווה הסרה, בלי ויכוח.
- הסרה נאכפת **גם בזמן שליחה**: worker בודק העדפות עדכניות לפני כל send של הודעה שיווקית. הודעה שכבר ב־queue אחרי הסרה יוצאת `skipped`, לא נשלחת.

### 4.4 שעות שקט (quiet hours)

- שיווקי בלבד. טרנזקציוני נשלח תמיד (קבלה בשעה 23:00 היא לגיטימית ורצויה).
- חלון מותר: 09:00-21:00 שעון ישראל (`Asia/Jerusalem`, מטפל ב־DST אוטומטית).
- שבת: אין שיווק מכניסת שבת (יום שישי 15:00, שמרני) עד מוצ"ש (שבת 20:30). גם תדמיתית וגם פרקטית (engagement אפסי).
- מימוש: `fn_next_marketing_window()` מחזירה את הזמן המותר הקרוב; פונקציות ה־enqueue השיווקיות קובעות `scheduled_for` בהתאם במקום לדחות. ה־claim ממילא מסנן `scheduled_for <= now()`.
- חגים ישראליים: לא בגרסה זו (דורש לוח שנה); שאלה פתוחה 10.4.

### 4.5 צ'קליסט ציות לחוק הספאם (חוק התקשורת 30א)

| # | דרישה | מימוש |
|---|---|---|
| 1 | הסכמה מפורשת מראש לכל דבר פרסומת | `marketing_*` ברירת מחדל false; אין enqueue שיווקי בלי בדיקת ההעדפה; `consent_events` כראיה |
| 2 | סימון "פרסומת" בולט בתחילת ההודעה | prefix ב־subject (מייל) ובגוף (וואטסאפ שיווקי); נאכף ברמת התבנית (בדיקת lint לתבניות marketing) |
| 3 | זהות המפרסם ופרטי קשר | footer קבוע בכל תבנית שיווקית: שם החברה, ח.פ., כתובת, מייל |
| 4 | דרך הסרה פשוטה וחינמית באותו ערוץ | סעיף 4.3; קישור ללא login, "הסר" ב־SMS, STOP בוואטסאפ |
| 5 | כיבוד הסרה מיידי | opt-out נכנס לתוקף בטרנזקציה; בדיקת send-time תופסת גם הודעות שכבר בתור |
| 6 | תיעוד הסכמות | `consent_events` append-only עם נוסח, מקור, IP, זמן |
| 7 | חריג "לקוח קיים" (30א(ג)) | **לא מנוצל.** מדיניות: שיווק רק ב־opt-in מפורש. פשוט יותר, בטוח יותר, וממילא נדרש opt-in בוואטסאפ לפי כללי Meta |
| 8 | הודעות שירות אינן פרסומת | הסיווג בסעיף 2.1; אסור תוכן קידומי בתבניות טרנזקציוניות (בדיקת עריכה) |
| 9 | קטינים / רשימות קנויות | אין ייבוא רשימות. הסכמה נאספת רק ממשתמשים רשומים בפעולה אקטיבית |

---

## 5. מסעות (journeys)

### 5.1 עגלה נטושה (`journey_key = 'abandoned_cart'`)

- **טריגר:** `carts` עם `profile_id` (אורחים לא נגישים: אין ערוץ חוקי אליהם), פריטים לא ריקים, ולא עודכנה בין שעה ל־72 שעות.
- **רצף:** נגיעה 1 אחרי שעה (מייל, ואם יש opt-in גם וואטסאפ); נגיעה 2 אחרי 24 שעות (מייל בלבד). לא יותר. נגיעה 3 מוכחת כמזיקה יותר ממועילה.
- **דיכוי (suppression):**
  1. `marketing_email`/`marketing_whatsapp` כבויים -> לא נכנס לתור בכלל.
  2. קיימת הזמנה `paid` שנוצרה אחרי עדכון העגלה -> המסע מת (הוא קנה).
  3. dedupe: `abandoned_cart_1:<cart_id>:<תאריך העדכון>`; עגלה שהתעדכנה שוב מתחילה מסע חדש, אותה עגלה באותו יום לא.
  4. מכסת תדירות גלובלית (5.5) נבדקת לפני enqueue.
  5. שעות שקט: `scheduled_for` נדחף לחלון המותר הקרוב.
- **תוכן:** תמונת המוצר + מחיר נעול? לא. המחיר בעגלה לא מובטח (העגלה בלי מחירים לפי 026); התבנית מציגה את המוצרים ומחיר עדכני בלבד. בלי קופון פיצוי אוטומטי (מלמד לנטוש עגלות); שאלה פתוחה 10.3.

### 5.2 תזכורות פקיעת קופון (הרחבת 029, `journey_key = 'coupon_expiry'`)

- הבסיס (7 ימים + 48 שעות, email+inapp, dedupe `coupon_expiry_7d:<id>` / `coupon_expiry_48h:<channel>:<id>`) נשאר ב־029 כמות שהוא. 031 לא מגדירה מחדש את הפונקציה (בעלות של 029); הוספת ערוץ וואטסאפ נעשית שם בעת cutover, אחרי ש־`coupon_expiry_whatsapp` קיימת.
- זה מנוע ההכנסות המרכזי של הדומיין: קופון שפג בלי מימוש = לקוח כועס פעם אחת ונעלם. יעד מדיד: שיעור מימוש קופונים לפני/אחרי הפעלת התזכורות (סעיף 6).
- אין נגיעה שלישית ביום הפקיעה בערוץ מייל (מרגיש לחץ); כן התראת inapp ביום האחרון, דרך אותו מנגנון dedupe, כשיוחלט.

### 5.3 win-back (`journey_key = 'winback'`)

- **טריגר:** cron שבועי; משתמשים עם לפחות הזמנה `paid` אחת, שההזמנה האחרונה שלהם ישנה מ־90 יום, עם `marketing_email`.
- **מכסה:** לכל היותר פעם ברבעון פר משתמש: dedupe `winback:<user_id>:<שנה-רבעון>`.
- **תוכן:** דילים חדשים בקטגוריות שקנה בהן. בלי "מתגעגעים אליך" גנרי.

### 5.4 ירידת מחיר (עתידי, לא ב־031)

דורש שני דברים שאין: היסטוריית מחירים (טריגר על שינוי `products.sale_price`) ואות עניין (wishlist, שלא קיים; עגלה פעילה היא אות חלש). נדחה עד שיש wishlist. מתועד כאן כדי שה־enum/journey_key שמורים לו.

### 5.5 מכסות תדירות (frequency caps)

| כלל | ערך | אכיפה |
|---|---|---|
| שיווקי פר משתמש ביום | 1 | `fn_marketing_frequency_ok` לפני enqueue + בדיקת send-time |
| שיווקי פר משתמש בשבוע | 3 | כנ"ל |
| טרנזקציוני | ללא מכסה | אירועים אמיתיים בלבד מטבעם |
| אותו journey פר משתמש | לפי dedupe ייעודי לכל מסע | מפתחות בסעיפים 5.1-5.3 |

המכסה נספרת על שורות outbox שיווקיות שנוצרו בחלון (כולל queued), לא רק שנשלחו, כדי שריצת cron כפולה לא תעקוף את המכסה.

---

## 6. Observability וייחוס הכנסות

### 6.1 משפך משלוח

סטטוסים על `notifications_outbox` + אירועי ספק ב־`notification_delivery_events` נותנים:

```
queued -> sent -> delivered -> read/clicked        (וואטסאפ נותן read; מייל נותן click אמין, open לא)
       -> skipped (הסכמה/suppression)              בריא
       -> failed -> retry -> dead                  חולה, מוצג באדמין
```

- **`v_notification_kpis`** (view, `security_invoker`, אדמין בלבד): פר יום/ערוץ/kind: נוצרו, נשלחו, נכשלו, dead, delivered, שיעור מסירה. התרעת סף בצד אפליקציה: delivery rate מתחת ל־95% במייל או 90% בוואטסאפ = בדיקה.
- **bounce קשיח:** שורת `channel_suppressions` (ייחודי על channel+address); ה־worker מסרב לשלוח לכתובת מדוכאת לנצח (או עד ניקוי ידני). תלונה: כנ"ל + opt-out שיווקי אוטומטי.

### 6.2 ייחוס הכנסות פר מסע

- כל קישור בהודעה נושא `?ke_n=<outbox_id>` (חתום קלות למניעת זיוף מזהים). צד הלקוח שומר עוגיית ייחוס (7 ימים, last-touch).
- ב־webhook התשלום (מעבר `paid`), השרת קורא את העוגייה וכותב `notification_conversions (outbox_id, order_id UNIQUE, journey_key, amount_ils)` עם service role. `order_id` ייחודי = הזמנה נזקפת למסע אחד לכל היותר.
- **`v_journey_revenue`** (view): פר journey_key וחודש: הודעות שנשלחו, המרות, סכום. זה המספר שמצדיק (או הורג) כל מסע.
- חלון ייחוס: 7 ימים מקליק, last-touch. פשוט, עקבי, ניתן להקשחה בהמשך.

### 6.3 שילוב `audit_log`

- פעולות אדמין על תבניות (`notification_templates`) מקבלות את טריגר ה־audit הקיים (025): מי שינה איזו תבנית ומתי.
- שינויי הסכמה לא נכנסים ל־audit_log: יש להם טבלת ראיות ייעודית (`consent_events`) עשירה יותר.
- שליחות בודדות לא נכנסות ל־audit_log (נפח); ה־outbox עצמו הוא הלוג, append-מעשי עם סטטוסים.

---

## 7. מה 031 כוללת (ומה לא)

כוללת (הכול idempotent):

1. בדיקת prerequisite קשיחה: 029 (outbox+prefs) חייבת להיות מוחלת; אחרת exception מיידי.
2. הרחבת enum `notification_status` בערכים `dead`, `skipped` (`ADD VALUE IF NOT EXISTS`, בלי שימוש בערכים החדשים ב־DDL באותה מיגרציה).
3. הרחבת `notifications_outbox`: עמודות event_id, template_key/template_id, is_marketing, journey_key, attempts, next_attempt_at, locked_at/locked_by, provider, provider_message_id, delivered_at, to_address + הרחבת CHECK הערוצים ל־whatsapp + אינדקס claim.
4. `notification_events` + `fn_emit_notification_event` + טריגרים על orders / order_items / coupon_codes (וטריגר מוגן על payments אם קיימת).
5. `notification_templates` + `fn_activate_template` + audit.
6. הרחבת `user_notification_preferences` (עמודות וואטסאפ).
7. `consent_events` + `fn_set_marketing_consent` (למשתמש) + `fn_unsubscribe_marketing` (service, לקישור חתום).
8. `channel_suppressions` + `notification_delivery_events` + `fn_ingest_delivery_event`.
9. `fn_fanout_notification_events`, `fn_claim_notification_batch`, `fn_mark_notification_sent/_failed/_skipped`, `fn_requeue_dead_notification`.
10. עזרי מדיניות: `fn_in_marketing_window`, `fn_next_marketing_window`, `fn_marketing_frequency_ok`.
11. מסעות: `fn_enqueue_abandoned_cart_reminders`, `fn_enqueue_winback_reminders`.
12. views: `v_notification_kpis`, `v_journey_revenue` (עם `security_invoker = true`).
13. `notification_conversions` + RLS מלא על כל טבלה חדשה.

לא כוללת: קוד אפליקציה (worker, adapters לספקים, routes של webhooks וקישורי הסרה, דף העדפות), תוכן תבניות, שינוי `fn_enqueue_coupon_expiry_reminders` של 029, ספק בפועל, price-drop, לוח חגים.

סדר החלה (כשיוחלט): 025 -> 029 -> 031. אין תלות ב־026/027/028 (רפרנסים מוגנים). להחיל רק דרך MCP `apply_migration`. אחרי החלה: תזמון cron (עוגן אחד ב־Vercel cron כל דקה שמריץ fanout+claim+send, ו־cron יומי 08:00 לתזכורות ומסעות), ואז `generate_typescript_types`.

---

## 8. מודל איומים

| # | איום | מיטיגציה |
|---|---|---|
| 8.1 | זיוף webhook ספק (סימון sent/bounced כוזב) | אימות חתימת ספק ב־route (Resend/Meta חותמים); dedupe על event id; הכתיבה רק דרך `fn_ingest_delivery_event` עם service role |
| 8.2 | זיוף קישור הסרה (הסרת אחרים) | טוקן HMAC חתום עם exp; הסרה היא פעולה בטוחה יחסית (fail-safe: הכי גרוע מישהו הוסר) אבל עדיין חתומה |
| 8.3 | הצפת outbox / ספאם תזכורות | dedupe בכל שכבה; מכסות תדירות; rate limit 019 על פעולות משתמש; cron יחיד עם claim אטומי |
| 8.4 | worker כפול שולח פעמיים | SKIP LOCKED + lock expiry; idempotency key לספק היכן שנתמך |
| 8.5 | PII בהודעות / ב־payload | payload נושא ids בלבד; פתירת נמען בזמן שליחה; מחיקת חשבון (029) מבטלת queued ומוחקת העדפות |
| 8.6 | enumeration של `ke_n` בקישורי ייחוס | מזהה חתום; גם בזיוף מוצלח הנזק הוא ייחוס שגוי, לא דליפת מידע |
| 8.7 | שליחת שיווק אחרי הסרה (הפרת חוק) | אכיפה כפולה: enqueue-time וגם send-time; תלונות = opt-out אוטומטי; `consent_events` מוכיח ציות |
| 8.8 | תבנית זדונית/שבורה (הזרקה דרך משתנים) | משתנים עוברים escape ב־renderer; תבניות נערכות רק על ידי אדמין (RLS) עם audit; ולידציית variables לפני send |

---

## 9. סיכום החלטות

1. **ערוצים:** וואטסאפ ערוץ ראשי (Meta Cloud API ישיר, בלי BSP), מייל דרך Resend עם הפרדת סאב־דומיין טרנזקציוני/שיווקי, SMS דרך אגרגטור ישראלי לטרנזקציוני בלבד. אין SMS שיווקי.
2. **צנרת דו־שלבית:** טריגרים -> `notification_events` (עובדות) -> fanout (מדיניות) -> `notifications_outbox` של 029 (מורחבת) -> worker עם claim אטומי -> ספקים -> `notification_delivery_events`.
3. **אמינות:** dedupe בכל שכבה, backoff מעריכי, 5 ניסיונות ואז `dead` (dead-letter נשלט אדמין), סטטוס `skipped` נפרד לכשל־הסכמה.
4. **תבניות:** versioned, אחת active פר (key, channel, locale), חתימת גרסה על כל שליחה, כללי RTL מחייבים, גוף וואטסאפ חי ב־Meta.
5. **חוק הספאם:** שיווק ב־opt-in מפורש בלבד (בלי חריג לקוח קיים), "פרסומת" בכותרת, הסרה בקליק בלי login שנאכפת גם ב־send-time, `consent_events` append-only כראיה.
6. **שעות שקט:** שיווק רק 09:00-21:00 שעון ישראל ולא בשבת; טרנזקציוני תמיד.
7. **מסעות:** עגלה נטושה (2 נגיעות, דיכוי על רכישה), פקיעת קופון (7d/48h מ־029, וואטסאפ יתווסף שם), win-back רבעוני. מכסה גלובלית: שיווקית אחת ביום, 3 בשבוע.
8. **מדידה:** משפך מלא ב־views אדמין, suppression אוטומטי על bounce/תלונה, ייחוס הכנסות last-touch דרך `notification_conversions` עם `order_id` ייחודי.

## 10. שאלות פתוחות

1. **אימות מחירונים וסגירת חוזים:** תעריפי Meta לישראל, הצעות מחיר InforUMobile מול 019, אישור תבניות וואטסאפ ראשונות. המספרים בסעיף 2.2 הם הערכות.
2. **מספר וואטסאפ עסקי:** מספר ייעודי חדש או המספר הקיים של העסק? משפיע על חלון השירות ועל תמיכת אנוש באותו מספר.
3. **תמריץ בעגלה נטושה:** האם נגיעה 2 כוללת קופון פיצוי? ברירת מחדל: לא. אם כן, נדרשת הגנת ניצול (פעם בחצי שנה פר משתמש).
4. **לוח חגים ישראלי** לשעות שקט (ערבי חג = ערב שבת). דורש טבלת חגים או ספרייה בצד ה־worker.
5. **push notifications:** ה־outbox כבר תומך (`channel='push'` מ־029), אבל אין PWA push. להחליט אחרי שה־PWA של הקופונים (029 סעיף 4.2) קמה.
6. **ולידציית טלפון:** `profiles.phone` לא מאומת. וואטסאפ למספר שגוי = כסף וריצוד. להוסיף אימות (הודעת אימות ראשונה) לפני הפעלת הערוץ פר משתמש?
7. **מדיניות ניקוי:** כמה זמן שומרים שורות outbox שנשלחו (הצעה: 12 חודשים ואז ארכוב/מחיקה) ו־delivery_events (6 חודשים)? cron ניקוי טרם הוגדר.
