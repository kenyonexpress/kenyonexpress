# ארכיטקטורה: עגלת אורח (Guest Cart)

Guest token, מדיניות עוגיות, מיזוג אחרי login, וקונפליקטים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-CART-ZUSTAND.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/GUEST-VS-MEMBER-STRATEGY.md
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-MONEY.md
docs/CONTRADICTIONS.md
```

מודולי קוד קנוניים (קריאה בלבד):

```
src/lib/cart/guest-session.ts
src/server/actions/cart.ts
src/app/auth/callback/route.ts
src/server/actions/auth.ts
src/proxy.ts
```

מודל כסף: **No Escrow**. עגלה לא מחזיקה עמלה/escrow/אגורות סופיות. מחיר ופיצול רק ב-`beginCheckout` מ-snapshots על המוצר החי.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| GC1 | גלישה והוספה לעגלה מותרים בלי login. |
| GC2 | תשלום / Low Profile דורשים חשבון מאומת. אורח שמגיע ל-checkout מקבל `UNAUTHENTICATED`; העגלה נשמרת עד מיזוג. |
| GC3 | מזהה אורח = cookie `ke_session_id` (httpOnly). ערך = UUID או `{uuid}.{sig}` (הפרסור לוקח UUID בלבד). |
| GC4 | Flags: `httpOnly`, `sameSite=lax`, `path=/`, `maxAge=30d`. בפרוד עם TLS: להעדיף גם `Secure`. |
| GC5 | עגלת אורח ב-DB: `carts.session_id` + `profile_id IS NULL`. עגלת משתמש: `profile_id` + בלי תלות ב-cookie אורח. |
| GC6 | אחרי login מוצלח: `mergeGuestCart(userId, sessionId)` ואז מחיקת cookie האורח. |
| GC7 | מיזוג: איחוד לפי מפתח שורה; כמות = `min(99, userQty + guestQty)`. אין "אורח דורס משתמש". |
| GC8 | מחיר/זמינות לא ננעלים בעגלה; תמיד מהמוצר החי ב-`resolveCartView` / validate / checkout. |
| GC9 | `userId` למיזוג רק מ-`auth` מאומת (callback / sign-in). אסור `userId` מגוף בקשת לקוח. |
| GC10 | כשל מיזוג לא מבטל login; עגלת המשתמש הקיימת נשארת. לוג + המשך. |
| GC11 | לפני מחיקת cookie: `linkAnalyticsIdentity(userId, guestSessionId)` כשקיים (OAuth callback). |
| GC12 | Cookie עגלה = הכרחי לתפקוד (strictly necessary). לא דורש consent אנליטיקס. לא נשלח ל-Cardcom/Meta כמזהה משתמש. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| עגלת אורח רק ב-`localStorage` | אובדן בין מכשירים/דפדפנים; אין מקור אמת לשרת; XSS קורא פריטים. Cookie httpOnly + שורת DB. |
| Cookie לא-httpOnly עם JSON פריטים | חשיפת תוכן; זיוף קל; נפח cookie. |
| מיזוג "max(qty)" במקום sum | מאבד כוונת קנייה משני הצדדים; הקוד החי = sum + cap 99. |
| אורח דורס עגלת משתמש | מוחק קניות שמורות; נדחה. |
| תשלום מלא כאורח בלי חשבון (GA) | קופון חייב זהות ל-QR באזור אישי; fraud/שחזור. ניסוי עתידי רק אחרי תשתית (GUEST-VS-MEMBER). |
| העברת `session_id` ב-query/body בלי cookie | IDOR / גניבת עגלה. |
| שמירת מחיר סופי / `platform_percent` בעגלת אורח | סותר MONEY; snapshot רק ב-checkout. |
| חסימת browse מאחורי הרשמה | סותר GUEST-VS-MEMBER G1. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

מקור: `045_restore_carts.sql` (+ אינדקסים/RLS נלווים).

```text
carts
  id
  profile_id   uuid null   -- משתמש מחובר
  session_id   text null   -- אורח (UUID מ-cookie)
  items        jsonb       -- [{ product_id, variant_id?, quantity, … }]
  expires_at   timestamptz -- אורח: חידוש בפעילות; ברירת מחדל +30d
  CONSTRAINT: profile_id IS NOT NULL OR session_id IS NOT NULL
