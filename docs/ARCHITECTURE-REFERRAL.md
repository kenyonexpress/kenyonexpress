# ARCHITECTURE: Referral (חבר מביא חבר)

תוכנית הפניות עם **קאשבק פנימי** לשני הצדדים (לפי כללים).

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| R1 | קישור אישי: `/r/{code}` מ-`profiles.affiliate_code` / referral code קבוע למשתמש. |
| R2 | שיוך: **last-touch**, חלון **30 יום** מ-click עד qualifying purchase. |
| R3 | בונוס רק אחרי הזמנה **paid** שעומדת בסף (מינימום on-site agorot מוגדר באדמין). |
| R4 | זיכוי דרך wallet ledger בלבד (`referral_bonus`); אין משיכה החוצה. |
| R5 | Idempotency: `referral_referrer:{id}` ו-`referral_referred:{id}`. |
| R6 | Anti-fraud: rate limit על יצירת/שיתוף קישורים; חסימת self-referral; חשד velocity → manual_review. |
| R7 | תקרת בונוסים חודשית למשתמש (יעד: לא לעבור ~12% מ-GMV אישי בלי review). |

---

## 1. זרימה

```text
A shares /r/CODE
  → B lands; cookie/local referral_code + clicked_at
  → B signs up / logs in (link user_id ≠ A)
  → B completes paid order within 30d
  → cron/finalize:
       referrals.status pending → completed
       wallet transfer referrer + referred (amounts from config)
```

טבלה: `referrals` (unique pair, status pending/completed/rejected).

---

## 2. סכומים

| צד | ברירת תצורה (יעד) | יחידה |
|---|---|---|
| מפנה (A) | סכום קבוע או % מ-on-site | agorot |
| מופנה (B) | סכום קבוע לקנייה ראשונה | agorot |

שינוי סכומים: admin only + audit. Snapshot לתנועת ה-wallet בזמן הזיכוי.

---

## 3. UX

- אזור אישי: "הזמינו חבר" + העתקת קישור + שיתוף WhatsApp.
- הודעת זיכוי: notification `wallet_activity` / מייל קצר.
- אין הבטחת "כסף בחשבון בנק".

---

## 4. Acceptance

- [ ] Self-referral נחסם
- [ ] כפל זיכוי נחסם ב-idempotency
- [ ] חלון 30 יום + last-touch
- [ ] בונוס רק בארנק פנימי

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: referral עם קאשבק פנימי |
