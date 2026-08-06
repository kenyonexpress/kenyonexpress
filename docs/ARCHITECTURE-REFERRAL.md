# ארכיטקטורה: חבר מביא חבר

תוכנית הפניות עם **קאשבק פנימי** (בלי משיכה החוצה).

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-ANALYTICS.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| R1 | קישור: `/r/{code}` קבוע למשתמש. |
| R2 | שיוך last-touch, חלון 30 יום. |
| R3 | בונוס רק אחרי הזמנה paid שעומדת בסף. |
| R4 | זיכוי רק בארנק פנימי (`referral_bonus`). |
| R5 | Idempotency: `referral_referrer:{id}` / `referral_referred:{id}`. |
| R6 | אין self-referral; rate limit + manual_review על abuse. |

---

## 1. זרימה

```text
A משתף /r/CODE
  → B נוחת; נשמר referral_code + clicked_at
  → B נרשם/מתחבר (≠ A)
  → B משלם תוך 30 יום
  → זיכוי ארנק ל-A ול-B (לפי קונפיג)
  → referrals.status = completed
```

---

## 2. סכומים

| צד | תצורה | יחידה |
|---|---|---|
| מפנה | סכום קבוע או % מ-on-site | agorot |
| מופנה | סכום לקנייה ראשונה | agorot |

שינוי סכומים: admin + audit. אין הבטחת "כסף בבנק".

---

## 3. UX

אזור אישי: "הזמינו חבר" + העתקה + WhatsApp.  
הודעת זיכוי: `wallet_activity` / מייל קצר.

---

## 4. Acceptance

- [ ] Self-referral נחסם  
- [ ] כפל זיכוי נחסם  
- [ ] חלון 30 יום + last-touch  
- [ ] בונוס רק בארנק פנימי  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | חבר מביא חבר עם קאשבק פנימי |
| 2026-08-06 | QA: קישור ANALYTICS; בונוס ארנק פנימי בלבד (לא Escrow) |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