```

| כלל | פירוט |
|---|---|
| בעלות | XOR לוגי: אורח = session בלי profile; משתמש = profile |
| מפתח שורה | `product_id` + `variant_id` (או null) |
| כמות | integer חיובי; cap כתיבה/מיזוג = 99 |
| מחיר בעגלה | אופציונלי לתצוגה בלבד; לא מקור חיוב |
| ניקוי | cron / מחיקה לפי `expires_at` לעגלות אורח |
| כתיבת אורח | Server Actions עם service role לפי cookie UUID (RLS לבדו לא רואה httpOnly) |

מומלץ (אם קיים/ליישם בנפרד): unique חלקי על `session_id` לעגלת אורח יחידה. אין DDL במסמך זה.

---

## 3. Guest token

| רכיב | ערך |
|---|---|
| שם cookie | `ke_session_id` |
| תוכן | UUID v4, או `{uuid}.{sig}` מ-proxy/חתימה; `parseGuestSessionToken` מחזיר UUID בלבד |
| יצירה | `proxy` אם אין cookie למשתמש לא-מחובר; או `ensureGuestSessionId()` בפעולת עגלה |
| קריאה | `getGuestSessionId()` / parse מה-cookie store |
| קישור ל-DB | `carts.session_id = uuid` |
| מחיקה | אחרי מיזוג מוצלח ב-login/OAuth |

אסור ב-cookie: PAN, כתובת מלאה, מחיר סופי, `platform_percent`, JWT משתמש.

ערך לא-UUID → מתעלמים ויוצרים מזהה חדש (לא קורסים את הבקשה).

---

## 4. Cookie policy

| נושא | מדיניות |
|---|---|
| קטגוריה | הכרחי לתפקוד (עגלה). לא אנליטיקס. |
| Consent | לא ממתין לבאנר ל-`ke_session_id`. באנר שולט בפיקסלים/מדידה בלבד. |
| Auth cookies | נפרדים (Supabase). לא לערבב עם guest id. |
| משך | 30 יום; מתחדש ב-`set` / פעילות כתיבה לעגלה (`expires_at` ב-DB). |
| SameSite | `lax` (OAuth return עובד; חוסם CSRF cross-site כתיבה קלאסית). |
| Secure | חובה בפועל תחת HTTPS פרוד. |
| צד ג' | לא לשלוח את ה-UUID כ-`external_id` ל-Meta/Cardcom. אנליטיקס פנימי יכול לקשר guest→user פעם אחת ב-login. |
| לאחר logout | cookie אורח חדש יכול להיווצר בגלישה; לא לשחזר אוטומטית את עגלת המשתמש ל-guest. |

פירוט משפטי/באנר: `ARCHITECTURE-COOKIE-CONSENT.md` / LEGAL.

---

## 5. מיזוג אחרי login

### 5.1 טריגרים

| מסלול | איפה |
|---|---|
| Google OAuth | `src/app/auth/callback/route.ts` אחרי `exchangeCodeForSession` |
| Email/password | `signInWithEmail` ב-`src/server/actions/auth.ts` |
| כניסות נוספות | כל הצלחת auth שמקימה session חייבת אותו דפוס: merge → (analytics link) → delete cookie |

### 5.2 אלגוריתם

```text
mergeGuestCart(userId, sessionId)
  load guest: session_id=sessionId AND profile_id IS NULL
  load user:  profile_id=userId
  if no guest items → return
  map = user items by itemKey
  for each guest item:
    if key in map → qty = min(99, map.qty + guest.qty)
    else → insert guest line (product/variant/qty only)
  upsert user cart with merged items
  DELETE guest cart row
```

| תכונה | התנהגות |
|---|---|
| Idempotency | אחרי מחיקת אורח, קריאה חוזרת = no-op |
| סדר בסיס | מתחילים מפריטי **המשתמש**, מוסיפים אורח |
| מחיר | לא מועתק; יחושב מחדש בתצוגה/checkout |
| אבטחה | `sessionId` מה-cookie של הבקשה הנוכחית בלבד |
| כשל | לא עושים rollback ל-session auth |

### 5.3 אחרי מיזוג

```text
guest browse → addToCart (ke_session_id)
  → login / OAuth
  → mergeGuestCart
  → linkAnalyticsIdentity (אם callback)
  → delete ke_session_id
  → validateCart
  → beginCheckout (auth חובה)
