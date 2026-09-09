# RATE-LIMITS — כל תקרה באפליקציה, ומה מקבל מי שנדחה

נמדד מול העץ ב-09.09.2026. כל מספר כאן נקרא מ-`src/lib/rate-limit/policies.ts`
ולא הועתק ביד, וטסט סחיפה (`src/lib/rate-limit/docs-table.test.ts`) מאדים ביום
שהטבלה כאן והטבלה בקוד יפרדו. **המקור הוא הקוד; המסמך הזה הוא תצוגה שלו.**

## ‏1. איפה זה חי

| קובץ | מה הוא מחזיק |
| --- | --- |
| `src/lib/rate-limit/policies.ts` | הטבלה עצמה, בניית המפתח ל-Redis ול-Postgres |
| `src/lib/rate-limit/limiter.ts` | ההחלטה: Upstash, ואז Postgres, ואז פתוח-ורועש |
| `src/lib/rate-limit/headers.ts` | ‏`RateLimit-*` ו-`Retry-After`, ותשובת ה-429 |
| `src/lib/rate-limit/sliding-window.ts` | החלון המחליק ב-Upstash |
| `src/lib/utils/rate-limit.ts` | ‏`checkRateLimit` הישן (בוליאני) ו-`getClientIp` |

שתי צורות קריאה חיות בעץ, ושתיהן נסרקות על ידי
`src/lib/rate-limit/policies.test.ts`:

- ‏**`rateLimit('name', identifier)`** — מחזירה החלטה מלאה (כמה נשאר, מתי
  מתאפס). זו הצורה שקוד חדש כותב, וזו הצורה שכל ראוט HTTP שמחזיר ‏429 משתמש
  בה, כי בלי ההחלטה אי אפשר לשלוח ‏`Retry-After`.
- ‏**`checkRateLimit('name:identifier', limit, window)`** — הצורה הישנה,
  מחזירה בוליאני. עדיין בשימוש ב-server actions, שאין להם קוד סטטוס לשלוח.

**שתיהן נוחתות באותו דלי.** ‏`legacyRedisKey(postgresKey(name, id))` שווה
בית-בית ל-`redisKey(name, id)`, ויש על כך טסט. לכן העברת אתר קריאה מצורה אחת
לשנייה היא שינוי שם ולא איפוס מונה.

## ‏2. הטבלה

`limit` הוא מספר הבקשות המותר בתוך `window`.

