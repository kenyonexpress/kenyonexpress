# ARCHITECTURE: Image Pipeline

צינור תמונות מוצר: העלאה ל-R2, וריאנטי resize, WebP/AVIF, הגדרת `next/image` loader, מגבלות העלאה לספק, מדיניות `alt` בעברית.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-MEDIA-R2.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ACCESSIBILITY-IL.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| IMG1 | אחסון אובייקטים: **Cloudflare R2** (S3-compatible). לא git. |
| IMG2 | העלאה רק דרך **presigned URL** מהשרת; אין כתיבה אנונימית ל-bucket. |
| IMG3 | תצוגה באתר דרך `next/image` + loader מותאם ל-R2/CDN. |
| IMG4 | וריאנטים: לפחות thumb / card / pdp / og; פורמטים WebP (ו-AVIF כשזמין). |
| IMG5 | `alt` בעברית חובה לתמונות מוצר משמעותיות. |
| IMG6 | מגבלות גודל/מימדים לספקי העלאה; סריקת סוג MIME. |

---

## 1. Upload to R2

```text
Supplier/Admin selects file
  → server validates (type, size, dimensions)
  → insert media row (pending) + object key
  → presigned PUT to R2
  → client uploads
  → server confirms HEAD/complete
  → enqueue variant job (resize/transcode)
  → mark ready; attach to product
```

מפתח אובייקט (יעד):

```text
products/{product_id}/{uuid}/original.{ext}
products/{product_id}/{uuid}/w400.webp
products/{product_id}/{uuid}/w800.webp
products/{product_id}/{uuid}/w1600.webp
products/{product_id}/{uuid}/og.jpg
```

אין סודות ב-URL ציבורי מעבר למה שנדרש לקריאה; bucket ציבורי לקריאה או CDN באמצע.

---

## 2. Resize variants

| Variant | רוחב יעד (px) | שימוש |
|---|---|---|
| `w200` / thumb | 200 | admin lists |
| `w400` | 400 | כרטיסי מובייל |
| `w800` | 800 | כרטיסי דסקטופ / gallery |
| `w1600` | 1600 | PDP zoom / retina |
| `og` | 1200×630 crop | Open Graph |

כללים:

- שמירת יחס גובה-רוחב (חוץ מ-OG)
- לא להעלות ללקוח את ה-original ב-listing
- Job כשל → retry + DLQ מדיה; המוצר יכול להישאר עם original זמני

---

## 3. WebP / AVIF

| פורמט | מדיניות |
|---|---|
| WebP | ברירת מחדל לוריאנטים |
| AVIF | אופציונלי אם העלות/זמן encode מקובלים; fallback WebP/JPEG |
| JPEG/PNG original | נשמר ב-R2 לארכיון / re-process |

`next/image` מנהל `Accept` / סינטזת srcset כשה-loader תומך.

---

## 4. `next/image` loader config

יעד:

```text
images: {
  loader: 'custom' | remotePatterns for R2 public host,
  formats: ['image/avif', 'image/webp'],
  deviceSizes / imageSizes מותאמים לכרטיסים
}
```

| כלל | פירוט |
|---|---|
| `priority` | רק LCP (hero / תמונת PDP ראשית) |
| מימדים | width/height או fill+sizes חובה (CLS) |
| `sizes` | לדוגמה כרטיס `(max-width:768px) 50vw, 25vw` |
| דומיינים | allowlist ל-R2/CDN בלבד |

אסור: תמונות 4000px בכרטיס מובייל; eager על כל הגלריה.

---

## 5. Supplier upload limits

| מגבלה | ערך יעד התחלתי |
|---|---|
| גודל קובץ | ≤ 8 MB |
| סוגים | `image/jpeg`, `image/png`, `image/webp` |
| מימד מינימלי | ≥ 800px בצלע הקצרה ל-PDP |
| מימד מקסימלי | ≤ 6000px (דחייה או resize שרת) |
| כמות לתמונות למוצר | למשל עד 8 |
| קצב העלאה | rate limit per supplier |

דחייה עם הודעה בעברית: "הקובץ גדול מדי / סוג לא נתמך".

---

## 6. Alt-text policy (Hebrew)

| מקרה | `alt` |
|---|---|
| תמונה ראשית ב-PDP | שם המוצר בעברית (+ וריאנט אם רלוונטי) |
| גלריה נוספת | תיאור קצר בעברית או `alt=""` אם זהה דקורטיבית לראשית |
| כרטיס קטלוג | שם המוצר |
| לוגו ספק | `לוגו {שם הספק}` |
| אייקון UI | `alt=""` + טקסט ליד הכפתור |

אסור: `alt="image"` / `alt="photo"` / אנגלית כברירת מחדל.  
SEO: alt תואם מוצר; לא דחיסת מילות מפתח.

שדה אופציונלי `alt_he` בטבלת מדיה; fallback ל-`products.name_he`.

---

## 7. Backup / delete

- Versioning ב-R2 (BACKUP-DR)
- מחיקת מוצר: GC יתומים ב-job יבש, לא מיידי בלי אישור
- לא למחוק original לפני שיש וריאנטים ready (או מדיניות reverse)

---

## 8. Acceptance

- [ ] Presigned upload בלבד
- [ ] וריאנטי WebP לכרטיס/PDP
- [ ] `next/image` עם sizes + priority נכון
- [ ] מגבלות ספק נאכפות
- [ ] alt עברית על תמונות מוצר P0

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
