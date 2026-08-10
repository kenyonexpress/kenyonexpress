# מפרט Deep Links

סכמת `kenyonexpress://` ו-universal links, ומה שייך לכל אחת.

Status: **BINDING** · עודכן: 2026-08-10
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md   (D9: scheme ל-OAuth בלבד)
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/APP-STORE-SUBMISSION.md
```

**מקור האמת בקוד:** `src/lib/app/deep-links.ts` ו-`apps/mobile/app.json`.
המסמך הזה מתאר את מה שמומש שם, לא תוכנית.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| L1 | **שתי משפחות קישורים, ולא ניתן להחליף ביניהן.** ‏https = ציבורי ושמיש, סכמה = ערוץ פנימי בלבד. |
| L2 | **כל מה שאדם עלול לראות או לשתף הוא https.** מיילים, ‏push, שיתוף, ‏QR. |
| L3 | **הסכמה משמשת לשניים בלבד:** חזרה מעמוד תשלום, ו-redirect של OAuth. |
| L4 | **כתובת החזרה שנמסרת ל-Cardcom היא https תמיד.** ראה §3. זו לא בחירת סגנון. |
| L5 | **קופון לא משותף בקישור.** ‏D9 במסמך המובייל. |
| L6 | כל universal link חייב להיות **עמוד אמיתי באתר**. אין קישור שמניח שהאפליקציה מותקנת. |

---

## 1. שתי המשפחות

### 1.1 Universal links, כלומר `https://kenyonexpress.co.il/...`

זה מה שהולך למיילים, ל-push, לשיתוף ולכל דבר שאדם עלול לראות. הקישור נפתח
באפליקציה כשהיא מותקנת, ובאתר כשלא, ולכן **לקוח בלי האפליקציה לעולם לא רואה
קישור מת**.

זו הסיבה ל-L6: אם כתובת כזאת אינה עמוד אמיתי, מי שאין לו את האפליקציה מקבל 404.

### 1.2 הסכמה `kenyonexpress://`

ערוץ פנימי. **טלפון בלי האפליקציה מציג שגיאה** על קישור כזה, ולכן הוא לעולם לא
נשלח במייל ולא ניתן לשיתוף.

| שימוש מותר | למה |
|---|---|
| חזרה מעמוד התשלום | ראה §3 |
| ‏redirect של OAuth | ‏D9 |

---

## 2. טבלת הכתובות

| מטרה | Universal link | סכמה |
|---|---|---|
| בית | `/` | `kenyonexpress://` |
| הקופונים שלי | `/account/coupons` | `kenyonexpress://coupons` |
| קופון בודד | `/account/coupons/<id>` | `kenyonexpress://coupons/<id>` |
| ארנק | `/account/wallet` | `kenyonexpress://wallet` |
| הזמנה | `/account/orders/<id>` | `kenyonexpress://orders/<id>` |
| חזרה מתשלום | `/checkout/app-return?order_id=&status=` | `kenyonexpress://checkout/return?order_id=&status=` |
| מוצר | `/product/<slug>` | אין |

**‏`push` נושא שניהם:** ‏`data.path` הוא נתיב האפליקציה, ‏`data.url` הוא ה-
universal link. אפליקציה שקיבלה התראה משתמשת ב-`path`; אותו תוכן במייל משתמש
ב-`url`.

---

## 3. ‏⚠️ למה כתובת החזרה מ-Cardcom היא https ולא הסכמה

**זו ההחלטה שהכי קל לטעות בה, וההסבר חייב להישאר כתוב.**

‏Cardcom מפנה את **העמוד שלה** לכתובת שאנחנו מוסרים לה. ‏**redirect לסכמה
מותאמת שמגיע מעמוד צד-שלישי נחסם על הסף ב-iOS WKWebView**, ומוצג כשגיאה
ב-Chrome Custom Tabs. כלומר: מסירת `kenyonexpress://` ל-Cardcom משאירה **כל
תשלום באפליקציה תקוע**, אחרי שהכסף כבר נלקח.

