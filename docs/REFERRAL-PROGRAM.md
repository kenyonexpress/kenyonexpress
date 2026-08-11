# תוכנית חבר מביא חבר (מוצר + אנטי-fraud)

Status: **PLAN** · עודכן: 2026-08-12
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.
מודל כסף: No Escrow; בונוס ארנק פנימי בלבד.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| R1 | /r/{code} + 30d last-touch |
| R2 | בונוס אחרי paid + סף |
| R3 | idempotency keys |
| R4 | self-referral block |

---

## 2. חלופות שנדחו

| חלופה | נימוק |
|---|---|
| משיכה לבנק | wallet policy |
| בונוס משנה platform_percent | PRICING |
| בונוס לפני paid | fraud |

---

## 3. סכמת DB

| טבלה | שדות |
|---|---|
| referrals | referrer, referred, status |
| wallet_ledger | referral_bonus |

---

## 4. מקרי קצה

| E1 | chargeback after bonus | hold window |
| E2 | same payment token | block |

---

## 5. פתוחות

| O1 | hold days before credit | config | 2026-08-12 |

---

## 1. הצעת ערך (ללקוח)

- מפנה משתף קישור `/r/{code}`
- מופנה נרשם/מתחבר ומשלם הזמנה ראשונה שעומדת בסף
- שני הצדדים מקבלים **קאשבק לארנק פנימי בלבד** (אין משיכה לבנק)

סכומים: לפי קונפיג אדמין (agorot). אין הבטחת "כסף בבנק".

---

## 2. זרימה (תמצית)

```text
שיתוף → נחיתה + cookie/attribution (30 יום, last-touch)
  → הרשמה (≠ מפנה)
  → תשלום paid מעל סף
  → זיכוי ארנק (idempotent)
```

פרטים: R1-R7 ב-

```
docs/ARCHITECTURE-REFERRAL.md
```

---

## 3. אנטי-fraud (חובה)

| סיכון | הגנה |
|---|---|
| Self-referral | אותו user / אותו device fingerprint חזק / אותו payment token → חסימה |
| חוות חשבונות | rate limit על יצירת קודים + על המרות; קאפ יומי למפנה |
| הזמנות דמה + ביטול | בונוס רק אחרי `paid` + חלון hold קצר לפני זיכוי אם chargeback גבוה |
| ניצול כפול | מפתחות idempotency: `referral_referrer:{id}` / `referral_referred:{id}` |
| שיתוף המוני מפוקפק | דגל `manual_review` מעל N המרות/יום |
| שינוי עמלה | אסור; בונוס לא נוגע ב-`platform_percent` |

כל פעולת זיכוי נרשמת ב-ledger ארנק עם סיבת `referral_bonus`.

---

## 4. UX אזור אישי

- מסך "הזמינו חבר": קוד, העתקה, WhatsApp
- היסטוריית הפניות: pending / completed / rejected
- יתרת ארנק + קישור לשימוש בקופה

טקסטים בעברית בלבד. בלי "Escrow" / "נאמן".

---

## 5. Acceptance

- [ ] Self-referral נחסם
- [ ] כפל זיכוי נחסם
- [ ] חלון 30 יום + last-touch
- [ ] בונוס רק בארנק פנימי
- [ ] דגל manual_review מעל סף

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | שכבת מוצר/fraud מעל ARCHITECTURE-REFERRAL |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2: החלטה, חלופות, DB, קצה, פתוחות |

