# ארכיטקטורה: חבר מביא חבר (Referral)

תוכנית הפניות עם **קאשבק פנימי** (בלי משיכה החוצה).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. בונוס בארנק פנימי בלבד.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-REFERRALS.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

---

## 0. החלטה (R1 עד R7)

| # | הכרעה |
|---|---|
| R1 | קישור: `/r/{code}` קבוע למשתמש. |
| R2 | שיוך last-touch, חלון 30 יום. |
| R3 | בונוס רק אחרי הזמנה paid שעומדת בסף. |
| R4 | זיכוי רק בארנק פנימי (`referral_bonus`). |
| R5 | Idempotency: `referral_referrer:{id}` / `referral_referred:{id}`. |
| R6 | אין self-referral; rate limit + manual_review על abuse. |
| R7 | בונוס לא משנה `platform_percent` ולא יוצר Escrow/held. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| מזומן לחשבון בנק למפנה | R4; fraud + רגולציה |
| first-touch במקום last-touch | קל יותר ל-spam cookies |
| בונוס לפני paid | chargeback exposure |
| אחוז קבוע גלובלי לכל המוצרים | סותר platform_percent per product |
| referral code ב-JWT | לא מתעדכן; DB attribution |

---

## 2. סכמת DB

**DDL יעד** (מיגרציות `010_referrals_*` ומורחב):

| טבלה / שדה | שימוש |
|---|---|
| `referrals` | `referrer_id`, `referred_id`, `status`, `clicked_at` |
| `referral_codes` | `code` UNIQUE, `user_id` |
| `wallet_entries` | `kind=referral_bonus`, agorot integer |
| `orders` | trigger paid → bonus eligibility |
| `idempotency_keys` | R5 keys |

אין עמודת escrow / held. סכומים ב-agorot.

---

## 3. זרימה ו-UX

```text
A משתף /r/CODE
  → B נוחת; נשמר referral_code + clicked_at
  → B נרשם/מתחבר (≠ A)
  → B משלם תוך 30 יום
  → זיכוי ארנק ל-A ול-B (לפי קונפיג)
  → referrals.status = completed
```

| צד | תצורה | יחידה |
|---|---|---|
| מפנה | סכום קבוע או % מ-on-site | agorot |
| מופנה | סכום לקנייה ראשונה | agorot |

אזור אישי: "הזמינו חבר" + העתקה + WhatsApp.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RF-E1 | self-referral (אותו user) | נחסם; audit |
| RF-E2 | שני codes, last-touch wins | R2 |
| RF-E3 | paid אחרי 31 יום | אין בונוס |
| RF-E4 | refund לפני bonus credit | bonus לא נוצר |
| RF-E5 | refund אחרי bonus | clawback wallet (admin path) |
| RF-E6 | burst registrations same IP | manual_review; R6 |
| RF-E7 | duplicate idempotency replay | no-op |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | סכומי בונוס production (עסקי) | 2026-08-12 |
| O2 | הפעלת schema `010` בפרוד | 2026-08-12 |
| O3 | A/B on referral copy | 2026-08-12 |

---

## 6. Acceptance

- [ ] Self-referral נחסם
- [ ] כפל זיכוי נחסם
- [ ] חלון 30 יום + last-touch
- [ ] בונוס רק בארנק פנימי

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | חבר מביא חבר עם קאשבק פנימי |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
