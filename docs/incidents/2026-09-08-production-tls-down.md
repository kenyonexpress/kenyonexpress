# ‏SEV1 פתוח: פרודקשן לא נגיש, ושער הפיקסלים איבד את ההפניה שלו

תאריך המדידה: ‏2026-09-08, ‏05:40. ענף: `closeout/v1-final`.
מסמך זה תיעוד ממצא, לא ‏postmortem: **התקלה פתוחה בזמן הכתיבה.**

---

## 1. מה נמדד

```
$ curl https://kenyonexpress.co.il
curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL ... :443
                                             -> 000

$ curl https://www.kenyonexpress.co.il/
curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL ... :443
                                             -> 000

$ curl http://kenyonexpress.co.il
                                             -> 308  https://www.kenyonexpress.co.il/

$ openssl s_client -connect kenyonexpress.co.il:443
no peer certificate available

$ dig +short kenyonexpress.co.il
216.198.79.1
64.29.17.1

$ dig +short www.kenyonexpress.co.il
cname.vercel-dns.com.
76.76.21.22
```

**‏TLS מת על האפקס וגם על ‏www. אין תעודה כלל, לא פגה ולא שגויה: אין.**
‏DNS כבר מופנה ל-Vercel.

---

## 2. למה זה חמור מ-"האתר למטה"

### 2.1 ‏HTTP מגרש את המבקר אל הנקודה המתה

‏`http://kenyonexpress.co.il` עונה ‏**‏308 אל `https://www...`**, שהוא בדיוק
היעד שאין לו תעודה. כלומר **אין מסלול עובד אחד**: מי שמקליד את הדומיין
בלי סכימה מנותב אוטומטית לכשל.

### 2.2 ‏HSTS הופך את זה לדביק

‏`next.config.ts` שולח על כל מסלול:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**‏63,072,000 שניות הן שנתיים**, ‏`includeSubDomains` מרחיב לכל תת-דומיין,
ו-`preload` מבקש הטמעה ברשימת הדפדפנים.

כלומר כל דפדפן שראה פעם את הכותרת הזו **מסרב לדבר עם הדומיין ב-HTTP
במשך שנתיים**, ומכיוון ש-HTTPS מת, הוא נשאר בלי שום דרך להגיע.
‏**ההקשחה שנכונה כשיש תעודה היא נזק כשאין.**

### 2.3 מה שזה אומר על 30 המסמכים שנכתבו אתמול

כל מסמך שיווקי, ‏SEO, רכישת לקוחות או תוכן מניח אתר נגיש.
‏**אף אחד מהם אינו בר-ביצוע כרגע.** ‏קמפיין, פוסט, או פנייה לספק שמפנים
לדומיין מגיעים לשגיאת אבטחה של הדפדפן, וזו הרושם הראשון הגרוע ביותר
שאפשר לייצר.

---

## 3. שער הפיקסלים איבד את הצד החי, והוא כתב זאת בעצמו

השורה האחרונה ב-`docs/UI-PARITY-REPORT.md`:

```
| 2026-09-07 22:34 | home | 380 | n/a | **UNMEASURED** | 2407d8f02-dirty |
  screenshot failed: page.goto: net::ERR_CONNECTION_CLOSED
  at https://kenyonexpress.co.il/
```

`scripts/compare.mjs` מצלם את **שני** הצדדים בכל ריצה, והצד החי הוא:

```js
const LIVE_HOME     = 'https://kenyonexpress.co.il/'
const LIVE_PRODUCT  = 'https://kenyonexpress.co.il/product/מוצר-לדוגמא/'
const LIVE_CATEGORY = 'https://kenyonexpress.co.il/product-category/hot-deals/'
const LIVE_PRODUCTS = 'https://kenyonexpress.co.il/shop/'
const LIVE_CHECKOUT = 'https://kenyonexpress.co.il/checkout/'
```

### 3.1 שתי בעיות נפרדות, ורק אחת מהן היא ה-TLS

| # | הבעיה | חומרה |
|---|--------|--------|
| 1 | ‏**‏TLS מת**, ולכן אי אפשר לצלם את הצד החי בכלל | פתיר עם תעודה |
| 2 | ‏**הנתיבים הם ‏WooCommerce** (`/shop/`, ‏`/product-category/`, ‏`?post_type=product`) | ‏**לא פתיר עם תעודה** |

**גם כשה-TLS יחזור, הדומיין יגיש את אפליקציית ‏Next שלנו ולא את WooCommerce.**
‏`/shop/` ו-`/product-category/hot-deals/` לא קיימים ב-Next. כלומר השער
ישווה את האתר שלנו לעצמו, או ל-404.

