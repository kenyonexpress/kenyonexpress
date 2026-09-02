# יומן DNS cutover — 2026-09-03

תאריך היעד: 2026-09-03.
היקף: docs בלבד. **אין להריץ את ההפניה מכאן.** ההפניה ידנית אצל הבעלים ב-Cloudflare.

Zone ID:

```
13a3f166fadbde6b432dff3b9668479a
```

NS (לא משתנים):

```
derek.ns.cloudflare.com
elma.ns.cloudflare.com
```

העורך הוא **Cloudflare DNS**, לא הרשם. המקור הישן מאחורי הפרוקסי היה **CloudWays** (וורדפרס). הרשומות הציבוריות שנמדדו ב-`dig` ב-01.09.2026 היו כתובות ה-edge של Cloudflare, לא IP של שרת CloudWays עצמו.

ארכיון האתר הישן (לא בגיט, כלל
`refs/`
ב-
`.gitignore`):

```
refs/ke_live_*.html
refs/ke_live_*.png
refs/ke_live_computed.json
```

בלי הארכיון הזה אין למה להשוות אחרי שה-A זז.

---

## מצב לפני (נמדד, לא הונח)

```
kenyonexpress.co.il      A     104.21.55.125       Proxied
kenyonexpress.co.il      A     172.67.148.28       Proxied
kenyonexpress.co.il      AAAA  2606:4700:3035::6815:377d
kenyonexpress.co.il      AAAA  2606:4700:3036::ac43:941c
www.kenyonexpress.co.il  A     104.21.55.125       Proxied
www.kenyonexpress.co.il  A     172.67.148.28       Proxied
www.kenyonexpress.co.il  AAAA  2606:4700:3035::6815:377d
www.kenyonexpress.co.il  AAAA  2606:4700:3036::ac43:941c
MX                       10 mailgw2.spd.co.il
```

שתי רשומות A לכל שם = round-robin. השארת אחת מהן על CloudWays/Cloudflare אחרי החלפה שולחת חצי מהתעבורה לוורדפרס.

---

## מה נמחק ב-2026-09-03

רשומות **CloudWays / origin ישן דרך פרוקסי**, כולן:

| Type | Name | Content | פעולה |
|---|---|---|---|
| A | `@` (`kenyonexpress.co.il`) | `104.21.55.125` | מחק |
| A | `@` | `172.67.148.28` | מחק |
| AAAA | `@` | `2606:4700:3035::6815:377d` | מחק |
| AAAA | `@` | `2606:4700:3036::ac43:941c` | מחק |
| A | `www` | `104.21.55.125` | מחק |
| A | `www` | `172.67.148.28` | מחק |
| AAAA | `www` | `2606:4700:3035::6815:377d` | מחק |
| AAAA | `www` | `2606:4700:3036::ac43:941c` | מחק |

Vercel מגיש apex ב-IPv4 בלבד. AAAA שנשארת שולחת משתמשי IPv6 לפרוקסי הישן בזמן ש-`dig A` מהמכונה נראה תקין.

---

## מה נוצר ב-2026-09-03

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | `76.76.21.21` | **DNS only** (ענן אפור) | 2 דקות ביום המעבר |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (ענן אפור) | 2 דקות |

אין רשומת A על `www`. CNAME ל-
`cname.vercel-dns.com`
הוא מה ש-Vercel מפרסם ל-www. שתי רשומות A על www ל-`76.76.21.21` היו טיוטה ישנה ב-
`docs/OWNER-CHECKLIST.md`.
היומן הזה גובר ליום 03.09: apex = A, www = CNAME.

**ענן אפור חובה.** Proxied שם את TLS של Cloudflare לפני Vercel: לולאת הפניה או תעודה לא נאמנה, ו-Vercel לא מנפיק תעודה לשם שעונה כ-Cloudflare.

יום לפני: TTL של הרשומות הישנות יורד ל-2 דקות. ביום עצמו לא מתחילים מ-TTL אוטומטי.

---

## מה לא נוגעים בו

| Type | Name / תוכן | סיבה |
|---|---|---|
| MX | `10 mailgw2.spd.co.il` | דואר העסק. לא זז עם האתר |
| TXT | SPF, DKIM, DMARC, אימות דומיין | שבירת TXT = bounce שעות אחרי, לא שגיאה מיידית |
| `mail`, `pop`, `smtp`, `ftp` | רשומות ספק האחסון | אותו |
| NS | derek / elma | לא מחליפים רשם ביום cutover |

---

## אימות אחרי ההחלפה (Terminal)

```
dig +short kenyonexpress.co.il A
# מצפים בדיוק: 76.76.21.21

dig +short www.kenyonexpress.co.il CNAME
# מצפים: cname.vercel-dns.com.

dig +short kenyonexpress.co.il AAAA
dig +short www.kenyonexpress.co.il AAAA
# מצפים לפלט ריק

dig +short kenyonexpress.co.il MX
# מצפים: 10 mailgw2.spd.co.il.

dig +short kenyonexpress.co.il TXT
# SPF/DKIM כפי שהיו, בלי שינוי

curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content
# HTTP 200, ו-0 מופעים של wp-content
```

`wp-content` שעדיין מופיע: עדיין וורדפרס (מטמון או התפשטות). לחכות. לא לגעת ב-MX בינתיים.

לפני המעבר: 32 תמונות מוצר עדיין על
`kenyonexpress.co.il/wp-content/uploads/...`.
בלי משיכה ל-R2 הן 404 ברגע שה-A זז.

אחרי שהדומיין עונה Next:

1. עשרת ה-cron מכוונים ל-apex, לא רק ל-
   `kenyonexpress.vercel.app`.
2. Search Console: property + sitemap.
3. Sentry: אירוע מהדיפלוימנט.

---

## Rollback

מחזיר את מצב 01.09.2026. TTL של 2 דקות הופך את זה לדקות, לא לצהריים. אין צורך ליצור AAAA ביד: Cloudflare מפרסם IPv6 לרשומה Proxied.

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `172.67.148.28` | **Proxied** (ענן כתום) |
| A | `@` | `104.21.55.125` | **Proxied** (ענן כתום) |
| A | `www` | `172.67.148.28` | **Proxied** (ענן כתום) |
| A | `www` | `104.21.55.125` | **Proxied** (ענן כתום) |

ב-rollback: מוחקים את A של `@` ל-`76.76.21.21` ואת CNAME של `www`. משאירים את הדומיין מחובר ב-Vercel (חיבור בלי רשומה לא עולה כסף, חוסך הנפקת תעודה בניסיון הבא).

אימות rollback:

```
dig +short kenyonexpress.co.il A
# מצפים: 104.21.55.125 ו-172.67.148.28 (סדר לא משנה)
```

---

## יומן ביצוע (למילוי ביום עצמו)

| שעה (ישראל) | פעולה | מי | תוצאה |
|---|---|---|---|
|  | TTL → 2 min (יום קודם) | בעלים | |
|  | דומיינים מחוברים ב-Vercel | בעלים | Invalid Configuration עד שה-A זז: צפוי |
|  | מחיקת 4 A + 4 AAAA | בעלים | |
|  | יצירת A `@` = 76.76.21.21 DNS only | בעלים | |
|  | יצירת CNAME `www` = cname.vercel-dns.com DNS only | בעלים | |
|  | `dig` לפי הסעיף למעלה | סוכן / בעלים | |
|  | `curl` בלי wp-content | | |
|  | החלטה: נשארים / rollback | בעלים בלבד | |

סוכן קוד לא לוחץ Save ב-Cloudflare. ארבע העצירות חלות: זה push לפרודקשן ברמת DNS.
