# MASTER-ARCHITECTURE-v2.md

המסמך המאוחד **business-model-first** ל-KenyonExpress (מהדורת docs-queue).

Status: BINDING index + money layer · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
זהות: מאחד ומפנה למסמכי `docs/` ב-worktree זה. בסתירת כסף, **סעיף 1 כאן דורס**.

אינדקס מלא לקבצים: `docs/ARCHITECTURE-DOCS-INDEX.md`.

---

## 0. סדר סמכות

1. **המודל העסקי** (סעיף 1 כאן)
2. אבטחה / ציות (`ARCHITECTURE-SECURITY-COMPLIANCE.md`, `ARCHITECTURE-LEGAL.md`)
3. Go-Live / ops (`ARCHITECTURE-GO-LIVE-CHECKLIST.md`)
4. מסמכי דומיין ב-`docs/ARCHITECTURE-*.md`
5. טיוטות ישנות ב-main repo / worktrees אחרים (רק אם לא סותרות)

---

## 1. המודל העסקי המחייב

### 1.1 קופון

- אדמין קובע `coupon_price_ils` **מוחלט** (לא נגזרת אחוז).
- הלקוח משלם באתר את **מלוא** מחיר הקופון (Cardcom).
- יתרה (`face - coupon_price`) משולמת **בבית העסק** בסריקה.
- **100% מהתשלום באתר נשאר בפלטפורמה.** ספק מקבל 0 מהאתר על קופון.
- **אין Escrow, אין J5, אין held שמשוחרר לספק במימוש.**
- אחרי תשלום: `platform_settled` + הנפקת voucher/QR.
- פקיעה בלי מימוש: זיכוי ארנק מלא (C6).

### 1.2 פיזי

- הלקוח משלם 100% באתר.
- פיצול לפי `platform_percent` **דינמי פר-מוצר**, חובה, **בלי ברירת מחדל**, מצולם ל-`order_items`.
- אין "Escrow עד משלוח". Payout לפי מדיניות (T+3 / מינימום).

### 1.3 זהות ומערכת

- Guest cart פתוח; Google OAuth בלחיצת שלם.
- ארנק פנימי בלבד (אין משיכה).
- התראות: Resend + Trigger + Edge (לא Make/Zapier).
- כסף במנוע: אגורות שלמות.

### 1.4 טבלת תזרים

| סוג | באתר | בפלטפורמה | לספק מהאתר | בעסק |
|---|---|---|---|---|
| קופון | `coupon_price` | 100% | 0 | יתרה |
| פיזי | מחיר מלא | `platform_percent` | היתרה | אין |

---

## 2. מפת מסמכים (הפניות לחדשים ולליבה)

### 2.1 Go-Live / ops (עודכן 2026-07-31)

| מסמך | תפקיד |
|---|---|
| `docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md` | דומיין, Vercel prod, env, Cardcom creds, Sentry, גיבויים |
| `docs/ARCHITECTURE-ENV-SECRETS.md` | מטריצת סודות |
| `docs/ARCHITECTURE-FEATURE-FLAGS.md` | Kill switches |
| `docs/ARCHITECTURE-BACKUP-DR.md` | PITR / restore |
| `docs/ARCHITECTURE-OBSERVABILITY.md` | מדדים/לוגים |
| `docs/ARCHITECTURE-INCIDENT-RESPONSE.md` | SEV playbooks |
| `docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md` | התאמת Cardcom↔orders |
| `docs/ARCHITECTURE-TESTING-CICD.md` | CI |

### 2.2 Commerce / checkout

| מסמך | תפקיד |
|---|---|
| `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md` | תשלום |
| `docs/ARCHITECTURE-CART-ZUSTAND.md` | עגלה |
| `docs/ARCHITECTURE-COUPON-REDEMPTION.md` | מימוש QR |
| `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md` | משלוח פיזי |
| `docs/ARCHITECTURE-SHIPPING-RETURNS.md` | החזרות/משלוח |
| `docs/ARCHITECTURE-INVOICING-TAX.md` | חשבוניות |

### 2.3 ספקים / אדמין / צמיחה

| מסמך | תפקיד |
|---|---|
| `docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md` | צירוף ספק, מסמכים, `platform_percent` |
| `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` | פורטל + סורק |
| `docs/ARCHITECTURE-ADMIN.md` / `ADMIN-DASHBOARD.md` | אדמין |
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | טופס מוצר |
| `docs/ARCHITECTURE-REFERRALS.md` | הפניות |

### 2.4 אנליטיקה ותמיכה (עודכן 2026-07-31)

| מסמך | תפקיד |
|---|---|
| `docs/ARCHITECTURE-ANALYTICS.md` | **GA4**, אירועי המרה, דשבורד מכירות |
| `docs/ARCHITECTURE-ANALYTICS-KPI.md` | מילון KPI לבעלים |
| `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md` | **החזרים, ביטול קופון, מדיניות** |
| `docs/ARCHITECTURE-AI-AGENTS-SUPPORT.md` | סוכן CS + סוכן ספקים |
| `docs/ARCHITECTURE-AI-AGENTS.md` | סוכני תוכן/מיגרציה וכו' |

### 2.5 Storefront / account / data

| מסמך | תפקיד |
|---|---|
| `docs/ARCHITECTURE-SEO-PERFORMANCE.md` | SEO + CWV |
| `docs/ARCHITECTURE-ACCOUNT-AREA.md` | אזור אישי |
| `docs/ARCHITECTURE-NOTIFICATIONS-V2.md` | Resend + Edge |
| `docs/ARCHITECTURE-MOBILE-APP.md` | אפליקציה עתידית |
| `docs/ARCHITECTURE-WP-MIGRATION.md` + `WP-DATA-MIGRATION-EXECUTION.md` | ייבוא WP |
| `docs/ARCHITECTURE-DESIGN-SYSTEM.md` / `ACCESSIBILITY.md` / `COOKIE-CONSENT.md` | UX / פרטיות |
| `docs/ARCHITECTURE-DOCS-INDEX.md` | אינדקס מלא |

---

## 3. Flows עיקריים (תמצית)

```
Guest cart → שלם → Google → checkout → Cardcom
  → finalize → coupon: platform_settled + voucher/QR + notify
             → physical: split_executed + supplier notify
```

```
Supplier onboarding → docs → members → set platform_percent / coupon_price
  → admin publish → scan / ship
```

```
Support: ticket → policy matrix → refund/cancel only if issued → audit
```

---

## 4. אנטי-דפוסים בטלים בכל המסמכים

1. Escrow חיצוני / J5 / שחרור מקדמת קופון לספק.
2. עמלה קבועה 5% או 10% כברירת מחדל.
3. גזירת `coupon_price` כאחוז אוטומטי ממחיר המחירון בלי החלטת אדמין.
4. Make/Zapier כמסלול ייצור להתראות או תשלומים.
5. `purchase` ב-GA4 מ-redirect בלי finalize.

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-24 | MASTER v2 מקור ב-main (business-model-first) |
| 2026-07-31 | עותק מחייב ב-`ke-arch`: הפניות ל-GO-LIVE/ONBOARDING/ANALYTICS/SUPPORT החדשים; C11א בלי Escrow held-לספק |
