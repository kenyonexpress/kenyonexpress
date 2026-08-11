# ארכיטקטורה: מדיה ואחסון R2

אחסון תמונות מוצר, קטגוריה ו-hero ב-Cloudflare R2 (S3-compatible), הגשה דרך CDN, מטא-דאטה ב-`media_assets`, ונתיב ייבוא מ-WP.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: No Escrow (לא רלוונטי ישירות; תמונות לא משפיעות על ledger).

מסמכים קשורים:

```
docs/ARCHITECTURE-IMAGE-PIPELINE.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-MARKETING.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| R2-1 | אחסון אובייקטים: **Cloudflare R2** (S3-compatible). אין בינארי ב-git. |
| R2-2 | כתיבה רק דרך **presigned URL** מהשרת (service role / staff). קריאה ציבורית דרך CDN או bucket public read. |
| R2-3 | מטא-דאטה ב-`public.media_assets` (מיגרציה `049_media_assets.sql`): `url`, `alt_he`, `width`, `height`, `renditions`, `blur_data_url`. |
| R2-4 | `alt_he` בעברית חובה לפני publish של מוצר עם תמונה משמעותית. |
| R2-5 | MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/avif`. מקסימום 8 MB להעלאה (ספק/אדמין). |
| R2-6 | וריאנטים: thumb / card / pdp / og; WebP ברירת מחדל; AVIF אופציונלי. |
| R2-7 | `next/image` + loader מותאם; `width`/`height` חובה ל-CLS; `priority` רק ל-LCP (hero / PDP ראשית). |
| R2-8 | מחיקת orphan: job מושהה אחרי unpublish מוצר; לא מוחקים אובייקטים שמקושרים ליותר ממוצר אחד בלי audit. |
| R2-9 | ייבוא WP: העתקת uploads ל-R2 + שורת `media_assets`; מיפוי URL ישן → חדש ב-`wp_import.media`. |
| R2-10 | פידים שיווקיים (Google/Meta): `image_link` = URL ציבורי R2/CDN בלבד; לא signed URL עם TTL קצר. |

### 1.1 צינור העלאה

```text
Admin/Supplier בוחר קובץ
  → אימות שרת (MIME, גודל, מימדים)
  → insert media_assets (pending) + object key
  → presigned PUT ל-R2
  → client מעלה
  → HEAD/complete → job וריאנטים (resize/transcode)
  → renditions ב-JSONB → מוצר published
  → invalidate cache tags (revalidatePath / tag)
```

### 1.2 מפתח אובייקט (יעד)

```text
products/{product_id}/{uuid}/original.{ext}
products/{product_id}/{uuid}/w400.webp
products/{product_id}/{uuid}/w800.webp
products/{product_id}/{uuid}/w1600.webp
products/{product_id}/{uuid}/og.jpg
hero/{slide_id}/{uuid}/w1600.webp
categories/{category_id}/{uuid}/w800.webp
```

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Supabase Storage בלבד (בלי R2) | עלות egress ו-CDN פחות גמישים; R2 + Cloudflare CDN מותאמים לתמונות קטלוג בקנה מידה. |
| תמונות ב-git / `public/` | נפח repo, אין CDN, אין וריאנטים; אסור לפי IMG1/R2-1. |
| Vercel Blob כ-primary | vendor lock-in; R2 S3-compatible + מחיר egress אפסי מול Cloudflare. |
| העלאה ישירה אנונימית ל-bucket | סיכון spam/abuse; חובה presigned + RLS/staff role. |
| שמירת original בלבד בלי וריאנטים | CLS ו-bandwidth גבוהים; LCP נכשל ב-CWV. |
| alt אופציונלי / באנגלית | נגישות IL + SEO; `alt_he` NOT NULL ב-DB. |

---

## 3. סכמת DB

**DDL קיים:** `supabase/migrations/049_media_assets.sql`

| טבלה | עמודות | הערה |
|---|---|---|
| `media_assets` | `id`, `url` UNIQUE, `alt_he` NOT NULL, `blur_data_url`, `width`, `height`, `renditions` jsonb, `provider`, `bucket`, `base_path`, `created_by`, timestamps | מקור מטא-דאטה |

`renditions` (דוגמה):

```json
{"webp":[{"w":1600,"url":"..."}],"avif":[{"w":1600,"url":"..."}]}
```

RLS: SELECT ציבורי; INSERT/UPDATE ל-`content_uploader` או admin; DELETE admin בלבד.

טבלאות קשורות (ללא DDL חדש במסמך זה):

| טבלה | קשר |
|---|---|
| `products` | `image_url` / join ל-`media_assets.url` |
| `product_images` | sort_order + URL |
| `hero_slides` | `image_url` |
| `categories` | תמונת קטגוריה |
| `wp_import.media` | מיפוי URL ישן → R2 |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | העלאה נכשלה באמצע PUT | שורת pending לא מסומנת ready; retry presigned; orphan cleanup אחרי TTL |
| E2 | MIME spoof (extension ≠ content) | דחייה בשרת לפני presigned; לא נותנים URL |
| E3 | מוצר unpublished עם תמונות | job מושהה (7 יום) לפני מחיקת orphan; audit log |
| E4 | אותו `url` בשני מוצרים (טעות duplicate) | UNIQUE על `url` חוסם; admin merge ידני |
| E5 | CDN cache stale אחרי החלפת תמונה | key חדש (uuid) או purge tag; לא overwrite in-place בלי version |
| E6 | ייבוא WP: קובץ חסר ב-backup | placeholder + רשימת gaps; לא 404 ב-production listing |
| E7 | R2 down / 503 על GET | fallback blur + alt; retry; לא לשבור PDP שלם |
| E8 | signed PUT פג תוקף | client מבקש presigned חדש; לא expose service key |
| E9 | תמונה > 8 MB | 413 עם הודעה בעברית; לא truncate |
| E10 | feed Merchant: image 404 | סינון מוצר מפיד עד תיקון; alert שבועי |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | bucket name production vs staging | env `R2_BUCKET`; לא hardcode | 2026-08-12 |
| O2 | AVIF encode בכל וריאנט או רק PDP | WebP חובה; AVIF P1 אחרי מדידת CPU | 2026-08-12 |
| O3 | lifecycle rule R2 (מחיקה אוטומטית orphan) | job אפליקטיבי קודם; R2 lifecycle P2 | 2026-08-12 |
| O4 | video/GIF ב-hero | מחוץ ל-scope; JPEG/WebP/AVIF בלבד | 2026-08-12 |

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Media/R2 binding (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
