# ‏מה נשאר לך: שלושה פריטים

‏נכתב ‏01.09.2026, עודכן ‏31.08.2026 כשהמתזמן עבר ל-GitHub Actions.
‏זה המסמך היחיד שאתה צריך לקרוא.

‏**הקוד גמור והאתר חי בפרודקשן.** נמדד:

```
https://kenyonexpress.vercel.app/          200
/api/health   {"ok":true,"database":"ok"}
/api/cron/health                           401
```

‏ה-401 הוא **הצלחה**: הוא מוכיח ש-`CRON_SECRET` מוגדר בדיפלוימנט ושעשרת מסלולי
ה-cron סגורים לאינטרנט.

‏שלושה פריטים נשארו. אף אחד מהם אינו קוד.

‏**סדר ההרצה קובע.** פריט ‏3 (‏DNS) הוא היחיד שאינו הפיך בשניות, והוא חייב לבוא
**אחרי** פריט ‏2, כי את התשלום האמיתי הראשון עושים על כתובת ה-`vercel.app`
בזמן שהדומיין עוד מצביע על וורדפרס.

| # | פריט | זמן | חוסם מה |
|---|---|---|---|
| ‏1 | ‏`CRON_SECRET` ב-GitHub Actions | דקה אחת | שוברים לא נשלחים ללקוחות |
| ‏2 | מסוף Cardcom לייצור | שיחת טלפון + ‏10 דקות | אי אפשר לגבות שקל |
| ‏3 | ניתוק ה-DNS | ‏30 דקות + המתנה | האתר האמיתי לא באוויר |

---

## ‏1. הסוד של ה-cron ב-GitHub

‏**זה הפריט הכי דחוף ברשימה.** עשרת המסלולים פרוסים ומאובטחים. המתזמן הוא
GitHub Actions (`.github/workflows/scheduled-jobs.yml`). בלי הסוד ב-GitHub
הריצה נכשלת סגורה ואף מסלול לא נקרא. ‏`notifications` הוא **המסלול היחיד**
שדרכו לקוח מקבל את השובר שלו.

### ‏1.1 קח את הסוד מ-Vercel, הדבק ב-GitHub

‏**Chrome > Vercel > הפרויקט `kenyonexpress` > Settings > Environment Variables**

מצא את:

```
CRON_SECRET
```

לחץ על העין כדי לחשוף את הערך והעתק אותו. הוא נראה כמו ‏64 תווים הקסדצימליים.
‏**הערך עצמו לא כתוב באף מסמך בריפו, בכוונה.**

‏**Chrome > GitHub > הריפו `kenyonexpress/kenyonexpress` > Settings > Secrets
and variables > Actions > New repository secret**

- Name:

```
CRON_SECRET
```

- Secret: הערך שהעתקת מ-Vercel. אותו ערך, בייט לבייט.

‏אם המשתנה לא קיים ב-Vercel, צור אותו שם קודם. ‏**Terminal:**

```bash
openssl rand -hex 32
```

והדבק את התוצאה ל-Vercel תחת השם `CRON_SECRET`, Environment = `Production`.
‏אחרי הוספה של משתנה חדש צריך **redeploy**, לא restart. אחר כך אותה מחרוזת
ב-GitHub.

### ‏1.2 תוודא שזה עובד

‏**Chrome > GitHub > Actions > Scheduled jobs > Run workflow**

הרץ פעם אחת עם `dry_run` מסומן (מדפיס את הסט, בלי לקרוא לייצור). אחר כך הרץ
עם `job` =

```
health
```

ו-`dry_run` כבוי. מצפים ל-200.

‏**Terminal, במקביל:**

```bash
# ‏מצפים ל-401: מוכיח שהשומר חי ושהסוד נדרש.
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.vercel.app/api/cron/health

# ‏מצפים ל-200: מוכיח שהסוד שהדבקת הוא הסוד שבדיפלוימנט.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://kenyonexpress.vercel.app/api/cron/health
```

‏אם הראשון מחזיר משהו שאינו ‏401, **עצור**: המסלול לא מאובטח באותו דיפלוימנט.

‏אם השני מחזיר ‏401, הערך ב-GitHub והערך ב-Vercel שונים. **זאת הדרך הכי
נפוצה שההגדרה הזאת נכשלת**, כי שני הצדדים נראים נכונים כשמסתכלים על כל אחד לחוד.

‏אחרי המיזוג ל-main וחמש דקות, הריצה `Scheduled jobs` ב-Actions צריכה להיות ירוקה.

