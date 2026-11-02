# C143 — PROD SMOKE

Target: https://www.kenyonexpress.co.il (live production). Gate: 7 public URLs 200, /api/ready ok (meilisearch optional per owner decision), ח.פ 033798513 present.

## Result

| Check | Result |
|---|---|
| / /sitemap.xml /robots.txt /terms /privacy /returns /accessibility | all 200 |
| /api/ready | 200, ok:true; database/redis/r2/cardcom ok, meilisearch not_configured (optional) |
| ח.פ 033798513 | present on / (4x, footer), /terms /privacy /returns /accessibility (6x each) |
| /terms age 18 + הכשרות המשפטית | present |
| /returns 14ג | present |

No code changes. No forbidden files touched.

## Raw command output

```
$ date -u
Mon Nov  2 11:26:21 UTC 2026

$ for p in / /sitemap.xml /robots.txt /terms /privacy /returns /accessibility /api/ready; do curl -s -o /dev/null -w '%{http_code} %{size_download}B %{time_total}s' https://www.kenyonexpress.co.il$p; done
/                200 365550B 2.090178s
/sitemap.xml     200 14002B 0.627026s
/robots.txt      200 397B 0.539438s
/terms           200 178382B 0.306558s
/privacy         200 163737B 0.264339s
/returns         200 143043B 0.431846s
/accessibility   200 117428B 0.246011s
/api/ready       200 107B 0.834170s

$ curl -s https://www.kenyonexpress.co.il/api/ready
{"ok":true,"checks":{"database":"ok","redis":"ok","meilisearch":"not_configured","r2":"ok","cardcom":"ok"}}

$ curl -s -i https://www.kenyonexpress.co.il/api/ready | head -1
HTTP/2 200 

$ grep -o 033798513 | wc -l   (per page)
/                4
/terms           6
/privacy         6
/returns         6
/accessibility   6

$ curl -s /terms | grep -oE "(18|הכשרות המשפטית)" | sort | uniq -c
   6 18 שנים
   3 הכשרות המשפטית

$ curl -s /returns | grep -oE "14ג" | sort | uniq -c
   7 14ג

$ curl -s /sitemap.xml | grep -c "<loc>"
76

$ curl -s /robots.txt
User-Agent: *
Allow: /
Disallow: /redeem/
Disallow: /coupon/
Disallow: /account/
Disallow: /supplier/
Disallow: /scan
Disallow: /admin/
Disallow: /checkout
Disallow: /cart
Disallow: /auth/
Disallow: /api/
Disallow: /debug/
Disallow: /voucher/
Disallow: /gift/
Disallow: /reset-password
Disallow: /forgot-password

Host: https://kenyonexpress.co.il
Sitemap: https://kenyonexpress.co.il/sitemap.xml
```
