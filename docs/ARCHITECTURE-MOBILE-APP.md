# ארכיטקטורה: אפליקציית מובייל (Expo)

Expo React Native כערוץ מובייל על **אותו backend** של Next.js + Supabase: Auth deep links, Push דרך `push_tokens`, סריקת ספק עם PIN, ארנק קופונים עם מטמון אופליין לתצוגה, ו-RTL עברית מהיום הראשון.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #46/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-APP-STORE-LAUNCH.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-GEO-FEATURE.md
docs/ARCHITECTURE-INTEGRATIONS.md
docs/CONTRADICTIONS.md
```

עקרון: **Web = SEO + רכישה ראשונית בדסקטופ.** האפ = שימור, Push, ארנק קופונים, סריקת ספק. אין DB שני, אין Auth שני, אין PSP שני. **No Escrow.**

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| M1 | Client: Expo + TypeScript + Expo Router + EAS. |
| M2 | Backend: אותו Supabase + אותם `/api/**` כמו web. |
| M3 | כסף ו-redeem רק דרך API מאומת. אין service role באפ. |
| M4 | תשלום: Cardcom ב-WebView (Low Profile); לא IAP לקופונים/פיזי. |
| M5 | קופון: **No Escrow**. |
| M6 | RTL native מהיום הראשון (`I18nManager` / expo-localization). |
| M7 | Push דרך outbox `channel=push` + טבלת `push_tokens` (`114`). |
| M8 | ארנק: QR **אופליין לתצוגה**; redeem תמיד אונליין אצל הספק (שרת מכריע). |
| M9 | סריקת ספק: device = `supplier_members`; PIN = ייחוס עובד (`115`), לא הרשאה. |
| M10 | PWA = גשר עד החנויות; לא מחליף את האפ (ראה PWA). |

---

## 1. מצב נוכחי (יעד מול scaffold)

| אזור | חוזה |
|---|---|
| Scaffold | `apps/mobile/` (Expo, Expo Router, TypeScript), מחוץ ל-`pnpm-workspace` בכוונה |
| Scheme | `kenyonexpress` + Universal/App Links |
| Auth session | SecureStore (לא AsyncStorage לטוקן) |
| Push | `POST /api/app/push-tokens` + מיגרציה `114` |
| סריקה | מצלמה → redeem API; תור אופליין מקומי ≠ "מומש" |
| Checkout | WebView על האתר; finalize בשרת |
| RTL | `forceRTL(true)` ב-root layout |

---

## 2. Auth + deep links

```text
https://kenyonexpress.co.il/...  → מוצר / חשבון / checkout / קופון
kenyonexpress://               → OAuth / magic-link / חזרה מ-Cardcom
```

| כלל | פירוט |
|---|---|
| Redirect URLs | רשימה סגורה ב-Supabase Dashboard בלבד |
| Callback | מסך באפ מחליף code/session; אין service role |
| Push/מייל | https בלבד החוצה; scheme פנימי |
| סנכרון | `src/lib/app/deep-links.ts` ↔ `app.json` |

---

## 3. Push (`push_tokens`)

| פריט | ערך |
|---|---|
| טבלה | `public.push_tokens` (`114`) |
| רישום | אחרי login + הרשאת התראות |
| שליחה | Drain outbox → Expo Push Service |
| כיבוי | `DeviceNotRegistered` → `enabled=false` |
| שיווק | אסור בלי מסלול consent נפרד |

---

## 4. סריקת ספק (staff PIN)

```text
supplier_members → app_scanning_enabled
  → PIN → verify_supplier_staff_pin
  → staff_id בסשן קופה
  → POST redeem (+ staff_id)
```

| כלל | פירוט |
|---|---|
| PIN | ייחוס, לא הרשאה; bcrypt ב-DB; 4-8 ספרות |
| Lockout | `failed_attempts` + `locked_until` |
| אופליין | תור סריקה מקומי; אסור "מומש" לפני תשובת שרת |

---

## 5. מטמון קופונים אופליין

```text
עם רשת: רשימה פעילה → מטמון מוצפן (QR + expires_at + id)
בלי רשת: הצגת QR + באנר "מימוש דורש חיבור"
Logout: מחיקת המטמון
```

אין redeem מקומי. אין service secrets במטמון.

---

## 6. Checkout (WebView)

עגלה/סליקה = האתר בתוך WebView. Finalize = webhook + `GetLpResult` בשרת. אותו `CHECKOUT_ENABLED`. אין חישוב כסף באפ.

---

## 7. סדר יישום

1. ייצוב Auth deep links  
2. Push end-to-end  
3. מטמון ארנק אופליין  
4. סריקת ספק + PIN  
5. תור סריקה אופליין (UX "בתור" ≠ "מומש")  
6. EAS + soft store (בלי IAP לקופונים)  
7. shared contracts אופציונלי (DTOs בלבד)  

---

## 8. Acceptance

- [ ] אין service role באפ  
- [ ] אותם מחירי API כמו web  
- [ ] RTL בכל מסכי כסף וסריקה  
- [ ] QR קופון זמין בלי רשת; redeem לא  
- [ ] Push transactional עם deep link https  
- [ ] PIN מייחס `staff_id` בלי להרחיב הרשאות  
- [ ] Cardcom רק ב-WebView; finalize בשרת  
- [ ] אין נוסח Escrow  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Expo RN, QR, push, No Escrow |
| 2026-08-11 | מבנה audit → target → migration; `114`/`115` |
| 2026-08-12 | חזון Wolt-style + חוזי API |
| 2026-08-12 | batch #46/50: רענון BINDING ממוקד על arch/docs-batch-2 |
| 2026-08-12 | batch-2 #46 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