cron-job.org נשאר נפילה אחורה אם GitHub מאחר את תזמון חמש הדקות. אל תריץ את
שניהם יחד.

---

## ‏2. מסוף Cardcom לייצור

‏**טלפון: ‏03-9436100.**

### ‏2.1 מה לבקש בשיחה

בקש **מסוף ייצור** (‏production terminal) לחשבון הסולק שלך, ואת ארבעת הפרטים:

```
Terminal Number
API User Name
API Password
```

‏**מסוף בדיקה לא מספיק.** הוא מקבל כרטיסים אמיתיים ולא מסלק אותם לשום מקום.

בקש מהם במפורש גם:

- ‏שהמסוף יתמוך ב-**tokenization** (שמירת אמצעי תשלום), כי המנויים עובדים מול טוקן.
- ‏שהחשבון יתמוך ב-**מסמכי חשבונית/קבלה** דרך ה-API, כי המערכת מנפיקה אותם אוטומטית.

### ‏2.2 איפה להדביק

‏**Chrome > Vercel > `kenyonexpress` > Settings > Environment Variables >
Environment = `Production`**

חמישה משתנים. הוסף כל אחד בנפרד:

```
CARDCOM_TERMINAL_NUMBER     ← מ-Cardcom
CARDCOM_API_NAME            ← מ-Cardcom
CARDCOM_API_PASSWORD        ← מ-Cardcom
CARDCOM_WEBHOOK_SECRET      ← אתה ממציא. Terminal: openssl rand -hex 32
CHECKOUT_ENABLED            ← בדיוק המחרוזת: true
```

‏**‏`CARDCOM_WEBHOOK_SECRET` הוא לא משהו ש-Cardcom נותנת לך.** אתה מייצר אותו.
‏זה הסוד הבלתי-ניחוש שרוכב על ה-IndicatorUrl בתור `?s=`, והוא הדבר היחיד שעומד
בין ה-webhook לבין האינטרנט, כי **‏Cardcom לא חותמת על ה-callbacks שלה**. אין
‏HMAC ואין כותרת חתימה.

‏**‏`CHECKOUT_ENABLED` חייב להיות בדיוק `true`.** בפרודקשן הקוד בודק שוויון
למחרוזת המדויקת הזאת, אז `TRUE`, ‏`1`, או משתנה חסר כולם סוגרים את הקופה. זה
מכוון: הדיפלוימנט היחיד שבו שוכחים להגדיר אותו הוא זה שלוקח כרטיסים אמיתיים.

‏**⛔ אסור להגדיר `CARDCOM_USE_MOCK` בפרודקשן. לעולם.** הוא גורם לתשלומים
להצליח בלי שכרטיס חויב.

אחרי הוספת המשתנים: ‏**Vercel > Deployments > הדיפלוימנט האחרון > Redeploy.**
משתני סביבה נקראים בזמן בנייה, אז זה redeploy ולא restart.

### ‏2.3 תשלום אמיתי אחד, לפני שהדומיין זז

‏**Chrome > <https://kenyonexpress.vercel.app>**

קנה את הקופון הזול באתר, בכרטיס אמיתי. אל תדלג על זה ואל תעשה את זה עם המוק.

ואז ודא, בסדר הזה:

‏**Supabase > SQL Editor:**

```sql
select id, status, paid_at, total_ils from orders order by created_at desc limit 1;
select id, status, code from vouchers order by created_at desc limit 1;
```

- מייל האישור הגיע (זה מה שבודק את Resend מקצה לקצה).
- ‏`/account/orders` מציג את ההזמנה.
- ‏`/account/coupons` מציג את ה-QR, ו-`/scan` מקבל אותו **פעם אחת** ומסרב בשנייה.
- הדשבורד של Cardcom מציג את העסקה באותו סכום.

ואז **החזר את הכסף מהדשבורד של Cardcom** וודא שההחזר נוחת.

‏**Rollback:** קבע `CHECKOUT_ENABLED=false` ב-Vercel ועשה redeploy. החנות נשארת
באוויר ולצפייה, ורק כפתור התשלום נסגר.

---

## ‏3. ניתוק ה-DNS

‏**זה השלב היחיד שאינו הפיך בשניות.** כל השאר חוזר לאחור בלחיצה; זה חוזר לאחור
בקצב שה-DNS מתפשט.

‏**שני דברים נשברים ברגע שזה קורה, ושניהם ידועים:**

