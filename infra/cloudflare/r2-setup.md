# Cloudflare R2: הקמת אחסון אובייקטים

מדריך הקמה חד פעמי. הקוד כבר מוכן ועובד גם בלי R2 (יש fallback ל-Supabase
Storage בנתיב ההעלאות של האדמין), כך שאפשר לבצע את ההקמה בכל שלב.

## שלושת ה-buckets

השמות קבועים בקוד, בקובץ:

```
src/lib/storage/r2-buckets.ts
```

| ייעוד | שם bucket | גישה | תוכן |
|---|---|---|---|
| product-images | `kenyonexpress-product-images` | ציבורי (CDN) | תמונות מוצרים, עד 5MB, תמונות בלבד |
| coupon-qrcodes | `kenyonexpress-coupon-qrcodes` | פרטי | קודי QR של שוברים, עד 1MB, PNG/SVG |
| user-uploads | `kenyonexpress-user-uploads` | פרטי | קבצי משתמשים, עד 10MB, תמונות ו-PDF |

buckets פרטיים נקראים רק דרך URL חתום (ברירת מחדל: שעה). ה-bucket הציבורי
מוגש דרך דומיין CDN, לא דרך endpoint האחסון.

## שלב 1: יצירת ה-buckets

Chrome > Cloudflare Dashboard > R2 > Create bucket, שלוש פעמים, עם השמות
מהטבלה למעלה. Location: Automatic. Storage class: Standard.

## שלב 2: API token

Chrome > R2 > Manage R2 API Tokens > Create API Token:

- Permissions: Object Read & Write
- Specify bucket(s): שלושת ה-buckets בלבד, לא All buckets
- TTL: Forever

התוצאה היא שלושה ערכים: Access Key ID, Secret Access Key, ו-Account ID
(מופיע ב-URL של ה-endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

## שלב 3: דומיין ציבורי לתמונות מוצרים

Chrome > R2 > `kenyonexpress-product-images` > Settings > Public access >
Custom Domains > Connect Domain:

```
cdn.kenyonexpress.co.il
```

רק ל-bucket הזה. שני האחרים נשארים בלי גישה ציבורית.

## שלב 4: CORS להעלאות ישירות מהדפדפן

הדפדפן מעלה ישירות ל-R2 עם presigned PUT, לכן כל bucket שמקבל העלאות
מהדפדפן צריך כלל CORS. Chrome > bucket > Settings > CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://kenyonexpress.co.il", "https://www.kenyonexpress.co.il"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## שלב 5: משתני סביבה

Vercel > Project > Settings > Environment Variables (וגם ב-`.env.local`
מקומי). ארבעת המשתנים כבר מתועדים ב-`.env.example`:

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE_URL=https://cdn.kenyonexpress.co.il
```

קיים גם `R2_BUCKET` (יחיד) שמשמש את נתיב ההעלאות הישן של האדמין דרך
`src/lib/storage/r2.ts`. אם מגדירים אותו, לכוון אותו ל-
`kenyonexpress-product-images`.

## מה יש בקוד

| קובץ | תפקיד |
|---|---|
| `src/lib/storage/r2-buckets.ts` | שמות ה-buckets, מגבלות גודל וסוגי תוכן, ולידציית מפתחות |
| `src/lib/storage/r2-service.ts` | שירות שרת מעל `@aws-sdk/client-s3`: העלאה, מחיקה, presigned PUT/GET |
| `src/lib/storage/r2.ts` | חותם SigV4 ידני ישן, נתיב bucket יחיד של האדמין (נשאר לתאימות) |
| `src/lib/storage/upload.ts` | fallback ל-Supabase Storage כשאין R2 |

שימוש בקוד שרת:

```ts
import { createR2SignedUploadUrl, createR2SignedDownloadUrl, uploadToR2 } from '@/lib/storage/r2-service'

// URL חתום להעלאה ישירה מהדפדפן (10 דקות)
const { uploadUrl, publicUrl } = await createR2SignedUploadUrl(
  'product-images',
  `products/${crypto.randomUUID()}.webp`,
  'image/webp',
)

// URL חתום לקריאה מ-bucket פרטי (שעה)
const qrUrl = await createR2SignedDownloadUrl('coupon-qrcodes', 'qr/order-123.png')

// העלאה מצד השרת (למשל QR שנוצר בשרת)
await uploadToR2('coupon-qrcodes', 'qr/order-123.png', pngBytes, 'image/png')
```

## אימות אחרי ההקמה

Terminal, מתוך שורש הפרויקט, עם `.env.local` מלא:

```bash
pnpm vitest run src/lib/storage
```

הטסטים חותמים URLs עם קרדנצ'לים מזויפים ולא יוצרים תעבורה לענן, כך שהם
ירוקים גם לפני ההקמה. בדיקת קצה אמיתית: להעלות תמונה מהאדמין ולוודא
שה-URL שנשמר מצביע על `cdn.kenyonexpress.co.il`.
