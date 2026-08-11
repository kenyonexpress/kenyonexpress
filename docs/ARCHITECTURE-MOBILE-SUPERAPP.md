# ארכיטקטורת Mobile Super-App: React Native + Expo

מסמך מחייב לפלטפורמת super-app: React Native + Expo, monorepo, מיני-אפים, ורטיקלים עתידיים. מחליף את D1/D2 של PWA; חוזים C1-C4 ו-D3-D10 בתוקף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר; ארנק דרך `fn_wallet_transfer` בלבד.

מסמכים קשורים:

```
docs/MASTER-ARCHITECTURE.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-MOBILE-APP-V2.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-PWA.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| M1 | פלטפורמה: **React Native + Expo** (managed + dev client, Expo Router, NativeWind, TanStack Query, use-intl). מחליף D1/D2/R27. Web קנוני ל-SEO ורכישה בדסקטופ. |
| M2 | Monorepo: Turborepo + pnpm; `apps/web`, `apps/mobile`, `packages/*`, `verticals/*`; מעבר M0-M3 אטומי. |
| M3 | יעד שיתוף: 80%+ קוד לא-UI ב-packages; CI cloc ≥75% אזהרה, <70% fail. |
| M4 | שרת: צינור A = supabase-js + RLS; צינור B = `/api/mobile/v1/*` דק (checkout, push register, app-config). אין BFF נפרד, אין מסלול כסף חדש. |
| M5 | מיני-אפים: ורטיקלים כחבילות פנימיות, manifest zod, SDK מוזרק, kill switch ב-`verticals.status`. |
| M6 | ארנק ורטיקלים: רק דרך `payments.checkout()` של הליבה על `orders.vertical` (D3/D4). |
| M7 | Push: Expo Push Service; `push_subscriptions(platform 'web'/'expo')`; outbox 029/031; opt-in שיווקי 30א (D8). |
| M8 | Deep links: https Universal/App Links; scheme פנימי ל-OAuth בלבד (D9). |
| M9 | Cardcom: WebView נעול-דומיין; אישור מ-webhook + polling; SAQ-A; אין SDK נייטיב. |
| M10 | ארנק קופונים offline: MMKV + QR מ-`qr_token`; delta sync; ביומטריה ברירת מחדל; שרת = אמת (D6/D7). |
| M11 | זהות: OAuth נייטיב (Google + Apple); SecureStore; re-auth 15 דק' לפעולות רגישות. |
| M12 | RTL: forceRTL ב-build; סטיילינג לוגי; Heebo; עברית-first. |
| M13 | הפצה: EAS Build/Submit/Update; runtimeVersion=appVersion; OTA ל-JS בלבד. |
| M14 | חנויות: סליקה חיצונית לקופונים/פיזי; Sign in with Apple; מחיקת חשבון; review account ידני; `location:background` רק עם ורטיקל שדורש. |

### 1.1 Supersession PWA (D1/D2)

| הכרעה ישנה | סטטוס |
|---|---|
| D1 PWA + TWA/Capacitor | **מוחלף** ב-M1; PWA = גשר עד RN |
| D2 לקוח = web בלבד | **מוחלף** ב-M4 (שני צינורות) |
| D3 `orders.vertical` | בתוקף |
| D4 `fn_wallet_transfer` + namespace | בתוקף |
| D5 `supplier_members` pattern | בתוקף |
| D6/D7 offline cache, שרת אמת | בתוקף; MMKV במקום IndexedDB |
| D8 push שיווקי 30א | בתוקף |
| D9 https deep links | בתוקף |
| D10 לא לבנות קומרס מחדש | בתוקף |

### 1.2 מחסנית (עוגן)

```
expo, expo-router, react-native, nativewind, @tanstack/react-query
@supabase/supabase-js, react-native-mmkv, expo-secure-store
expo-local-authentication, expo-notifications, expo-camera
react-native-qrcode-svg, expo-web-browser, react-native-webview, use-intl
```

### 1.3 Monorepo (יעד)

```
apps/web/     Next 16 (מועבר מ-root)
apps/mobile/  Expo Router
packages/     contracts, db, core, api-client, i18n, tokens, config
verticals/    food/, rides/ (עתידי)
supabase/     migrations בשורש
```

סדר: M0 turbo → M1 git mv web → M2 חילוץ packages → M3 mobile scaffold.

### 1.4 צינורות שרת

**צינור A (ברירת מחדל):** catalog RPC, RLS reads (orders, vouchers, wallet), RPCs מותרים (`fn_merge_guest_cart`, consent, rate limit), inapp notifications.

**צינור B (`/api/mobile/v1`):**

| endpoint | תפקיד |
|---|---|
| `POST .../checkout` | beginCheckout = server action |
| `GET .../orders/:id/status` | polling post-Cardcom |
| `POST .../push/register` | push_subscriptions |
| `POST .../agents/:key/chat` | SSE agents |
| `GET .../app-config` | flags, verticals, force update |

כלל: Bearer JWT + `getUser()`; לוגיקה ב-`packages/`; `/v1` frozen.

### 1.5 חוזים C1-C4 (מ-PWA שנבלע)

- **C1 זהות:** `profiles` + membership tables per vertical (כמו `supplier_members`).
- **C2 כסף:** `orders` מעטפת; detail tables per vertical; אין FK בין ורטיקלים.
- **C3 התראות:** `notify(user_id, topic, payload)`; topics `<vertical>.<entity>.<event>`.
- **C4 גבולות:** route group + lint; payments/ = ליבה בלבד.

### 1.6 שלבי בנייה

| שלב | תוכן | שער |
|---|---|---|
| P0 | M0-M2 monorepo | web prod מ-`apps/web`, אפס רגרסיה |
| P1 | M3 + auth + catalog + RTL | login + קטלוג על מכשיר |
| P2 | ארנק offline + push | QR במצב טיסה; expiry push |
| P3 | Cardcom WebView + deep links | עסקה E2E |
| P4 | חנויות TestFlight → production | staged rollout |
| P5 | KenyonKit + verticals registry | demo vertical toggle |

**תלות:** אין אפליקציה לפני checkout web חי (שלב 0 מסמך האב).

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| PWA + Capacitor כ-primary (D1 ישן) | iOS: push/chcamera/background/geo חלשים; super-app דורש native. |
| Flutter | אפס שיתוף TypeScript/zod/drizzle/money module. |
| Native כפול Swift+Kotlin | לא ריאלי לצוות יחיד; כפילות חוזים. |
| BFF נפרד למובייל | D10: route handlers על apps/web מספיקים; אין מסלול כסף חדש. |
| FCM/APNs ישיר מהאפ | bypass worker, consent, dedupe; Expo Push + outbox. |
| IAP לקופונים | 30% + מדיניות; Cardcom WebView + SAQ-A (M9). |
| WebView ל-QR wallet | MOBILE-APP-V2; native QR + brightness. |
| `location:background` מראש | ביקורת Apple; רק עם ורטיקל rides/food (M14). |
| copy במקום git mv בחילוץ packages | הפרת חוק anti-duplicate; היסטוריה אבודה. |

---

## 3. סכמת DB

**DDL עתידי/מתוכנן** (expand-only; לא `db push`):

| אובייקט | תוכן |
|---|---|
| `push_subscriptions` | `user_id`, `token`, `platform` enum `'web'|'expo'`, `enabled`, timestamps |
| `verticals` | `key`, `title_he`, `icon`, `status` (hidden/beta/active/paused), `sort_order` |
| `orders.vertical` | עמודה על `orders`; default `'shop'` |
| `food.delivery_jobs`, `rides.ride_details` | detail tables עתידיות (FK ל-orders בלבד) |

**קיים (ללא שינוי במסמך):**

| טבלה | שימוש mobile |
|---|---|
| `profiles`, `supplier_members` | C1, scan mode |
| `orders`, `payments`, `order_items` | checkout; `platform_percent` snapshot |
| `vouchers`, `coupon_codes` | wallet offline |
| `wallet_*` | `fn_wallet_transfer` בלבד |
| `notifications_outbox` | inapp + push fanout |

מיגרציות مرجع: 026 commerce, 027 redemption, 029/031 notifications, push future 1.26.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | PR נוגע `packages/core` | turbo בונה web + mobile; שבירה = block merge |
| E2 | `/v1` breaking change | רק `app-config` force update; לא שבירת clients ישנים |
| E3 | OTA מנסה native module חדש | אסור; OTA = JS bundle בלבד (M13) |
| E4 | ורטיקל `paused` mid-session | UI מסיר tab; in-flight order ממשיך דרך ליבה |
| E5 | Cardcom WebView redirect חסום | deep link + order status polling |
| E6 | MMKV corrupt | wipe cache; re-sync vouchers; לא redeem offline |
| E7 | Push token platform mismatch | `platform='expo'`; web tokens נפרדים |
| E8 | OAuth scheme vs https share | https לשיתוף; scheme ל-callback בלבד (M8) |
| E9 | Supplier scanner PWA + RN app | PWA scanner נשאר (027); RN = customer + optional scan |
| E10 | Monorepo M1 Vercel misconfig | rollback Instant; Root Directory = `apps/web` |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | Apple Developer / Play Console owner | חשבון על שם בעלים; לא seed | 2026-08-12 |
| O2 | מיגרציית `push_subscriptions` vs `push_tokens` | לאחד סכימה ב-1.26 | 2026-08-12 |
| O3 | WhatsApp כערוץ push | Meta Cloud API; לא push token | 2026-08-12 |
| O4 | ורטיקל ראשון (food vs rides) | אחרי P4; registry לפני feature | 2026-08-12 |
| O5 | עדכון MASTER R27 | תיעוד ב-v2 master; M1-M14 כאן | 2026-08-12 |

---

## 6. PWA כגשר (עד RN)

נשאר: manifest standalone RTL, Serwist precache, coupon wallet IndexedDB, install prompt, in-app notification center.  
מת: TWA/Capacitor store wrappers.  
סורק ספק PWA: נשאר גם אחרי RN (Ed25519 offline verify + redeem queue).

---

## 7. Acceptance

- [ ] M1-M14 מתועדים ולא סותרים D3-D10  
- [ ] אין מסלול כסף חדש מ-mobile  
- [ ] 80% share target + CI cloc  
- [ ] `/api/mobile/v1` thin wrappers על packages  
- [ ] No Escrow; wallet RPC בלבד  
- [ ] PWA supersession מסומן (D1/D2 replaced)  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | Super-app RN+Expo; supersession PWA |
| 2026-07-31 | M1-M14, monorepo, C1-C4 |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
