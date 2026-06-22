# KenyonExpress Architecture

מסמך זה הוא המקור היחיד והאמיתי לכל החלטות הארכיטקטורה של הפרויקט.

כל פרומפט עתידי ל-Terminal מתחיל בלקרוא את הקובץ הזה.

---

## 1. עקרונות יסוד

### Stack טכנולוגי נעול

- **Frontend:** Next.js 15 + TypeScript strict + Tailwind CSS
- **Monorepo:** Turborepo
- **Database:** Supabase Postgres + Drizzle ORM
- **Auth:** Supabase Auth + WebAuthn (Passkeys)
- **Realtime:** Supabase Realtime
- **Storage:** היברידי (Cloudflare R2 ציבורי + Supabase Storage פרטי)
- **API Layer:** tRPC
- **Workers:** Cloudflare Workers + Hono
- **Queue:** Cloudflare Queues
- **Cron:** Cloudflare Cron Triggers
- **Cache:** Upstash Redis
- **Search:** Postgres ILIKE עכשיו, Meilisearch מעל 1,000 מוצרים
- **Payments:** Cardcom (כרטיסי אשראי, Bit, Apple Pay, Google Pay)
- **Email:** Resend
- **WhatsApp:** Twilio
- **SMS/OTP:** Twilio
- **Monitoring:** Sentry + PostHog + Cloudflare Logs
- **Hosting:** Vercel (web), Cloudflare Workers (API)
- **Domain:** Cloudways (DNS only)
- **Invoicing:** Green Invoice (חשבונית ירוקה) API
- **i18n:** next-intl (תשתית מוכנה, רק עברית פעילה)
- **Chat:** Crisp או Chatwoot

### עקרונות מנחים

- PWA קודם, אפליקציה Native אחר כך (Capacitor)
- Hebrew RTL ראשי, תשתית לעוד שפות
- Mobile First
- Server Components כברירת מחדל
- אסור WordPress / WooCommerce / PHP
- Soft Delete על נתונים פיננסיים, Hard Delete על תוכן

---

## 2. החלטות עסקיות

### 2.1 מודל עסקי

- KenyonExpress הוא העוסק היחיד מול הלקוח (ע.מ. 033798513)
- ספקים פועלים מאחורי הקלעים
- לקוח משלם את הסכום המלא ל-KenyonExpress דרך Cardcom
- אופיר מעביר לספק את הסכום פחות עמלה
- אין פאנל ספק ציבורי
- אין מערכת ביקורות ציבורית

### 2.2 סוגי מוצרים

1. **Coupons** (קופונים) - קוד QR + 8 ספרות
2. **Physical** (מוצרים פיזיים) - dropshipping דרך ספק
3. **Services** (שירותים) - יישום עתידי, מבוסס על קופונים

### 2.3 הזמנות

- עגלה אחת לכל סוגי המוצרים
- חיוב אחד ב-Cardcom
- חשבונית אחת מ-KenyonExpress
- מבנה: `orders` + `order_items` עם `product_type` בכל שורה

### 2.4 קאשבק

- 10% מההזמנה הראשונה
- 5% מההזמנה החמישית, העשירית, וכן הלאה
- רק על מוצרים מסומנים `cashback_eligible = true`
- גם על הפניית לקוחות
- אין פג תוקף בשלב ראשון
- הזכרה ב-נובמבר 2026 לעדכן ל-3 חודשי תוקף

### 2.5 הגנת רווחיות על קאשבק

לכל מוצר 3 שדות:

```
cashback_enabled (boolean)
cashback_percent (5, 10, 15 וכו')
profit_share_cap_percent (אחוז מקסימלי מהרווח שניתן להעניק)
```

חישוב: `cashback = min(price * cashback_percent, profit * profit_share_cap_percent)`

---

## 3. מסד נתונים (Schema)

### 3.1 טבלאות ליבה

**Users & Auth:**
- `auth.users` (Supabase)
- `profiles`
- `user_addresses`
- `user_preferences` (notification settings)