‏1. ‏**כל ‏32 תמונות המוצרים מחזירות ‏404.** הן מוגשות מ-
   ‏`kenyonexpress.co.il/wp-content/uploads/...` על ידי אותה התקנת וורדפרס
   שהאתר הזה מחליף. **תמשוך אותן ל-R2 לפני השלב הזה**, אחרת ‏19 המוצרים
   האמיתיים עולים לאוויר בלי תמונה.
‏2. אתר הוורדפרס הישן מפסיק להיות נגיש בכתובות שלו.

### ‏3.0 המצב שממנו אתה מתחיל

נמדד ב-`dig` ב-01.09.2026, לא הונח:

```
kenyonexpress.co.il      A     104.21.55.125       (Proxied)
kenyonexpress.co.il      A     172.67.148.28       (Proxied)
kenyonexpress.co.il      AAAA  2606:4700:3035::6815:377d
kenyonexpress.co.il      AAAA  2606:4700:3036::ac43:941c
www.kenyonexpress.co.il  A     104.21.55.125
www.kenyonexpress.co.il  A     172.67.148.28
www.kenyonexpress.co.il  AAAA  2606:4700:3035::6815:377d
www.kenyonexpress.co.il  AAAA  2606:4700:3036::ac43:941c

NS   derek.ns.cloudflare.com, elma.ns.cloudflare.com
MX   10 mailgw2.spd.co.il
```

ה-NS הם של Cloudflare, ולכן **‏Cloudflare הוא המקום שבו עורכים DNS**. הרשם לא
מעורב בשלב הזה בכלל.

‏**Terminal**, לפני שאתה נוגע במשהו:

```bash
dig +short kenyonexpress.co.il A     >  ~/Desktop/dns-before-cutover.txt
dig +short kenyonexpress.co.il AAAA  >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il A    >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il AAAA >> ~/Desktop/dns-before-cutover.txt
cat ~/Desktop/dns-before-cutover.txt
```

### ‏3.1 יום לפני: הורד את ה-TTL

‏**Chrome > Cloudflare > kenyonexpress.co.il > DNS > Records**

לכל אחת משמונה הרשומות (ארבע ‏A וארבע ‏AAAA, על `kenyonexpress.co.il` ועל `www`):
‏**Edit** ‏> ‏**TTL** מ-`Auto` ל-**2 min** ‏> ‏**Save**.

‏`Auto` על רשומה ‏Proxied אומר ש-Cloudflare מחליט, ואז rollback לוקח כמה שהוא
לוקח. שתי דקות הופכות את ה-rollback בסעיף ‏3.5 לקפה במקום לצהריים.
‏**תעשה את זה יום לפני, לא ביום עצמו.**

### ‏3.2 קודם Vercel, אחר כך DNS

‏**Chrome > Vercel > הפרויקט `kenyonexpress` > Settings > Domains >
‏Add Existing Domain**

‏1. הקלד `kenyonexpress.co.il` ‏> ‏**Add**.
‏2. הקלד `www.kenyonexpress.co.il` ‏> ‏**Add**.
‏3. ‏Vercel מציג את הרשומה שהוא רוצה: רשומת **A** ל-apex שמצביעה על
   ‏**`76.76.21.21`**. השאר את המסך הזה פתוח; שם תראה שהשינוי נחת.

‏Vercel ידווח על שני הדומיינים ‏"Invalid Configuration" עד שסעיף ‏3.3 יסתיים.
זה צפוי ואינו שגיאה שצריך לפעול לפיה.

### ‏3.3 ‏Cloudflare: הניתוח המדויק

‏**Chrome > Cloudflare > kenyonexpress.co.il > DNS > Records**

‏‏Zone ID:

```
13a3f166fadbde6b432dff3b9668479a
```

‏(‏Cloudflare > kenyonexpress.co.il > Overview > מקטע API, למטה מימין.)

‏**מחק את ארבע הרשומות האלה. את כל הארבע, ורק אותן:**

| Type | Name | Content |
| --- | --- | --- |
| ‏AAAA | `kenyonexpress.co.il` | `2606:4700:3035::6815:377d` |
| ‏AAAA | `kenyonexpress.co.il` | `2606:4700:3036::ac43:941c` |
| ‏AAAA | `www` | `2606:4700:3035::6815:377d` |
| ‏AAAA | `www` | `2606:4700:3036::ac43:941c` |

