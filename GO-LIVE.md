# GO-LIVE

שער שיגור קופונים: מה חייב להיות ירוק לפני פתיחת פרוד.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין push לפרוד בלי אישור חריג.

מסמכים קשורים:

```
docs/GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-LAUNCH-CHECKLIST.md
docs/ARCHITECTURE-RLS-MATRIX.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
RELEASE-READINESS.md
```

מודל כסף: **No Escrow**.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| G1 | Soft-open = קופונים בלבד עד שערים ירוקים. |
| G2 | Cardcom: webhook + GetLpResult חובה; אין paid מ-return בלבד. |
| G3 | RLS: `NOT rowsecurity = 0` על `public`. |
| G4 | כסף: agorot; platform_percent בלי default על מוצרים פעילים. |
| G5 | Redeem RPC חי; wrong shop = not_found. |
| G6 | Secrets רק ב-Vercel/Supabase; לא ב-git. |
| G7 | Kill switches: CHECKOUT_ENABLED / feature flags. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| שיגור עם Escrow docs | סותר BUSINESS-MODEL. |
| שיגור בלי reconcile webhook | double/miss charge. |
| שיגור מנויים באותו יום | דגל נפרד אחרי יציבות. |

---

## 2. סכמת DB

שער על טבלאות ליבה מ-RLS-MATRIX. אין DDL בשיגור בלי אישור.

---

## 3. שערי GO / NO-GO (תמצית)

| שער | GO כש |
|---|---|
| Checkout E2E | paid + voucher issued |
| Webhook idempotency | replay בטוח |
| Supplier scan | success + already_redeemed |
| Admin publish | בלי % נחסם |
| Observability | Sentry/ntfy על 5xx כסף |
| Legal pages | פורסמו RTL |

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `checkout_flag_off` | 503/הודעה; אין charge |
| `rls_gap` | NO-GO |
| `secret_in_repo` | NO-GO |
| `compare_home_over_11` | לפי מדיניות UI; לא חוסם כסף אם מדוד |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | תאריך פתיחה | לא במסמך |
| O2 | היקף ספקים ביום 1 | allowlist ידני |

עודכן: 2026-08-12.

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING תמציתי; פירוט ב-GO-LIVE-CHECKLIST |