**Catalog:**
- `suppliers` (פרטי, admin-only)
- `categories` (היררכי)
- `tags`
- `cities`
- `products` (polymorphic by type)
- `product_variants`
- `product_images`
- `product_tags`
- `product_views` (היסטוריית גלישה)
- `price_history`

**Commerce:**
- `carts` (היברידי - LocalStorage + DB)
- `cart_items`
- `orders`
- `order_items`
- `payments`
- `payment_methods` (Cardcom tokens מוצפנים)
- `coupon_codes`
- `shipments`

**Wallet & Cashback:**
- `wallet_balances`
- `wallet_transactions`

**Referrals & Affiliates:**
- `referrals`
- `affiliates` (תשתית עכשיו, מערכת מלאה אחר כך)

**Communications:**
- `notifications`
- `notification_preferences`

**Operations:**
- `audit_log` (כל שינוי במערכת)
- `cardcom_webhooks` (idempotency)
- `refund_requests`

### 3.2 כללי DB

- כל timestamp ב-UTC
- כל טבלה עם `created_at` ו-`updated_at`
- טבלאות פיננסיות עם `deleted_at` (Soft Delete)
- חשבוניות, הזמנות, תשלומים = שומרים 7 שנים
- RLS (Row Level Security) מופעל בכל טבלה

---

## 4. אימות והתחברות

### 4.1 שתי אופציות Login

1. **Google** (ברירת מחדל, כפתור ראשי)
2. **טלפון + OTP** (כפתור משני)

אין סיסמאות. אין מייל לוגין.

### 4.2 Passkeys

אחרי הרשמה ראשונה, המערכת מציעה ללקוח להפעיל:
- Face ID (iPhone)
- Touch ID (Mac, iPhone ישן)
- טביעת אצבע (Android)
- זיהוי פנים (Android)

טכנולוגיה: WebAuthn API.

### 4.3 רישום ראשון בצ'קאאוט

1. גלישה אנונימית בעגלה
2. בדף תשלום: מייל + טלפון בלבד
3. OTP לטלפון (4 ספרות)
4. תשלום ב-Cardcom
5. החשבון נוצר אוטומטית

---

## 5. תשלומים (Cardcom)

### 5.1 אופציות תשלום

- כרטיס אשראי (ברירת מחדל)
- Bit (חובה לקהל הצעיר)
- Apple Pay (חובה למובייל iOS)
- Google Pay (חובה למובייל Android)
- תשלום מקאשבק בארנק
- **אין תשלומים** (לא 2 לא 12) - החלטה עסקית

### 5.2 First Payment Flow

1. לקוח לוחץ "שלם"
2. Server יוצר Payment Page ב-Cardcom
3. לקוח עובר לדף Cardcom (לא רואה את האתר)
4. ממלא כרטיס, Cardcom מחזיר token + tx_id ל-webhook
5. אנו שומרים token מוצפן ב-`payment_methods`
6. הזמנה עוברת ל-`paid`

### 5.3 1-Click Flow (לקוח חוזר)

1. לקוח לוחץ "שלם"
2. אנו שולחים token שמור ל-Cardcom
3. Cardcom מחייב בלי דף תשלום
4. הזמנה עוברת ל-`paid` מיידית
5. הודעה: "תודה, ההזמנה אושרה"

### 5.4 Webhook Strategy

- Idempotency: כל webhook עם UUID ייחודי
- Retry: עד 5 פעמים מ-Cardcom
- Signed Webhooks: וידוא חתימה דיגיטלית
- Reconciliation Job: cron כל שעה, בודק פערים
- עיבוד אסינכרוני ב-Cloudflare Queue

---

## 6. ביטולים והחזרים

### 6.1 ביטול אוטומטי (בלי אישור אופיר)

מקרים שעוברים אוטומטית:
- קופון שלא נסרק (`status = issued`)
- מוצר פיזי שעוד לא נשלח (`status = paid`)

תהליך: לקוח לוחץ "בטל" → בדיקת תנאים → החזר אוטומטי ב-Cardcom → הודעה.

### 6.2 ביטול ידני (אישור אופיר)

