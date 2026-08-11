# ARCHITECTURE-ENV-SECRETS.md

מטריצת **סביבה וסודות** ל-KenyonExpress (מה חייב איפה, מה אסור בדפדפן).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: Go-Live checklist, security, notifications V2, checkout-cardcom.

---

## 0. כללים

1. כל מה שמתחיל ב-`NEXT_PUBLIC_` נחשף לדפדפן. **אסור** service role / Cardcom password / Resend key שם.
2. Edge Functions ו-Vercel server actions בלבד מחזיקים סודות כסף.
3. Preview ≠ Production: מפתחות נפרדים; Preview לא מצביע על DB prod.
4. סיבוב סוד: תיעוד owner + תאריך; אחרי leak: rotate מיידי + invalidate tokens אם צריך.
5. אין Make/Zapier כמחסן סודות.

---

## 1. מטריצה

| Variable | Vercel Prod | Vercel Preview | Edge | Browser | הערות |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | yes | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes | yes | yes | RLS-bound |
| `SUPABASE_SECRET_KEY` / service role | yes | optional isolated | yes | **no** | |
| `CARDCOM_*` terminal + password | yes | sandbox | no* | **no** | *unless Edge charges |
| `RESEND_API_KEY` | yes | yes | yes | **no** | |
| `RESEND_FROM` | yes | yes | yes | no | |
| `CRON_SECRET` | yes | yes | yes | **no** | Bearer workers |
| `VOUCHER_QR_SECRET` | yes | yes | yes | **no** | |
| `VOUCHER_QR_SECRET_PREVIOUS` | yes | yes | yes | **no** | rotation |
| `MEILI_HOST` / `MEILI_ADMIN_KEY` | yes | yes | no | **no** admin | search-only key if public |
| `R2_*` | yes | yes | no | **no** | |
| `CHECKOUT_ENABLED` | yes | yes | no | no | kill switch |
| `ESCROW_FLOW_ENABLED` | unset/false | unset | unset | n/a | **never true** |
| `UNSUBSCRIBE_SIGNING_SECRET` | yes | yes | yes | **no** | |
| `SENTRY_DSN` | yes | yes | optional | public DSN ok | |
| `NTFY_*` | yes | optional | yes | **no** | |
| Google OAuth client | Supabase dashboard | | | | redirect URIs locked |

---

## 2. בדיקות חובה לפני שיגור

| # | בדיקה |
|---|---|
| X1 | `rg SUPABASE_SERVICE\|SECRET_KEY\|CARDCOM\|RESEND_API` תחת `src/` בלי דליפה ל-client bundles |
| X2 | Production env screenshot / Vercel API list ללא ערכים חסרים מ-§1 |
| X3 | Preview project ref ≠ prod project ref |
| X4 | `ESCROW_FLOW_ENABLED` לא מוגדר או false |

---

## 3. סיבוב

| סוד | תדירות מינימום | הערות |
|---|---|---|
| CRON_SECRET | שנתי / אחרי חשד | עדכן כל ה-cron callers |
| VOUCHER_QR_SECRET | לפי צורך | השאר PREVIOUS ל-TTL קצר |
| Resend | לפי ספק | |
| Cardcom password | לפי ספק | אל תשבור טוקנים קיימים בלי תוכנית |

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-07-31 | מטריצת env/secrets מחייבת (`arch/docs-queue`) |