‏**‏Vercel מגיש את ה-apex ב-IPv4 בלבד.** רשומת ‏AAAA שנשארה מאחור היא התוצאה
הגרועה ביותר האפשרית כאן: לקוחות עם ‏IPv6 מעדיפים ‏AAAA, אז חלק מהתעבורה שלך
ימשיך להגיע לפרוקסי הישן בזמן שכל מה שאתה בודק מהמכונה שלך נראה תקין.

‏**ואז השאר בדיוק רשומת ‏A אחת לכל שם, ערוכה לזה:**

| Type | Name | Content | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| ‏A | `kenyonexpress.co.il` | `76.76.21.21` | ‏**DNS only** (ענן אפור) | ‏2 min |
| ‏A | `www` | `76.76.21.21` | ‏**DNS only** (ענן אפור) | ‏2 min |

לכל שם יש **שתי** רשומות ‏A כרגע. ערוך אחת מהזוג ל-`76.76.21.21` ומחק את
השנייה, כך שלכל שם תישאר ‏A אחת. שתי רשומות ‏A עושות round-robin, וחצי
מהתעבורה שהולכת ל-`172.67.148.28` היא חצי מהתעבורה שעדיין מקבלת וורדפרס.

‏**‏Proxy status חייב להיות ‏DNS only.** הענן האפור, לא הכתום. ‏Proxied שם את
ה-TLS של Cloudflare לפני זה של Vercel, וכך מקבלים לולאת הפניות או תעודה לא
נאמנת, ו-Vercel לא יכול להנפיק תעודה משלו לשם שרשומת ה-A שלו עונה כ-Cloudflare.

‏**⛔ אל תיגע בשום דבר אחר ב-zone הזה.** במיוחד השאר בשקט:

- ‏את רשומת ה-`MX` ‏(`10 mailgw2.spd.co.il`)
- ‏כל רשומת `TXT`: ‏SPF, ‏DKIM, ‏DMARC, וכל טוקן אימות
- ‏את הרשומות `mail`, ‏`pop`, ‏`smtp` ו-`ftp`

אלה שירות הדואר של ספק האחסון, והוא לא זז. מחיקה או proxying של אחת מהן עוצרת
את הדואר של העסק, והתסמין מופיע שעות אחר כך כ-bounces ולא מיד כשגיאה.

### ‏3.4 אימות, בסדר הזה

‏**Terminal:**

```bash
# ‏1. רשומת A אחת, והיא של Vercel.
dig +short kenyonexpress.co.il A          # מצפים בדיוק ל: 76.76.21.21
dig +short www.kenyonexpress.co.il A      # מצפים בדיוק ל: 76.76.21.21

# ‏2. אפס AAAA. פלט ריק הוא ההצלחה.
dig +short kenyonexpress.co.il AAAA       # מצפים לכלום
dig +short www.kenyonexpress.co.il AAAA   # מצפים לכלום

# ‏3. הדואר לא נגוע.
dig +short kenyonexpress.co.il MX         # מצפים ל: 10 mailgw2.spd.co.il.
dig +short kenyonexpress.co.il TXT        # מצפים ל-SPF שלך, ללא שינוי

# ‏4. האתר הוא החדש.
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content     # מצפים ל-0
```

‏‏AAAA שעדיין עונה בבדיקה ‏2 אומר שפספסת רשומה. חזור ל-3.3.

‏`wp-content` שעדיין מופיע בבדיקה ‏4 אומר שמוגש לך האתר הישן, מהמטמון או כי
ההתפשטות לא הסתיימה. **חכה, ואל תשנה שום דבר אחר בזמן ההמתנה.**

### ‏3.5 ‏Rollback: להחזיר את Cloudflare לפני וורדפרס

מחזיר בדיוק את המצב מ-3.0. עם ה-TTL של שתי דקות מ-3.1 זה חי תוך דקות.

לכל אחד מ-`kenyonexpress.co.il` ומ-`www`, החזר **שתי** רשומות ‏A לכל שם:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| ‏A | `kenyonexpress.co.il` | `172.67.148.28` | ‏**Proxied** (ענן כתום) |
| ‏A | `kenyonexpress.co.il` | `104.21.55.125` | ‏**Proxied** (ענן כתום) |
| ‏A | `www` | `172.67.148.28` | ‏**Proxied** (ענן כתום) |
| ‏A | `www` | `104.21.55.125` | ‏**Proxied** (ענן כתום) |