מקרים שדורשים אישור:
- מוצר פיזי שכבר נשלח
- בקשה מסיבה מיוחדת
- חורג מ-X ימים מהקנייה

תהליך: לקוח לוחץ "בקש החזר" → טופס עם סיבה → אופיר מאשר/דוחה באדמין.

---

## 7. קופונים

### 7.1 הנפקה

- קוד 8 ספרות + QR Code
- נשלח ב-WhatsApp + מוצג באזור אישי
- תוקף ברירת מחדל: 60 ימים
- ניתן לשינוי פר מוצר דרך `expires_after_days`

### 7.2 סריקה (אפליקציית Merchant)

- כתובת: `merchant.kenyonexpress.co.il`
- PWA נפרד
- בעל עסק מתחבר עם משתמש וסיסמה
- סריקת QR ישירות במצלמה (`BarcodeDetector API`)
- Fallback: הקלדת 8 ספרות

### 7.3 סטטוסים

- `issued` (הונפק)
- `used` (נוצל)
- `expired` (פג תוקף)
- `refunded` (הוחזר)

---

## 8. משלוחים

### 8.1 Flow

1. לקוח קונה מוצר פיזי
2. תשלום עובר → WhatsApp אוטומטי לספק עם פרטים מלאים
3. ספק שולח, מעדכן tracking דרך טופס ייעודי
4. לקוח רואה סטטוס באזור אישי

### 8.2 סטטוסים

- `paid` (שולם)
- `sent_to_supplier` (נשלח לספק)
- `shipped` (נשלח ללקוח, אם יש tracking)
- `delivered` (התקבל)

---

## 9. תקשורת והתראות

### 9.1 ערוצים

- **In-app**: פעמון באתר
- **WhatsApp**: דרך Twilio
- **Push**: PWA notifications

**אין שליחת אימייל אוטומטית** (פרט לחשבוניות לפי בקשה).

### 9.2 מי שולח מה

| אירוע | In-app | WhatsApp | Push |
|---|---|---|---|
| הזמנה אושרה | כן | לא | כן |
| קופון פג בעוד יום | כן | כן | כן |
| מוצר נשלח | כן | לא | כן |
| מבצע חדש מתאים | כן | לא | כן |
| ביטול אושר | כן | לא | כן |
| קאשבק התקבל | כן | לא | כן |

### 9.3 שירות לקוחות

- צ'אט בכל דף (Crisp/Chatwoot)
- אופיר מקבל ב-WhatsApp Business
- בדף מוצר: WhatsApp + טלפון + כתובת של הספק לשאלות מקצועיות

---

## 10. חיפוש

### 10.1 שלב 1 (עכשיו עד 500 מוצרים)

- Postgres ILIKE על `title_he` ו-`description_he`
- אינדקסים מוכנים
- שדה חיפוש **מוסתר ב-UI** (`hidden` class)

### 10.2 שלב 2 (500-1000 מוצרים)

- הסרת `hidden`, חיפוש פעיל
- Postgres ILIKE עדיין

### 10.3 שלב 3 (1000+ מוצרים)

- מעבר ל-Meilisearch
- חיפוש לפי ערים ותגים
- Typo tolerance

---

## 11. SEO ומבנה תוכן

### 11.1 סוגי דפים

1. **קטגוריות**: `/c/[slug]`
2. **ערים**: `/city/[slug]`
3. **תגים**: `/tag/[slug]`
4. **מבצעים**: `/deals/today`, `/deals/weekend`
5. **מוצרים קשורים**: בכל דף מוצר
6. **דפי ספק**: `/supplier/[slug]`

### 11.2 ללא

- אין מגזין/בלוג
- אין פיד "קונים עכשיו"
- אין ביקורות ציבוריות

---

## 12. תמונות ומדיה

### 12.1 חלוקה היברידית

**Cloudflare R2 (ציבורי, CDN מהיר):**
- `products/{product_id}/main.webp`
- `products/{product_id}/gallery/01.webp`
- `banners/hero/{banner_id}.webp`
- `categories/{category_id}.webp`
- `suppliers/{supplier_id}/logo.webp`