| מדיניות | limit | window | הסיבה |
| --- | --- | --- | --- |
| `login` | 10 | 1 h | password guessing, per IP |
| `login-account` | 20 | 1 h | password guessing on one account from rotating IPs |
| `signup` | 5 | 1 h | account flooding, per IP |
| `magic` | 5 | 1 h | magic-link mail sent to a real inbox |
| `phone-otp` | 5 | 1 h | OTP SMS costs money, per IP |
| `phone-otp-number` | 3 | 1 h | OTP SMS to one number: the measured lockout vector, and the bill |
| `phone-verify` | 20 | 1 h | OTP code guessing, per IP |
| `phone-verify-number` | 5 | 1 h | six digits is a million codes; per-number is what bounds the guessing |
| `passkey-register` | 10 | 1 h | WebAuthn enrolment ceremonies; a real person adds one key, not eleven |
| `mfa-enrol` | 10 | 1 h | TOTP factor creation, per user; one authenticator, not a pile of abandoned factors |
| `mfa-verify` | 10 | 15 min | six digits are brute forceable; per-user bound is what actually protects the account |
| `mfa-verify-ip` | 30 | 15 min | the same guesses spread across accounts from one address |
| `passkey-login` | 30 | 1 h | challenge issuance, per IP; cheap but each one sets a cookie |
| `passkey-login-finish` | 20 | 1 h | assertion verification plus admin calls; one per real login |
| `push-subscribe` | 30 | 1 h | service-role upserts to push_subscriptions; a browser re-posts one per page load at most |
| `reset` | 5 | 1 h | reset mail, per IP |
| `reset-address` | 5 | 1 h | reset mail to one address from rotating IPs |
| `update-password` | 10 | 1 h | session-bound password change |
| `cart_write` | 120 | 1 h | cart mutation, user or IP |
| `coupon` | 10 | 1 h | coupon code guessing |
| `coupon_qr_apply` | 30 | 1 h | printed QR landing, per IP |
| `begin_checkout` | 10 | 1 min | Cardcom low-profile creation |
| `referral-code` | 10 | 1 h | referral code mint, per user |
| `review-submit` | 5 | 1 h | review spam, per user |
| `refund-request` | 10 | 1 h | refund requests across orders, per user |
| `support-open` | 10 | 1 h | new support tickets, per user |
| `support-reply` | 30 | 1 h | messages on a ticket, per user |
| `supplier-apply` | 5 | 1 h | supplier applications, per user |
| `supplier-doc-upload` | 30 | 1 h | presigned R2 PUT minting for onboarding documents, per user |
| `wishlist-toggle` | 60 | 1 h | held-down heart, per user |
| `wishlist-merge` | 10 | 1 h | guest wishlist merge at login, per user |
| `redeem` | 60 | 1 h | customer-facing redeem page, per IP |
| `voucher-redeem` | 120 | 1 h | till scans, per supplier user |
| `voucher-redeem-batch` | 40 | 1 h | batch scans, per supplier |
| `voucher-lookup` | 300 | 1 h | till lookups, per supplier |
| `staff-pin` | 15 | 1 h | PIN guessing on the till |
| `search` | 120 | 5 min | search queries hit Meilisearch |
| `search-suggest` | 300 | 5 min | typeahead fires per keystroke |
| `search-facets` | 60 | 5 min | faceted search, filters + counts |
| `analytics` | 120 | 1 min | beacon endpoint, per IP |
| `contact` | 5 | 1 h | contact form mail |
| `supplier-lead` | 5 | 1 h | supplier lead mail |
| `newsletter` | 5 | 1 h | newsletter subscription mail |
| `waitlist` | 5 | 1 h | back-in-stock mail, per IP |
| `review_report` | 20 | 1 h | review abuse reports, per IP |
| `review_helpful` | 60 | 1 h | review helpful votes, per IP |
| `admin-voucher-lookup` | 60 | 1 h | admin voucher code lookup, per staff user |
| `admin-voucher-redeem` | 30 | 1 h | admin manual voucher burn, per staff user |
| `admin-voucher-resend` | 30 | 1 h | admin resend of the coupon email, per staff user |
| `voucher-resend` | 3 | 1 h | coupon email resend, per VOUCHER rather than per operator |
| `admin-upload-url` | 100 | 1 h | presigned R2 PUT minting, per staff user |
| `admin-image-process` | 60 | 1 h | server-side image conversion, per staff user |
| `app-session` | 30 | 10 min | app session exchange, per IP |
| `push-register` | 60 | 1 h | push token registration |

**המזהה (`identifier`) הוא חלק מהמפתח ולא מהטבלה.** ‏IP במסלולים
האנונימיים, מזהה משתמש במסלולים המזוהים, ובשלוש שורות ערך שהקורא מספק
(כתובת מייל, מספר ‏E.164). **קידומת המפתח נגזרת משם המדיניות ולעולם לא
מועברת כפרמטר**, כדי ששתי תקרות לא יחלקו מונה בטעות; טסט אוסר על שם שהוא
תחילית של שם אחר בגבול מקטע.

## ‏3. מה מקבל מי שנדחה

`tooManyRequests` ו-`rateLimitHeaders` בונים את התשובה. **עד 09.09.2026 לא
היה להם אף קורא מחוץ לטסטים שלהם**: כל ראוט כתב לעצמו `{ status: 429 }` ולא
שלח ‏`Retry-After` בכלל. תשעת ראוטי ה-429 הועברו לבנאי המשותף.

| כותרת | מתי | מה היא אומרת |
| --- | --- | --- |
| `Retry-After` | רק על ‏429 | שניות עד שאפשר שוב, מעוגל למעלה, לעולם לא 0 |
| `RateLimit-Limit` | על ‏429 | התקרה |
| `RateLimit-Remaining` | על ‏429, כשידוע | כמה נשאר. **מושמט ולא מומצא** על מסלול ה-Postgres, שאינו מחזיר מונה |
| `RateLimit-Reset` | על ‏429, כשידוע | **דלתא בשניות, לא חותמת זמן** |

