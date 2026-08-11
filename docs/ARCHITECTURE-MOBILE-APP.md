# ארכיטקטורה: אפליקציית מובייל (Expo)

Expo React Native על **אותו שכבת API** כמו ה-web: RTL מלא, Push, וארנק קופונים עם הצגת QR אופליין.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-APP-STORE-LAUNCH.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/CHECKOUT-OPTIMIZATION.md
docs/ARCHITECTURE-INTEGRATIONS.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/CONTRADICTIONS.md
```

עקרון: **Web = SEO + רכישה ראשונית.** האפ = שימור, Push, ארנק קופונים, סריקת ספק. אין DB שני, אין Auth שני, אין PSP שני.

---

## 0. המלצה אחת (מחייבת)

**Expo + Expo Router + EAS**, צורכת את אותם Route Handlers / DTOs של Next+Supabase (שכבת API משותפת), בלי service role באפ.

PWA = גשר עד החנויות. Flutter נדחה.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| M1 | Client: Expo + TypeScript + Expo Router. |
| M2 | Backend: אותו Supabase + אותם `/api/**` / server actions כמו web. |
| M3 | כסף ו-redeem רק דרך API מאומת. אין service role באפ. |
| M4 | תשלום: Cardcom ב-**WebView** (Low Profile); לא IAP לקופונים/פיזי. |
| M5 | קופון: **No Escrow**. |
| M6 | RTL native מהיום הראשון (`I18nManager` / expo-localization / `writingDirection`). |
| M7 | Push דרך outbox `channel=push` (`ARCHITECTURE-NOTIFICATIONS.md`). |
| M8 | כסף ב-domain: **agorot**; UI ב-₪. |
| M9 | ארנק קופונים: QR **אופליין לתצוגה**; redeem תמיד אונליין. |

---

## 2. שכבת API משותפת

```text
apps/web     → Next.js (src/)
apps/mobile  → Expo
packages/shared-types
packages/shared-money
packages/shared-validation
```

| האפ קוראת | לא מעתיקה |
|---|---|
| `GET/POST /api/...` מתועדים ב-API-CONTRACTS | נוסחאות מחיר מקומיות |
| Supabase Auth session | service role |
| DTO zod מ-shared-validation | רכיבי DOM |

עד monorepo packages: ייבוא חוזים מ-`product-money` / OpenAPI בלי שכפול לוגיקת כסף.

---

## 3. RTL

| נושא | כלל |
|---|---|
| כיוון | `I18nManager.forceRTL(true)` בעברית; בדיקת reload ב-iOS/Android |
| טקסט | עברית בכל מסכי כסף/קופון |
| LTR בתוך RTL | קודים, מחירים, URLs ב-`direction: 'ltr'` ממוקד |
| אייקונים | mirroring לחיצים (חץ חזרה) |
| תאריכים | Asia/Jerusalem |

---

## 4. Push

| פריט | ערך |
|---|---|
| תשתית | Expo Notifications → APNs / FCM |
| טבלה | `push_tokens (user_id, platform, token, updated_at)` |
| שליחה | Worker/outbox `channel=push` |
| לקוח | issued, redeemed, expiry_48h, cashback |
| ספק | `supplier_sale` |
| Deep link | `kenyonexpress://coupons/{voucher_id}` |

Transactional ללא opt-in שיווקי. נטישה רק עם opt-in.

---

## 5. ארנק קופונים (אופליין לתצוגה)

```text
Sync כשיש רשת:
  GET /api/account/vouchers (או מקביל)
  → AsyncStorage / SQLite מוצפן מקומית
  → רשימה + payload QR חתום + expires_at

בלי רשת:
  → מציגים קופונים שמורים + QR (בהירות מסך)
  → אין redeem מקומי
  → באנר: "מימוש דורש חיבור אצל העסק"

עם רשת אצל ספק:
  → סריקה → POST redeem (כמו web)
```

| כלל | פירוט |
|---|---|
| אבטחה | אחסון מקומי מוצפן; מחיקה ב-logout; אין service secrets |
| תוקף | הסתרה/סימון expired לפי שעון מכשיר + סנכרון |
| מתנה | רק לפי GIFT-COUPONS כשמופעל |
| ספק | מצלמה אונליין בלבד; בלי "מימוש אופליין" |

---

## 6. Checkout (WebView)

```text
עגלה באפ → API יוצר LP URL
  → WebView Cardcom
  → return URL → האפ סוגרת WebView
  → שרת GetLpResult + finalize
  → רענון הזמנות/קופונים מה-API
```

מקור אמת = שרת. `CHECKOUT_ENABLED` נאכף באפ כמו ב-web.

---

## 7. סריקת ספק

כמו web redeem: HMAC מוכיח הנפקה; הרשאה מ-membership; rate limit; הודעות עברית ל-already_redeemed / wrong_supplier / expired.

---

## 8. סדר מסירה

```text
M0 PWA
M1 Expo customer: catalog + auth + ארנק QR (offline display) + RTL
M2 Checkout WebView + push registration
M3 Supplier scan
M4 Store soft (TestFlight / internal)
M5+ Verticals (INTEGRATIONS)
```

---

## 9. Acceptance

- [ ] אין service role באפ  
- [ ] אותם מחירי API כמו web (agorot)  
- [ ] RTL בכל מסכי כסף  
- [ ] QR קופון זמין בלי רשת; redeem לא  
- [ ] Push issued/expiry עם deep link  
- [ ] Cardcom רק ב-WebView; finalize בשרת  
- [ ] אין נוסח Escrow  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Expo RN, QR, push, No Escrow |
| 2026-08-10 | shared packages, deep links, supplier QR |
| 2026-08-11 | WebView checkout + push סביב תשלום |
| 2026-08-11 | API layer reuse, RTL, coupon wallet offline display |