**Supabase Storage (פרטי, מאובטח):**
- `receipts/{user_id}/{order_id}.pdf`
- `refund-evidence/{request_id}/{file}`
- `profile-images/{user_id}.webp`

### 12.2 אופטימיזציה

- פורמט: WebP בלבד
- 5 גדלים אוטומטיים: thumbnail, small, medium, large, original
- Cloudflare Images לעיבוד אוטומטי
- Lazy Loading
- Blur Placeholder

---

## 13. ביצועים

### 13.1 יעדים נעולים

- **LCP**: מתחת 1.8 שנייה
- **INP**: מתחת 100ms
- **CLS**: מתחת 0.05
- **TTFB**: מתחת 200ms
- **Bundle size**: מקסימום 200KB gzipped JS לעמוד

### 13.2 כללים

- Server Components כברירת מחדל
- Client Components רק כשחייבים אינטראקטיביות
- כל תמונה lazy load (פרט לראשונה במסך)
- מוניטור אוטומטי ב-PostHog + Sentry
- חסימת deploy ל-production אם המדדים חורגים

---

## 14. סביבות ופריסה

### 14.1 שלוש סביבות

1. **Local**: MacBook של אופיר, Supabase דרך Docker
2. **Preview**: כל PR פותח אוטומטית סביבה זמנית
3. **Production**: `kenyonexpress.co.il`

### 14.2 פרויקטים ב-Supabase

- `kenyonexpress-staging` (Free Tier)
- `kenyonexpress-production` (Pro Tier, $25/חודש)

### 14.3 גיבויים

- יומי אוטומטי ב-Supabase Pro (7 ימים)
- שבועי חיצוני ל-R2 (6 חודשים)
- Point-in-Time Recovery (7 ימים אחורה)

---

## 15. אדמין

### 15.1 מסכים

1. **Dashboard** - מכירות, הזמנות בהמתנה, ביטולים, התראות
2. **מוצרים** - טבלה, ייצוא/ייבוא Excel, עריכה מהירה
3. **הזמנות** - פילטרים, פרטים, "סמן כנשלח", "החזר כסף"
4. **לקוחות** - רשימה, LTV, היסטוריה, יתרת ארנק, חסימה
5. **ספקים** - ניהול, עמלה פר מוצר, יתרות
6. **תוכן** - באנרים, קטגוריות, תגים, ערים, דפי SEO
7. **דוחות** - מכירות, ספקים, קופונים, קאשבק, עמלות
8. **אפיליאייטים** - אישור, מעקב, דוח תשלומים חודשי

### 15.2 טכנולוגיה

- `shadcn/ui` רכיבים
- `TanStack Table` טבלאות
- גישה לאופיר בלבד (RBAC)

---

## 16. אבטחה

### 16.1 Rate Limiting

- **OTP**: 3 ניסיונות לטלפון בשעה, חסימה 24 שעות
- **Login**: 5 ניסיונות מ-IP בדקה, חסימה 15 דקות
- **Checkout**: 3 הזמנות מ-IP בדקה
- **API כללי**: 100 בקשות בדקה מ-IP

טכנולוגיה: Upstash Redis + Next.js middleware.

### 16.2 הגנה מבוטים

- Cloudflare Turnstile (חינמי)
- Cloudflare WAF (חינמי)
- Cardcom AVS + Fraud Detection

### 16.3 הגנות נוספות

- CSP Headers (Content Security Policy)
- HTTPS חובה
- Secrets ב-environment variables
- כל token מוצפן ב-DB

---

## 17. אנליטיקה ומעקב

### 17.1 כלים (כולם חינמיים)

- **PostHog**: כל פעולה, session recording, funnels
- **Sentry**: שגיאות בקוד
- **Cloudflare Logs**: לוגי שרת
- **Cloudflare Analytics**: תנועה ומקורות
- **PostHog Funnels**: שלבי המעבר

### 17.2 KPIs לעקוב