**רק על הדחייה, והסיבה נמדדה.** ‏`/api/search` ו-`/api/search/facets`
מחזירים ‏200 עם ‏`Cache-Control: public, s-maxage=30`, כלומר התשובה נשמרת
במטמון משותף. ‏`RateLimit-Remaining` על תשובה כזו הוא מונה של קורא אחד
שמוגש לכולם. ‏429 לעולם אינו נשמר במטמון.

**גוף התשובה נשאר כפי שהיה בכל ראוט.** הראוטים של הקופה מחזירים ‏`outcome`
והודעה בעברית שהקופה מסתעפת עליה; ראוטי האפליקציה מחזירים
`{ ok: false, error: 'rate_limited' }`. הכותרות נוספו, שום גוף לא שונה.

**שני מסלולים דוחים בלי ‏429, במכוון:**

- ‏`/c/[code]` — מפנה הביתה בלי עוגייה. ‏429 היה מבחין בין קוד תקין לקוד
  שאינו קיים, וזה בדיוק מה שמונה ‏8 הספרות הזה מגן מפניו.
- ‏`/api/a` (משואת האנליטיקס) — מחזיר ‏204 על כל תוצאה שאינה שגיאת תכנות,
  כי לדפדפן אין מה לעשות עם שגיאת אנליטיקס מלבד לנסות שוב בלולאה.

**‏server actions אינם מחזירים קוד סטטוס.** הם מחזירים מחרוזת עברית
(`'יותר מדי פעולות. נסה שוב בעוד רגע.'` ודומותיה). זו הסיבה שהם נשארו על
‏`checkRateLimit`: אין להם מה לעשות עם ההחלטה המלאה.

## ‏4. מה אינו מוגבל, ולמה

השער `src/__tests__/security/mutating-route-guards.test.ts` דורש מכל
‏`POST/PUT/PATCH/DELETE` תחת `src/app/api` **או** רייט-לימיט **או** שער
קריפטוגרפי. הרשימה כאן היא הצד השני של אותו שער.

| מסלול | למה אין תקרה |
| --- | --- |
| ‏`api/cron/*` | ‏`CRON_SECRET` ב-Bearer; אין קורא ציבורי |
| ‏`api/webhooks/products`, ‏`api/search/index-job`, ‏`api/search/index-dlq` | ‏HMAC-SHA256 או סוד משותף בהשוואת זמן קבוע |
| ‏`api/webhooks/whatsapp` | חתימת ‏Twilio (HMAC-SHA1 על ה-URL והפרמטרים) |
| ‏`api/payments/cardcom/webhook` | אימות מול ‏Cardcom; אינו נקודת קצה ציבורית מבחינת אמון |
| ‏actions של אדמין (26 קבצים) | מאחורי `requireAdminSession`/`requireRole`. ראו ‏5 |
| ‏`gifts.ts` (`claimGift`, `loadGiftPreview`) | האסימון הוא ‏256 ביט מ-CSPRNG ורק ה-SHA-256 נשמר. אין מה למנות. ראו ‏6 |
| ‏`consent.ts` | כותב עוגייה בלבד, אפס גישה למסד |
| ‏`account.ts`, ‏`subscriptions.ts`, ‏`orders.ts` | מזוהים ומוגבלים לשורות של הקורא עצמו |
| ‏`payments/refund.ts` | ‏`requireAdminSession` בשורה הראשונה |
| ‏`api/supplier/redeem` | ‏alias שמייצא מחדש את ה-POST של `vouchers/redeem`, ויורש את התקרה שלו |

## ‏5. עקיפת אדמין, וסטייה מכוונת מהמפרט

המפרט ביקש "admin bypass". **מה שקיים בפועל אינו עקיפה גורפת:** ‏actions של
אדמין אינם נמנים כלל, אבל **קונסולת השוברים של האדמין דווקא כן** — 
`admin-voucher-lookup` (60 לשעה) ו-`admin-voucher-redeem` (30 לשעה), שניהם
**לפי משתמש הצוות ולא לפי ‏IP**, כי משרד משותף הוא כתובת אחת והיה חולק דלי
אחד.