‏**אין צורך ליצור מחדש את רשומות ה-AAAA ביד.** הן היו כתובות הפרוקסי של
‏Cloudflare עצמו, ו-Cloudflare מפרסם ‏IPv6 לרשומה ‏Proxied מעצמו. החזרת רשומות
ה-A עם הענן הכתום היא כל ה-rollback.

השאר את הדומיין מחובר ב-Vercel גם כשאתה מגולגל לאחור. דומיין מחובר שאף רשומה לא
מצביעה אליו לא עולה כלום, וחוסך הנפקת תעודה מחדש בניסיון השני.

### ‏3.6 אחרי שהדומיין זז

‏1. ‏**‏cron-job.org**: עדכן את כל עשרת ה-URL מ-`kenyonexpress.vercel.app`
   ל-`kenyonexpress.co.il`. כתובת ה-vercel.app ממשיכה לעבוד, אבל ה-apex הוא
   המקור הקנוני ואליו מכוונים ה-redirects, ה-sitemap וה-cookies.
‏2. ‏**Google Search Console**: הוסף את ה-property והגש את `sitemap.xml`.
‏3. ‏**Sentry**: ודא שאירוע מגיע מהדיפלוימנט. ‏`/debug/sentry` חסום מאחורי
   ‏`SENTRY_DEBUG_ROUTES` והוא הדרך המהירה להוכיח את זה.
‏4. עקוב אחרי השעה הראשונה של הרצות `notifications`.

---

## ‏4. מיזוג ‏PR #6

‏**Chrome > <https://github.com/kenyonexpress/kenyonexpress/pull/6>**

נמדד ‏01.09: פתוח כ-**draft**, ‏`phase5/homepage` ‏אל `main`, ‏**MERGEABLE**,
‏‏+53,478 / ‏-2,717.

‏1. לחץ **Ready for review** (הוא draft, ולכן לא ניתן למיזוג כמו שהוא).
‏2. חכה שארבע בדיקות ה-status יעברו.
‏3. ‏**Merge pull request**.

‏**למה זה משנה:** ‏`main` מפגר בכ-300 קומיטים, והוא ה-branch שברירת המחדל
ב-GitHub מצביעה עליו. עד שזה ימוזג, כל דבר שמושך את ברירת המחדל (‏clone חדש,
ברירת מחדל של CI, מישהו שקורא את הריפו בפעם הראשונה) מקבל מוצר שאינו קיים, בלי
כל עבודת האבטחה שנעשתה מאז.

---

## פריטים פתוחים שאינם חוסמים השקה

- ‏**Resend**: <https://resend.com/domains/8cbce0e7-2334-40dc-aba6-fce92e80371f>.
  העתק את שלוש רשומות ה-DNS ל-Cloudflare ולחץ **Verify**. **תעשה את זה מוקדם**:
  עד שהדומיין מאומת כל דואר טרנזקציוני נדחה, כלומר אף קונה לא מקבל שובר.
- ‏**Supabase > Authentication > Sign In / Providers > Email**: הפעל
  ‏**"Prevent use of leaked passwords"**. זה מתג בדשבורד, לא ‏DDL, ואין לו API.
  כרגע כבוי.
- ‏**חמישה ספקים בלי פרטים מחזיקים את הקטלוג האמיתי** (‏27 מוצרים). מלא אותם
  באדמין או העבר את המוצרים לספק אמיתי. הפירוט ב-`docs/FINAL-REPORT.md`.
- ‏**‏`/about` בלי תוכן**, והדפים המשפטיים ממתינים לאישור עורך דין. כל מסמך נושא
  שורה גלויה "טרם נבדק על ידי עורך דין" עד אז.

---

## מסמכים

| למה | איפה |
| --- | --- |
| הרצף המלא של יום העלייה, עם rollback לכל שלב | ‏`docs/LAUNCH-RUNBOOK.md` |
| עשרת ה-cron, ההסבר המלא והפתרון לתקלות | ‏`docs/CRON-EXTERNAL.md` |
| תמונת מצב מלאה: מה נבנה, מה נמדד, מה נשאר | ‏`docs/FINAL-REPORT.md` |
| כל משתנה סביבה, עם מקור ואתר קריאה | ‏`.env.example` |
| מה קרה ולמה, לאורך כל הפרויקט | ‏`STATE.md` |

‏**מסמכים שמסומנים ⛔ בראשם מיושנים.** אל תפעל לפיהם; הבאנר מפנה למסמך המחייב.