```

---

## 6. קונפליקטים

| קונפליקט | כלל מחייב | תוצאה למשתמש |
|---|---|---|
| אותו product(+variant) בשתי עגלות | sum כמויות, cap 99 | שורה אחת עם כמות ממוזגת |
| variant שונה לאותו מוצר | מפתחות נפרדים | שתי שורות |
| מחיר שונה ממה שזכר האורח | מחיר חי מ-DB | תצוגה/חיוב לפי קטלוג נוכחי |
| מוצר נמחק / לא פעיל אחרי מיזוג | validate ב-checkout / resolve | שורה נזרקת או חוסמת תשלום עם הודעה |
| מלאי נמוך מסכום ממוזג | checkout/inventory | clamp או דחייה לפי INVENTORY; לא בשלב merge |
| עגלת משתמש ריקה + אורח מלא | כל פריטי האורח עוברים | עגלת user חדשה/מעודכנת |
| עגלת אורח ריקה | no-op | עגלת user ללא שינוי |
| אין cookie אורח ב-login | דילוג על merge | עגלת user בלבד |
| שני טאבים כותבים עגלת אורח | last write על jsonb | אפשרי איבוד פריט טאב ישן; checkout תמיד re-price |
| merge במקביל ל-addToCart אורח | מירוץ על שורת guest | אחרי DELETE אורח, add אורח עלול ליצור עגלה חדשה תחת אותו cookie אם טרם נמחק; לכן מוחקים cookie מיד אחרי merge |
| אותו דפדפן, משתמש A ואז B | אחרי login של B: merge של cookie הנוכחי ל-B בלבד | אין העברת עגלת A ל-B דרך guest אחרי שנמחק |
| OAuth tab + session אחרת | merge רק ל-`session.user.id` מה-exchange | אין מיזוג ל-user זר |
| qty סכום > 99 | clamp 99 | לא נכשלים; אפשר להציג toast בעתיד (פתוח) |
| פריטי אורח עם שדות מחיר ישנים ב-jsonb | מתעלמים בחיוב | MONEY / validate |
| `expires_at` עבר לפני login | עגלה ריקה/נמחקה | משתמש רואה רק עגלת החשבון |
| כשל DB ב-merge | לוג; cookie עשוי עדיין להימחק או לא לפי מסלול | אם נמחק בלי merge מוצלח: סיכון איבוד פריטי אורח (ראה פתוחות) |

עדיפות במחלוקת מוצר מול אסטרטגיה ישנה ("max או sum"): **sum + cap** הוא BINDING (כמו הקוד).

---

## 7. מקרי קצה (כשלים)

| קוד | סימפטום | פעולה |
|---|---|---|
| `cookie_missing` | אין `ke_session_id` | יצירת UUID ב-proxy/ensure |
| `cookie_invalid` | לא UUID אחרי parse | התעלמות + יצירה מחדש |
| `merge_empty` | אין עגלת אורח / items=[] | no-op |
| `merge_failed` | שגיאת DB | לוג; login נמשך; עגלת user נשארת |
| `qty_cap` | סכום > 99 | clamp ל-99 |
| `stale_guest` | `expires_at` עבר | עגלה ריקה / cleanup |
| `unauthenticated_pay` | beginCheckout בלי user | `UNAUTHENTICATED`; שמירת עגלה |
| `idor_merge` | ניסיון userId זר | נחסם כי userId רק מ-auth |
| `analytics_link_missed` | נמחק cookie לפני link | מאבדים קישור guest→user; לא שוברים checkout |

---

## 8. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם למחוק cookie רק אחרי merge שהצליח (try/finally זהיר) | היום נמחק אחרי await merge; כשל חלקי עלול לאבד אורח |
| O2 | `Secure` מפורש ב-`ensureGuestSessionId` / proxy | ליישר בפרוד; docs מחייבים מדיניות |
| O3 | Toast למשתמש כש-clamp ל-99 במיזוג | UX; לא חוסם |
| O4 | Unique index חלקי `carts_one_guest` בפרוד | לאמת מול DB חי; DDL בנפרד באישור |
| O5 | ניסוי אורח+אימייל בלי login מלא לפני Cardcom | רק אחרי fraud + שחזור; לא GA |

עודכן: 2026-08-12.

---

## 9. Acceptance

- [ ] Guest token + flags מתועדים  
- [ ] Cookie policy (הכרחי מול אנליטיקס)  
- [ ] מיזוג sum+cap 99 + מחיקת עגלת אורח  
- [ ] קונפליקטים: מחיר, מלאי, טאבים, משתמשים, IDOR  
- [ ] תשלום דורש auth; מחיר לא ננעל בעגלה  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות  
- [ ] No Escrow  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון (batch-2 #4) |
| 2026-08-12 | שכתוב לפי תבנית: חלופות, DB, קונפליקטים מורחבים, פתוחות |
