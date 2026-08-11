# ארכיטקטורה: PWA

Progressive Web App: manifest, Service Worker (Serwist), offline, A2HS, ו-Web Push עתידי. גשר ללקוח עד Expo; סורק ספק נשאר PWA.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #47/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/CONTRADICTIONS.md
```

Stack: Next.js App Router, **Serwist**, Web App Manifest, RTL עברית, brand `#fed700`.  
מודל כסף: **No Escrow**. כסף ו-redeem רק בשרת; offline = תצוגה מייעצת.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| PW1 | חנות לקוח: PWA = **גשר** עד אפ Expo בחנויות. |
| PW2 | סורק ספק: **נשאר PWA** לצמיתות (מצלמה + תור אופליין). |
| PW3 | Admin: לא PWA; אין רישום SW על `/admin/**`. |
| PW4 | Serwist (`@serwist/next`); `next-pwa` נדחה. |
| PW5 | TWA / Capacitor נדחים; חנויות = RN+Expo. |
| PW6 | אין cache ל-HTML מותאם אישית של מסלולי כסף. |
| PW7 | Web Push first-party; OneSignal לא נכנס ל-Next. |
| PW8 | `theme_color` / `background_color` = `#fed700`. |

מסלולים NetworkOnly (לא cache כמסמך):

```text
/cart, /checkout/**, /account/**, /redeem/**, /admin/**, /supplier/**, /api/**
```

---

## 1. Manifest

| שדה | ערך |
|---|---|
| `name` | קניון אקספרס |
| `short_name` | קניון |
| `lang` / `dir` | `he` / `rtl` |
| `theme_color` | `#fed700` |
| `background_color` | `#fed700` |
| `display` | `standalone` |
| `start_url` | `/?utm_source=pwa&utm_medium=a2hs` |
| `scope` | `/` |
| `id` | `https://kenyonexpress.co.il/` |

אייקונים חובה:

| קובץ | גודל |
|---|---|
| `public/icons/icon-192.png` | 192×192 |
| `public/icons/icon-512.png` | 512×512 |
| `public/icons/maskable-512.png` | 512×512 |
| `public/icons/apple-touch-icon.png` | 180×180 |

סורק ספק: manifest נפרד עם `start_url` תחת `/supplier/scan`, `scope=/supplier/`, שם "קניון אקספרס לעסקים".

מימוש יעד: `src/app/manifest.ts` + metadata/viewport ב-root layout.

---

## 2. Service Worker (Serwist)

| נתיב | אסטרטגיה |
|---|---|
| ניווט פרטי / כסף / API | NetworkOnly |
| ניווט ציבורי | NetworkFirst (`pages-he`, timeout 3ש, TTL 24ש) |
| `/_next/static/` | CacheFirst |
| תמונות מוצר / CDN | CacheFirst (`product-images`, max 200, 30 יום) |
| פונטים | CacheFirst |
| fallback | `/offline` ל-navigate |

מקור SW: `src/sw.ts` → `public/sw.js`. כיבוי ב-development. רישום רק ב-layout חנות (לא admin).

---

## 3. Offline

| פיצ׳ר | התנהגות |
|---|---|
| בית / קטגוריה / PDP (ביקור קודם) | cache חם או `/offline` |
| עגלה / checkout | NetworkOnly → offline; אין מחיר ישן |
| קופונים | IndexedDB אופציונלי לקריאה; באנר "עודכן לפני…" |
| QR | מטמון מקומי לתצוגה; redeem אונליין |
| סריקת ספק | תור intents; אין "מומש" לפני OK שרת |

דף `/offline`: עברית RTL, noindex, קישור לבית + נסה שוב.

---

## 4. A2HS

1. לא חוסם first paint.  
2. אחרי רגע ערך (ביקור 2 / הזמנה שולמה / פתיחת קופונים).  
3. דחייה: 14 יום (`ke_a2hs_dismissed_at`).  
4. iOS: גיליון עברית "שתף → הוסף למסך הבית".  
5. `utm_source=pwa` לניתוח (עם consent).

---

## 5. Web Push (שלב מאוחר)

| כלל | פירוט |
|---|---|
| בעלות SW | Serwist בלבד; לא OneSignal |
| טבלה | `push_subscriptions` (web + expo) או יישור ל-`push_tokens` לפי NOTIFICATIONS |
| Consent | 30א / `consent_events`; אין re-subscribe שקט מ-WP |
| שלבים | PWA-1 manifest+SW+offline+A2HS → PWA-2 wallet cache → PWA-3 push → PWA-4 retire OneSignal |

---

## 6. אבטחה

- CSP: `worker-src 'self'`, `manifest-src 'self'`  
- אחרי cutover: בלי דומייני OneSignal ב-storefront  
- Cache-Control פרטי על מסלולי כסף גובר על SW  

---

## 7. Acceptance

- [ ] manifest RTL + `#fed700` + אייקונים  
- [ ] Lighthouse installable (Chromium)  
- [ ] `/checkout` בלי רשת לא מציג shell שולם ישן  
- [ ] admin בלי רישום SW  
- [ ] אין OneSignal ב-Next storefront  
- [ ] כסף/redeem לא מאושרים offline  
- [ ] No Escrow בנוסח  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | Serwist, manifest, offline, A2HS, Web Push first-party |
| 2026-08-03 | ke-arch docs-lifecycle |
| 2026-08-12 | batch #47/50: רענון BINDING עברית ממוקד על arch/docs-batch-2 |