- Conversion Rate
- Cart Abandonment Rate
- Average Order Value
- Customer Lifetime Value (LTV)
- Cashback Redemption Rate
- Supplier Performance Score

---

## 18. אוטומציות (Cron Jobs + Triggers)

### 18.1 Cron יומי

- 02:00 - התראת קופון פג בעוד יום
- 03:00 - יצירת sitemap.xml
- 04:00 - חישוב feature_score לכל מוצר
- 09:00 - דוח שבועי לאופיר (ראשון בלבד)

### 18.2 Cron שעתי

- בדיקת תשלומים תקועים
- שליחת תזכורות עגלה נטושה (3 שעות, 24 שעות)

### 18.3 Triggers על אירועים

- תשלום הצליח → WhatsApp ספק, חשבונית ירוקה, עדכון מלאי, יצירת QR, עדכון יתרת קאשבק, PostHog event
- מלאי הגיע ל-5 → התראה לאופיר
- מלאי הגיע ל-0 → סטטוס `sold_out` אוטומטי
- ספק לא הגיב 24 שעות → התראה לאופיר
- לקוח לא קנה 60 יום → WhatsApp "התגעגענו"
- יום הולדת לקוח → WhatsApp עם הנחה (אם הזין תאריך)
- לקוח עבר 10 הזמנות → WhatsApp VIP, קאשבק קבוע 7%
- ביקור 3+ פעמים במוצר → WhatsApp "ראית את X, מעוניין?"
- AI Chatbot 24/7 לשאלות

### 18.4 AI Automation

- AI Pricing Recommendations שבועי
- AI Fraud Detection בזמן אמת
- AI Smart Recommendations ("גם קנו")
- AI A/B Testing אוטומטי
- AI חישוב LTV
- AI תמחור דינמי לפי ביקוש

---

## 19. הפניות ואפיליאייטים

### 19.1 Referral Program

- כל לקוח עם קוד אישי (`OFIR1234`)
- מפנה מקבל: 20₪ בארנק אחרי קנייה ראשונה של המופנה
- מופנה מקבל: 15₪ הנחה על קנייה ראשונה
- אין מקסימום, אבל בדיקת זיוף (IP, טלפון)

### 19.2 Affiliate Program

**עכשיו (תשתית):**
- שדה `affiliate_code` ב-users
- עוגייה לזיהוי מקור (30 ימים)

**אחרי 50+ לקוחות (מערכת מלאה):**
- דף נחיתה `/affiliate`
- דשבורד `/affiliate/dashboard`
- מעקב קליקים והמרות
- עמלות 5%-15% פר מוצר
- תשלום חודשי

### 19.3 תשלום לאפיליאייטים

**שלב 1 (עד 50 אפיליאייטים):** ידני דרך Bit אישי, 0 עלות

**שלב 2 (50+):** Masav (מסב) אוטומטי, 2-5₪ לעסקה

---

## 20. רב-לשוניות (i18n)

### 20.1 עכשיו

- רק עברית פעילה
- כל טקסט בקבצי `messages/he.json`
- שימוש ב-`next-intl`
- אין כפתור "תרגום אוטומטי" (לא מקצועי, פוגע ב-SEO)

### 20.2 עתיד

- הוספת `messages/ar.json`, `messages/ru.json`, `messages/en.json`
- תרגום בעזרת Claude API
- כל שפה עם URL נפרד ל-SEO: `/he/...`, `/ar/...`

---

## 21. נגישות

### 21.1 קוד (חינמי)

- WCAG 2.1 רמה AA
- alt text בעברית לכל תמונה
- ניגודיות מינימלית 4.5:1
- ניווט מקלדת מלא
- ARIA labels
- טקסט מינימלי 16px

### 21.2 תפריט נגישות צף

- ספרייה: `react-accessibility-menu` (חינמי, בלי לוגו)
- הגדלת טקסט, ניגודיות גבוהה, ביטול אנימציות, הדגשת קישורים

### 21.3 דף הצהרת נגישות

- בכתובת `/accessibility`
- חובה לפי חוק 5568

---

## 22. חשבוניות (Green Invoice)

