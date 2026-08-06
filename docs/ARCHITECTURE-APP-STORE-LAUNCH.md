# ארכיטקטורה: השקה בחנויות האפליקציה

הכנה לפרסום אפליקציית KenyonExpress ב-App Store ו-Google Play.

Status: **BINDING** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ROADMAP-V2.md
```

עקרון: Web נשאר ערוץ SEO ורכישה ראשונית. האפ (Expo) = שימור, Push, ארנק קופונים, סריקת ספק.  
PWA היא גשר עד שהאפ בחנויות; לא תחליף קבוע.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| AS1 | Client: Expo + EAS Build (iOS + Android). |
| AS2 | אותו Supabase Auth/DB כמו ה-web; אין backend שני. |
| AS3 | תשלומים: Cardcom דרך WebView/שרת; לא Store IAP לקופונים/מוצרים פיזיים. |
| AS4 | ארנק פנימי: אין משיכה החוצה; יש לנסח במדיניות פרטיות ותנאי שימוש. |
| AS5 | לפני Soft Launch בחנויות: soft-open web יציב + רכישת טסט + redeem טסט. |
| AS6 | חשבונות מפתח: Apple Developer + Google Play Console על שם העוסק. |

---

## 1. דרישות חנות (צ'קליסט)

### 1.1 משותף

| פריט | סטטוס נדרש |
|---|---|
| שם אפ, אייקון, screenshots עברית | חובה |
| תיאור קצר/מלא בעברית | חובה |
| מדיניות פרטיות URL חי | חובה |
| תנאי שימוש URL חי | חובה |
| הצהרת נגישות / קישור | מומלץ + LEGAL |
| גילוי תשלום מחוץ לחנות (קופונים) | חובה בניסוח |
| תמיכה: מייל/טופס בעברית | חובה |
| גרסת build חתומה (EAS) | חובה |

### 1.2 Apple App Store

| פריט | הערות |
|---|---|
| Privacy Nutrition Labels | איסוף analytics/account; בלי PII מיותר |
| Sign in with Apple | אם יש Google login חברתי אחר: לבדוק חובת Apple |
| Push (APNs) | entlements + הרשאת משתמש |
| Camera (ספק) | `NSCameraUsageDescription` בעברית |
| Review notes | הסבר: קופונים נרכשים באתר/באפ דרך Cardcom; אין IAP דיגיטלי לחנות |
| Test account | משתמש reviewer + קופון דמו אם נדרש |

### 1.3 Google Play

| פריט | הערות |
|---|---|
| Data safety form | תואם מדיניות פרטיות |
| Photos/Camera permission | לסורק ספק |
| Notifications permission | Android 13+ |
| Target API level | לפי דרישת Google העדכנית |
| Internal / closed testing | לפני production track |

---

## 2. מה לא לשלוח לביקורת

- Service role / סודות Cardcom ב-bundle  
- Checkout שבור או `CHECKOUT_ENABLED` בלי מסלול דמו ל-reviewer  
- טקסט שמבטיח "כסף יועבר לבנק" מהארנק הפנימי  
- מסכי Escrow/held לקופון  

---

## 3. סדר השקה מומלץ

```text
1. Web soft-open יציב (ROADMAP שלב A)
2. PWA bridge (אופציונלי)
3. EAS preview פנימי (TestFlight + internal testing)
4. Closed test עם ספקים אמיתיים (סריקה)
5. Production store listing בעברית
6. Soft launch גיאוגרפי / מדורג
```

תלויות: MOBILE-APP, NOTIFICATIONS (push), LEGAL (מדיניות), CASHBACK-WALLET (ניסוח ארנק), SUPPLIER-PORTAL (מצב ספק).

---

## 4. Acceptance לפני הגשה לחנות

- [ ] Build EAS iOS + Android ירוק  
- [ ] Privacy / Terms / Support URLs חיים בעברית  
- [ ] Login + הצגת קופון + QR  
- [ ] Checkout Cardcom במסלול reviewer או הסבר ברור  
- [ ] Push registration עובד (או כבוי עם הצדקה)  
- [ ] סורק ספק במצב פנימי לפחות  
- [ ] אין סודות ב-client  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | מסמך הכנה להשקה ב-App Store / Google Play |
