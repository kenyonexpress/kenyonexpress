# ארכיטקטורה: PWA

Progressive Web App: manifest, Service Worker (Serwist), offline, A2HS, Web Push עתידי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. כסף ו-redeem רק בשרת; offline = תצוגה מייעצת.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PERFORMANCE.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| PW1 | חנות לקוח: PWA = **גשר** עד Expo בחנויות. |
| PW2 | סורק ספק: **נשאר PWA** (מצלמה + תור offline). |
| PW3 | Admin: לא PWA; אין SW על `/admin/**`. |
| PW4 | Serwist (`@serwist/next`); `next-pwa` נדחה. |
| PW5 | TWA / Capacitor נדחים; חנויות = RN+Expo. |
| PW6 | אין cache ל-HTML מותאם אישית של מסלולי כסף. |
| PW7 | Web Push first-party; OneSignal לא ב-Next storefront. |
| PW8 | `theme_color` / `background_color` = `#fed700`. |

NetworkOnly:

```text
/cart, /checkout/**, /account/**, /redeem/**, /admin/**, /supplier/**, /api/**
```

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| `next-pwa` | Serwist PW4; תחזוקה Next 15. |
| CacheFirst על `/checkout` | מחיר/סטטוס שולם ישן; PW6. |
| OneSignal ב-storefront | PW7; בעלות SW. |
| PWA admin | PW3; סיכון cache רגיש. |
| offline redeem ללקוח | כסף online בלבד. |
| TWA לחנות Play | Expo RN עדיפות. |

---

## 3. סכמת DB

**אין DDL חדש.** Push עתידי:

| טבלה (יעד) | שימוש |
|---|---|
| `push_subscriptions` | web + expo endpoints |
| `consent_events` | opt-in push |

אייקונים (קבצים):

```
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-maskable-512.png
public/icons/apple-touch-icon.png
```

---

## 4. Serwist ו-offline

| נתיב | אסטרטגיה |
|---|---|
| כסף / API / admin | NetworkOnly |
| ניווט ציבורי | NetworkFirst (3ש timeout) |
| `/_next/static/` | CacheFirst |
| תמונות | CacheFirst (max 200, 30 יום) |
| fallback navigate | `/offline` |

| פיצ'ר offline | התנהגות |
|---|---|
| קופון cached | תצוגה; באנר "עודכן לפני…" |
| QR | cache מקומי; redeem online |
| ספק scan | תור intents; OK שרת לפני "מומש" |
| checkout | NetworkOnly; אין shell שולם ישן |

---

## 5. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | offline ב-checkout | אין תשלום; הודעה |
| E2 | stale coupon cache | timestamp + refresh online |
| E3 | supplier queue offline 48h+ | TTL drop; re-scan |
| E4 | SW על admin by mistake | PW3 block register |
| E5 | logout | wipe QR cache |
| E6 | A2HS dismiss | 14 יום cooldown |
| E7 | iOS no push v1 | גיליון A2HS manual |
| E8 | CDN image 404 cached | TTL + network fallback |

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | PWA-2 wallet IndexedDB cache | 2026-08-12 |
| O2 | Web Push PWA-3 | 2026-08-12 |
| O3 | supplier manifest נפרד deploy | 2026-08-12 |

---

## 7. Acceptance

- [ ] manifest RTL + `#fed700` + אייקונים  
- [ ] `/checkout` offline לא מציג shell שולם  
- [ ] admin בלי SW  
- [ ] כסף/redeem לא offline  
- [ ] No Escrow בנוסח  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | Serwist, manifest, offline |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
