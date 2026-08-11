# ארכיטקטורה: מפת דרכים V1.1

מפת דרכים אחרי שיגור קופונים: יכולות Super App פנימיות, פיזי, מנוי, ארנק, בלי אינטגרציית Wolt.

Status: **BINDING (roadmap)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SUPER-APP.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/GO-LIVE.md
docs/ROADMAP-V2.md
docs/NEXT-GOALS.md
```

מודל כסף: **No Escrow**. אגורות integer. `platform_percent` פר מוצר.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| R11 | V1.0 שיגור = קופונים + checkout Cardcom + redeem + אזור אישי בסיסי. |
| R12 | V1.1 = העמקה פנימית (לא אינטגרציית Wolt): geo UX, PWA, ארנק קאשבק, תור פיזי ראשון, אנליטיקס. |
| R13 | מנויים = אחרי V1.1 או מקביל בדגל כבוי; לא חוסם קופונים. |
| R14 | Super App native = אחרי יציבות PWA + API חוזים. |
| R15 | כל שלב: docs BINDING → מיגרציה באישור → קוד → שער בדיקות. |
| R16 | אין escrow / cash-out בשום שלב במפת הדרך הזו. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| V1.1 = חיבור Wolt | SA2; תלות חיצונית. |
| מנויים לפני יציבות redeem | סיכון כסף+דמיון מוצר. |
| אפ native לפני PWA | עלות; PWA מכסה QR/התראות קודם. |
| פיצ׳רים במקביל בלי דגלים | בלתי ניתן לכבות בתקרית. |

---

## 2. סכמת DB

אין DDL במסמך. כל שלב מפנה למיגרציות `pending` באישור נפרד.

---

## 3. שלבים

### 3.1 V1.0 (שיגור קופונים) — בסיס

| פריט | סטטוס יעד |
|---|---|
| Checkout + webhooks | חי |
| Voucher mint/redeem | חי |
| Supplier scan | חי |
| Admin product fields | חי |
| RLS ליבה | שער `NOT rowsecurity=0` |

### 3.2 V1.1a — חוויית Super App קלה

| פריט | תלות |
|---|---|
| Geo מיון/סינון | GEO |
| PWA install + offline QR view | PWA |
| התראות הזמנה/מימוש | NOTIFICATIONS |
| בית מותאם | SUPER-APP |

### 3.3 V1.1b — ארנק פנימי

| פריט | תלות |
|---|---|
| Earn/spend agorot | WALLET-CASHBACK |
| UI אזור אישי | ACCOUNT-WALLET |
| אין cash-out | WC2 |

### 3.4 V1.1c — פיזי ראשון

| פריט | תלות |
|---|---|
| תור ספק shipped | FULFILLMENT |
| Payout פיזי | PAYOUT |
| מלאי בסיסי | INVENTORY |

### 3.5 אחרי V1.1 — מנוי / Native

| פריט | תלות |
|---|---|
| Cardcom Token recurring | SUBSCRIPTIONS + עו״ד |
| אפ native | MOBILE-SUPERAPP |
| שותף משלוחים אופציונלי | לא ליבה |

```text
V1.0 coupons
  → V1.1a geo/PWA/notify
  → V1.1b wallet internal
  → V1.1c physical+payout
  → V1.2 subscriptions (flag)
  → V2 native super-app
```

---

## 4. מקרי קצה / סיכונים

| קוד | תגובה שמרנית |
|---|---|
| `redeem_unstable` | לא פותחים ארנק/מנוי |
| `payout_before_bank` | חוסמים paid statement |
| `scope_creep_wolt` | דוחים לשותפות לא-ליבה |
| `flag_missing` | פיצ׳ר כבוי כברירת מחדל |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | תאריכי לוח שנה מדויקים | סדר עדיפויות בלבד; בלי הבטחת תאריך |
| O2 | האם V1.1b לפני V1.1c | ארנק לפני פיזי אם redeem יציב |
| O3 | היקף אנליטיקס ב-V1.1 | אירועי purchase/redeem בלבד |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] סדר V1.0 → V1.1a/b/c → מנוי → native  
- [ ] אין Wolt כליבה  
- [ ] No Escrow / no cash-out  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING roadmap V1.1 |
