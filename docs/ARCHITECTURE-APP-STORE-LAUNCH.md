# ארכיטקטורה: השקה בחנויות האפליקציה

הכנה לפרסום אפליקציית KenyonExpress ב-App Store ו-Google Play.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין מסכי נאמן / held / J5. קופון = שולם באתר + יתרה בעסק. פיזי = `platform_percent` פר מוצר (בלי default).

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ROADMAP-V2.md
docs/CONTRADICTIONS.md
```

עקרון: Web נשאר ערוץ SEO ורכישה ראשונית. האפ (Expo) = שימור, Push, ארנק קופונים, סריקת ספק. PWA גשר עד שהאפ בחנויות.

---

## החלטה

| # | הכרעה מחייבת |
|---|---|
| AS1 | Client: Expo + EAS Build (iOS + Android). |
| AS2 | אותו Supabase Auth/DB כמו ה-web; אין backend שני. |
| AS3 | תשלומים: Cardcom דרך WebView/שרת; **לא** Store IAP לקופונים/מוצרים פיזיים. |
| AS4 | ארנק פנימי: אין משיכה החוצה; חובה בניסוח מדיניות פרטיות ותנאי שימוש. |
| AS5 | לפני Soft Launch בחנויות: soft-open web יציב + רכישת טסט + redeem טסט. |
| AS6 | חשבונות מפתח: Apple Developer + Google Play Console על שם העוסק. |
| AS7 | **No Escrow:** אין מסכי נאמן/held/J5. Store copy בעברית RTL. |
| AS8 | סדר השקה: web יציב → PWA (אופציונלי) → EAS preview → closed test → production listing → soft launch. |

### דרישות חנות (צ'קליסט)

| פריט | Apple | Google | חובה |
|---|---|---|---|
| שם, אייקון, screenshots עברית | כן | כן | כן |
| Privacy / Terms URL חיים | כן | כן | כן |
| גילוי תשלום מחוץ לחנות | Review notes | Data safety | כן |
| Sign in with Apple | אם Google login | N/A | לפי Apple |
| Camera (סורק ספק) | `NSCameraUsageDescription` | Photos/Camera | כן |
| Push | APNs | Android 13+ permission | כן |
| Test account ל-reviewer | כן | internal testing | כן |

### מה לא לשלוח לביקורת

- Service role / סודות Cardcom ב-bundle
- Checkout שבור או `CHECKOUT_ENABLED` בלי מסלול דמו
- טקסט "כסף יועבר לבנק" מהארנק הפנימי
- מסכי Escrow / held / J5

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Store IAP לקופונים/מוצרים | AS3: Cardcom; Apple/Google לא מתאימים למודל קופון+פיזי. |
| Backend נפרד לאפ | AS2: Supabase יחיד. |
| PWA כתחליף קבוע לאפ | PWA גשר בלבד. |
| Escrow / held במסכי אפ | AS7: No Escrow. |
| React Native bare (ללא Expo) | AS1: Expo + EAS לבנייה חתומה. |
| השקה בחנות לפני web יציב | AS5: soft-open web קודם. |

---

## סכמת DB

**אין DDL חדש במסמך זה.** האפ קוראת לאותן טבלאות כמו web.

| טבלה | שימוש באפ |
|---|---|
| `profiles`, auth | login Google / Apple |
| `orders`, `vouchers` | קופונים שלי, QR |
| `wallet_*` | יתרה פנימית (קריאה) |
| `supplier_members` | סורק ספק |
| `push_tokens` | רישום APNs/FCM |

אין טבלת `app_store_metadata` חובה; listing metadata ב-Console/Changelog ב-repo אופציונלי.

---

## מקרי קצה

| # | מקרה | התנהגות מחייבת |
|---|---|---|
| CE1 | Reviewer בלי Cardcom test | Review notes + test account + הסבר web checkout |
| CE2 | Apple דורש Sign in with Apple | להוסיף אם יש Google בלבד |
| CE3 | Push כבוי ב-build | הצדקה ב-review notes |
| CE4 | סורק ספק לא מוכן | closed test פנימי לפחות; production עם הסבר |
| CE5 | Store copy מזכיר Escrow | **נדחה** לפני הגשה |
| CE6 | Deep link לקופון אחרי login | MOBILE-APP flow |
| CE7 | גרסת API ישנה ב-review | Target API level עדכני (Google) |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | תאריך יעד production listing | ROADMAP-V2 |
| O2 | TestFlight vs internal testing קהל | ops |
| O3 | Privacy Nutrition Labels סופי | LEGAL + analytics stack |
| O4 | Expo SDK version lock ל-EAS | MOBILE-APP |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | מסמך הכנה App Store / Google Play |
| 2026-08-07 | QA: AS7 No Escrow |
| 2026-08-12 | batch-2: כתיבה מחדש BINDING (5 סעיפים) |