**המשמעות: תקרת ה-11% ו"המרווח של כשליש אחוז" חדלו להיות מדידים.**
זה סותר במפורש את מה שנכתב אתמול ב-`docs/brand/BRAND-IDENTITY.md` §3.1
וב-`docs/testing/MOBILE-TESTING.md` §1.3, ושתיהן תוקנו.

### 3.2 מה שכן נשאר

`refs/ke_live_singlefile.html` הוא **קובץ בריפו**, והוא הצד החי של מסלול
‏`home`. ‏מסלול ‏`home` הוא היחיד שיכול להמשיך להימדד בלי רשת.
‏`docs/REFS-POLICY.md` קובע ש-`refs/` הוא תוצר ולא מקור, וזו נקודה שדורשת
הכרעה מחדש עכשיו כשהמקור נעלם.

---

## 4. מה לא נגעתי בו, ולמה

`scripts/compare.mjs`, ‏`scripts/parity-log.mjs` ו-`docs/UI-PARITY-REPORT.md`
**מסומנים כמשונים בעץ העבודה, עם חותמות זמן מ-05:33 עד 05:35**, כלומר
סוכן מקביל עובד עליהם בדיוק עכשיו. ‏`scripts/_touch-targets.mjs` הוא
untracked מאותה דקה.

**לא נגעתי באף אחד מהארבעה ולא הכנסתי אותם ל-commit.**
‏`git commit -- <paths>` לוקח את עץ העבודה ולא את ה-index, ולכן commit
רחב היה סוחף עבודה של סוכן אחר תחת ההודעה שלי.

---

## 5. מה נדרש, ומי יכול לעשות זאת

| # | פעולה | מי | חסום? |
|---|-------|-----|-------|
| 1 | ‏**להנפיק תעודה לדומיין ב-Vercel** | ‏**אופיר** | ‏אין ‏`vercel login` ואין token מקומי |
| 2 | לוודא שהפרויקט ב-Vercel בונה את הריפו הנכון | אופיר | אותו חסם |
| 3 | ‏**לשקול הורדת `preload` מ-HSTS** עד שיש תעודה יציבה | קוד | ‏§5.1 |
| 4 | להצביע את `compare.mjs` להפניה שאינה הדומיין החי | קוד | ‏**סוכן מקביל עובד על זה** |
| 5 | ניטור ‏uptime חיצוני | קוד | ‏`MONITORING-ALERTING.md` §4 |

### 5.1 על ‏`preload`

**‏`preload` הוא בקשה לרשימה שקשה מאוד לצאת ממנה.** ‏אתר שנרשם לרשימת
ה-preload בזמן שאין לו תעודה תקפה נעול מחוץ לעצמו אצל כל משתמש חדש,
והסרה מהרשימה אורכת חודשים.

**‏`max-age` ו-`includeSubDomains` נכונים ונשארים. ‏`preload` הוא ההימור
שלא כדאי לקחת לפני שהתעודה יציבה שבועיים.**
זו החלטת קוד, לא החלטת פריסה, ולכן היא בת-ביצוע כאן.

### 5.2 למה לא תיקנתי את ‏1 ו-2 לבד

‏`push` לפרודקשן ב-Vercel הוא אחד מארבעת המצבים שמחייבים עצירה לפי
‏`CLAUDE.md`, ובנוסף אין ‏`vercel login` ואין token במכונה הזו.
‏**ההנפקה חייבת להיעשות ידנית.**

---

## 6. מדוע ההתראה לא צלצלה

`/api/health` בודקת שבע תלויות, ‏`buildHealthAlert` מייצר שורה, ו-`sendAlert`
דוחף ל-ntfy. **ואף אחד לא קורא ל-`/api/health` מבחוץ**, ו-`vercel.json`
אינו מכיל ‏`crons`.

**זו בדיוק התקלה ש-`docs/operations/MONITORING-ALERTING.md` §4 חזה**, יום
אחרי שהמסמך נכתב. ‏**הצנרת בנויה במלואה חוץ מהחוליה שמפעילה אותה**, ולכן
פרודקשן מת שעות בלי שאיש ידע.

**וגם ניטור פנימי לא היה תופס את זה:** ‏`/api/health` רץ **בתוך** הפריסה.
כשל התעודה הוא בשכבה שלפניה. ‏**נדרש ניטור חיצוני**, ‏`MONITORING-ALERTING.md` §4.3.
