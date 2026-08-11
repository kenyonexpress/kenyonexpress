# ארכיטקטורה: צינור תמונות

העלאה ל-R2, וריאנטי resize, WebP/AVIF, `next/image` loader, מגבלות ספק, ו-`alt` בעברית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. צינור מדיה לא נוגע ב-settlement.

מסמכים קשורים:

```
docs/ARCHITECTURE-MEDIA-R2.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ACCESSIBILITY-IL.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| IMG1 | אחסון אובייקטים: **Cloudflare R2** (S3-compatible). לא git. |
| IMG2 | העלאה רק דרך **presigned URL** מהשרת; אין כתיבה אנונימית ל-bucket. |
| IMG3 | תצוגה באתר דרך `next/image` + loader מותאם ל-R2/CDN. |
| IMG4 | וריאנטים: thumb / card / pdp / og; WebP ברירת מחדל; AVIF כשזמין. |
| IMG5 | `alt_he` בעברית חובה לתמונות מוצר משמעותיות. |
| IMG6 | מגבלות גודל/מימדים לספק; סריקת MIME. |
| IMG7 | original נשמר ב-R2 לארכיון; listing לא מגיש original. |
| IMG8 | `priority` רק על LCP (hero / תמונת PDP ראשית). |

### Upload flow

```text
Supplier/Admin selects file
  → server validates (type, size, dimensions)
  → insert media_assets row (pending) + object key
  → presigned PUT to R2
  → client uploads
  → server confirms HEAD/complete
  → enqueue variant job (resize/transcode)
  → mark ready; attach to product
```

מפתח אובייקט:

```text
products/{product_id}/{uuid}/original.{ext}
products/{product_id}/{uuid}/w400.webp
products/{product_id}/{uuid}/w800.webp
products/{product_id}/{uuid}/w1600.webp
products/{product_id}/{uuid}/og.jpg
```

### וריאנטים

| Variant | רוחב (px) | שימוש |
|---|---|---|
| `w200` / thumb | 200 | admin lists |
| `w400` | 400 | כרטיסי מובייל |
| `w800` | 800 | כרטיסי דסקטופ / gallery |
| `w1600` | 1600 | PDP zoom / retina |
| `og` | 1200×630 crop | Open Graph |

### מגבלות ספק

| מגבלה | ערך |
|---|---|
| גודל קובץ | ≤ 8 MB |
| סוגים | jpeg, png, webp |
| מימד מינימלי | ≥ 800px בצלע הקצרה |
| מימד מקסימלי | ≤ 6000px |
| כמות למוצר | עד 8 |
| קצב העלאה | rate limit per supplier |

### alt בעברית

| מקרה | `alt_he` |
|---|---|
| תמונה ראשית PDP | שם המוצר (+ וריאנט) |
| גלריה נוספת | תיאור קצר או `""` אם דקורטיבית |
| כרטיס קטלוג | שם המוצר |
| לוגו ספק | `לוגו {שם הספק}` |
| אייקון UI | `""` + טקסט ליד הכפתור |

fallback: `products.name_he`. אסור: `alt="image"` / אנגלית כברירת מחדל.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| תמונות ב-git | IMG1: R2/CDN. |
| העלאה ישירה ל-bucket | IMG2: presigned בלבד. |
| `<img>` גolmi ב-listing | IMG3/7: CLS + bandwidth. |
| original בכרטיס | IMG7: וריאנטים בלבד. |
| alt באנגלית | IMG5: עברית + נגישות IL. |
| eager על כל הגלריה | IMG8: LCP בלבד priority. |
| Make/Zapier ל-transcode | worker שרתי בלבד. |

---

## סכמת DB

```text
media_assets (
  id uuid PK,
  url text NOT NULL UNIQUE,
  alt_he text NOT NULL,
  blur_data_url text,
  width int,
  height int,
  renditions jsonb NOT NULL DEFAULT '{}',
  provider text NOT NULL DEFAULT 'supabase',
  bucket text,
  base_path text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
```

| renditions | דוגמה |
|---|---|
| `webp` | `[{"w":800,"url":"..."}]` |
| `avif` | `[{"w":800,"url":"..."}]` |

join ל-storefront לפי URL. RLS: קריאה ציבורית; כתיבה staff/admin.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | קובץ > 8 MB | דחייה + הודעה בעברית |
| CE2 | MIME לא תואם magic bytes | דחייה |
| CE3 | variant job נכשל | retry + DLQ; original זמני |
| CE4 | presigned פג תוקף | URL חדש; לא שורה כפולה |
| CE5 | מחיקת מוצר | GC יתומים ב-job; לא מיידי |
| CE6 | alt_he ריק | דחייה; fallback name_he ב-UI בלבד |
| CE7 | upload כפול (idempotency) | dedup לפי base_path |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | AVIF encode cost | phase 2 אם מקובל |
| O2 | R2 provider field migration | 049 → R2 |
| O3 | supplier self-upload UI | SUPPLIER-PORTAL |
| O4 | AI alt suggestion | לא P0; counsel |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים), עברית |