**‏09.09.2026 נוספו שתי שורות אדמין נוספות, ולכן הטענה הקודמת כאן ("שתי
השורות היחידות") כבר אינה נכונה ותוקנה:** ‏`admin-upload-url` (100 לשעה)
ו-`admin-image-process` (60 לשעה), שתיהן לפי משתמש הצוות. **הן אינן פטורות
דווקא משום שהן של צוות**, וזה ההפך מכלל ה-bypass:

- ‏`requestUploadUrl` מנפיק **‏presigned PUT URL** — אישור שממשיך לעבוד גם
  אחרי שהסשן שהנפיק אותו נעלם, עד לפקיעתו. בלי תקרה, אסימון צוות אחד מנפיק
  מספר בלתי חסום שלהם, **והתקרה על ההנפקה היא הדבר היחיד שחוסם כמה מהם
  יכולים להתקיים בו-זמנית.**
- ‏`processAndUploadImage` מפענח העלאה ופולט ‏AVIF ו-WebP בארבעה רוחבים דרך
  ‏sharp **בתוך הבקשה**, ולכן קורא בלתי חסום הוא ‏CPU בלתי חסום על השרת שמגיש
  את החנות. **התקרה היא על העבודה, לא על האמון.**

ארבע השורות האלה הן המקומות היחידים שבהם פעולה של אדמין נמנית.

## ‏6. מה נבדק ולא נמצא בו פער

- **כל מה שהמפרט נוקב בשמו מכוסה:** ‏auth, מוטציות עגלה, יצירת צ'ק-אאוט,
  מימוש שובר, חיפוש, העלאת תמונות, טופסי יצירת קשר.
  **‏תיקון 09.09.2026: "העלאת תמונות" לא הייתה מכוסה כשהשורה הזו נכתבה.**
  שני מסלולי ההעלאה היו מאחורי ‏`requireStaffSession` **ובלי שום תקרה**, וזה
  נקרא ככיסוי כי הם היו שמורים. שמור ולא מוגבל אינו מוגבל. תוקן בסעיף ‏5.
- **‏`loadGiftPreview` נבחן כמועמד ונדחה.** הוא אנונימי, רץ על ה-service
  role, ועושה שאילתה לכל קריאה — אבל האסימון הוא ‏256 ביט אקראיים, ולכן אין
  מרחב לסרוק. השוואה ל-`/c/[code]`, שכן מוגבל, אינה מחזיקה: שם הקוד הוא ‏8
  ספרות (10^7 אפשרויות), ותקרת ה-30 לשעה שם היא **הגנה מפני מנייה** ולא
  מפני עומס. להעתיק את התקרה לכאן היה חיקוי של תבנית בלי הנימוק שלה.

## ‏7. שרשרת הגיבוי, וכשל פתוח

`upstash` → `postgres` (`check_rate_limit`, אותן שורות ב-`rate_limits`) →
`open`. **הכשל הוא פתוח, במכוון ובירושה:** שני המגבילים ב-Postgres כבר
החזירו `true` על כל שגיאה. כשל סגור היה מוציא כל לקוח מהצ'ק-אאוט בזמן תקלה
של ‏Upstash.

המחיר: תקלה היא גם דלת פתוחה. לכן `backend: 'open'` נרשם ב-**error** בכל
בקשה ולא בדגימה, ו-`rate_limiter` בדוח הבריאות (`src/lib/health/checks.ts`)
קיים בדיוק כדי לתפוס את המצב הזה. **‏`UPSTASH_REDIS_REST_URL` אינו מוגדר
באף סביבה שהריפו הזה רואה היום**, ולכן המסלול החי הוא ‏Postgres.

## ‏8. ההנחה שמתחת לכל תקרה לפי ‏IP

`getClientIp` קורא את `x-forwarded-for` כפי שהוא. **נמדד:** שלוש בקשות
ל-`/api/search` עם ערכים שונים בכותרת יצרו שלוש שורות נפרדות ב-`rate_limits`.
בפרודקשן האפליקציה יושבת מאחורי ‏Vercel שכותב את הכותרת בעצמו, וזה כל מה
שהופך את המפתח לאמין. **זו הנחה על הפריסה, לא תכונה של הקוד.** אם האפליקציה
תוגש אי פעם ממשהו שאינו דורס את הכותרת, כל תקרה לפי ‏IP כאן היא קישוט.