- מספור רץ אוטומטי: `2026-000001`
- איפוס מספור כל 1 בינואר
- חשבונית מתבטלת = סטטוס `voided`, המספר לא מנוצל מחדש
- עוסק מורשה: 033798513
- שמירה ל-7 שנים (Soft Delete)
- לקוח מוריד מהאזור האישי בלבד (אין שליחה אוטומטית במייל)

---

## 23. תקנון ומסמכים משפטיים

### 23.1 דפים נדרשים

1. `/terms` - תנאי שימוש
2. `/privacy` - מדיניות פרטיות
3. `/promotions` - תקנון מבצעים וקופונים
4. `/cashback-policy` - תקנון קאשבק
5. `/referral-policy` - תקנון הפניות
6. `/affiliate-policy` - תקנון אפיליאייטים
7. `/accessibility` - הצהרת נגישות
8. `/shipping` - מדיניות משלוחים
9. `/returns` - מדיניות החזרים
10. `/cookies` - מדיניות עוגיות

### 23.2 הסכמה

- Cookie Banner בכניסה ראשונה
- Checkbox בקנייה ראשונה: "קראתי ואני מאשר את תנאי השימוש ומדיניות הפרטיות"
- Double Opt-in לניוזלטר

---

## 24. דרישות חוקיות נוספות

- חוק הגנת הפרטיות הישראלי
- חוק שוויון זכויות לאנשים עם מוגבלות (5568)
- חוק הספאם (כפתור הסרה בכל מייל)
- חוק מס הכנסה (שמירת רישומים 7 שנים)
- GDPR (לקוחות אירופיים)
- חוק הצהרת חסויות (אפיליאייטים)

---

## 25. ניהול מחירים ומלאי

### 25.1 ניהול ידני

- אופיר מנהל את כל המוצרים מהאדמין
- ייבוא Excel/CSV
- עריכה inline בטבלה
- עדכון מסיבי דרך ייצוא Excel → עריכה → ייבוא + diff

### 25.2 היסטוריית מחירים

- כל שינוי מחיר נשמר ב-`price_history`
- ניתן לראות גרף שינויים פר מוצר

### 25.3 מלאי

- אופיר מנהל ידנית
- ירידה אוטומטית בכל הזמנה משולמת
- `stock_quantity = 0` → `status = sold_out` אוטומטי

---

## 26. נספח: פרטים תפעוליים

### 26.1 פרטי עסק

- שם: KenyonExpress
- ע.מ.: 033798513
- דומיין: kenyonexpress.co.il
- שפה: עברית בלבד (עכשיו)
- מטבע: ILS בלבד (עכשיו)
- אזור זמן: Asia/Jerusalem

### 26.2 נתיב פיתוח

`/Users/ofir/kenyonexpress-web/kenyonexpress`

### 26.3 סדר בניית Homepage

1. TopBar (הושלם)
2. MainHeader (הושלם)
3. HeroSection + 3-column layout
4. Categories
5. Deal of Day
6. Featured Products
7. Hot Coupons
8. Brands
9. Newsletter
10. Footer

עבודה חלק אחר חלק, מלמעלה למטה, פיקסל פרפקט.

---

## 27. תזכורות עתידיות

- **נובמבר 2026**: לעדכן תוקף קאשבק ל-3 חודשים
- **500 מוצרים**: להפעיל שדה חיפוש ב-UI
- **1000 מוצרים**: מעבר ל-Meilisearch
- **50 אפיליאייטים**: מעבר מ-Bit ידני ל-Masav אוטומטי
- **100 לקוחות פעילים**: לבחון בניית מערכת Affiliate מלאה
- **בעתיד**: עורך דין ישראלי לחתימה על מסמכים משפטיים
- **בעתיד**: Capacitor/Expo לאפליקציה Native

---

## גרסה ועדכונים

**גרסה 1.0** - 21 במאי 2026
**סטטוס**: ארכיטקטורה נסגרה. מעבר לפיתוח.

מסמך זה הוא חי. כל שינוי מהותי מתועד בקובץ והופך לחלק מהקאנון.