לכן החזרה נוחתת ב-`/checkout/app-return`, עמוד אמיתי במקור שלנו.

### שני מנגנוני חזרה, ואף אחד לא מיותר

| # | מנגנון | מתי הוא זה שעובד |
|---|---|---|
| 1 | ה-WebView מזהה את **הקידומת** `/checkout/app-return` וסוגר את הגיליון | המסלול הרגיל. העמוד בדרך כלל אפילו לא מצויר |
| 2 | העמוד עצמו קופץ ל-`kenyonexpress://checkout/return` | כש-3-D Secure העיף את המשתמש לדפדפן המערכת ואיש לא צופה בניווט |

בנוסף יש **כפתור ידני** בעמוד, למקרה ששני המנגנונים נחסמו. אחרת המשתמש נתקע
על עמוד ריק אחרי שחויב.

### ‏`status` בכתובת החזרה הוא קישוט

מצב ההזמנה נקבע ב-webhook וב-`GetLpResult` בצד השרת. מסך החזרה באפליקציה **קורא
את ההזמנה מהמסד** ולא מאמין לפרמטר. ערך לא מוכר נקרא כ-`failed`, כי הטעות הזולה
היא להראות "בודקים" למי ששילם.

---

## 4. הגדרות פלטפורמה

### iOS, Universal Links

```
associatedDomains: ["applinks:kenyonexpress.co.il", "applinks:www.kenyonexpress.co.il"]
```

חובה: קובץ `apple-app-site-association` ב-`/.well-known/`, **ללא סיומת**,
מוגש כ-`application/json`, **בלי redirect**. ‏iOS מוריד אותו דרך שרתי CDN של
אפל, ולכן שינוי בו אינו מיידי.

### Android, App Links

```
intentFilters: autoVerify: true, pathPrefix: /account, /checkout, /product
```

חובה: `assetlinks.json` ב-`/.well-known/` עם ה-SHA-256 של **מפתח החתימה של
החנות**, לא של מפתח ה-debug. זו הטעות שגורמת ל"עובד אצלי ולא בפרודקשן".

### שניהם

הסכמה עצמה מוגדרת פעם אחת: `expo.scheme` ב-`app.json`, ובצד השרת
`APP_SCHEME` ב-`src/lib/app/deep-links.ts`. **שינוי באחד בלי השני שובר את
החזרה מהתשלום.**

---

## 5. מה אסור

| ⛔ | למה |
|---|---|
| קישור סכמה במייל או ב-SMS | טלפון בלי האפליקציה מקבל שגיאה |
| ‏QR של קופון כקישור לשיתוף | ‏D9: קופון אינו משותף |
| ‏universal link לכתובת שאינה עמוד באתר | ‏404 לכל מי שאין לו את האפליקציה |
| ‏`kenyonexpress://` כ-redirect שמוסרים לצד שלישי | נחסם ב-iOS, ראה §3 |
| נתיב שמתחיל ב-`//` בתוך `data.path` | זו כתובת חיצונית, לא נתיב. הקוד דוחה אותה |

---

## 6. Acceptance

- [ ] קישור `/account/coupons` ממייל פותח את האפליקציה כשהיא מותקנת, ואת האתר כשלא.
- [ ] תשלום שהושלם ב-WebView חוזר לאפליקציה בלי שהעמוד `app-return` מצויר.
- [ ] תשלום שעבר 3-D Secure בדפדפן המערכת חוזר דרך הסכמה.
- [ ] תשלום שנחסמו בו שני המנגנונים מציג כפתור חזרה ידני.
- [ ] מסך החזרה מציג את מצב ההזמנה **מהמסד**, לא מהפרמטר.
- [ ] ‏`assetlinks.json` נושא את טביעת מפתח החנות.

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | נכתב מול המימוש ב-`src/lib/app/deep-links.ts` ו-`apps/mobile`. |
