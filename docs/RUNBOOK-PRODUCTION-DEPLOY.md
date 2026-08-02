# RUNBOOK: First Production Deploy

מדריך צעד-אחר-צעד לשיגור ייצור ראשון: Vercel env, מפתחות Cardcom prod, cutover DNS מ-WordPress, תוכנית rollback.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי. לא מריץ deploy במסמך זה.

Companions:

```
docs/LAUNCH-DAY.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/RUNBOOK-INCIDENTS.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
```

כלל ברזל: עד שרכישת הטסט עוברת, `CHECKOUT_ENABLED=false`.  
אסור: `supabase db push` לייצור ביום השיגור; מפתחות Cardcom תחת `NEXT_PUBLIC_`.

---

## 0. סדר הביצוע

| # | שלב | יציאה |
|---|---|---|
| 1 | Freeze + גיבוי | SHA קפוא; PITR פעיל |
| 2 | Vercel env checklist | כל P0 ממולא ב-Production |
| 3 | Cardcom production keys + URLs | מסוף חי + webhook על הדומיין |
| 4 | Deploy Production (דומיין עדיין לא חובה) | Deployment Ready |
| 5 | Smoke בלי תשלום על preview/alias | home/PDP/cart/login |
| 6 | DNS cutover מ-WordPress | dig → Vercel; SSL Valid |
| 7 | רכישת טסט ראשונה | paid + voucher + מייל |
| 8 | Soft-open checkout | `CHECKOUT_ENABLED=true` רק אחרי 7 PASS |
| 9 | Rollback (רק בכשל) | לפי §5 |

---

## 1. Freeze + backup (T-60)

1. עצירת מיזוגים ל-Production branch.
2. CI ירוק על SHA השיגור (typecheck, tests).
3. רישום SHA + שעה ב-`STATE.md`.
4. Supabase: PITR / automated backups פעילים.
5. וידוא שיש מי שיודע Instant Rollback ב-Vercel.

---

## 2. Vercel env vars checklist (Production)

ממשק: **Vercel → Project → Settings → Environment Variables → Production**.  
אחרי שינוי מהותי: Redeploy.

### 2.1 P0 חובה

| Variable | הערות |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://kenyonexpress.co.il` (בלי slash בסוף) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL פרויקט **prod** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon של אותו פרויקט |
| `SUPABASE_SERVICE_ROLE_KEY` | או `SUPABASE_SECRET_KEY`; לעולם לא `NEXT_PUBLIC_` |
| `CARDCOM_TERMINAL_NUMBER` | מסוף Production |
| `CARDCOM_API_NAME` | שם API prod |
| `CARDCOM_API_PASSWORD` | סיסמת API prod |
| `CARDCOM_WEBHOOK_PASSWORD` | סיסמת webhook prod |
| `CHECKOUT_ENABLED` | התחלה: `false` |
| `CRON_SECRET` | Bearer ל-crons |
| `RESEND_API_KEY` | דומיין מאומת |
| `RESEND_FROM` | למשל `KenyonExpress <noreply@kenyonexpress.co.il>` |

### 2.2 P1 מומלץ ליום 1

| Variable | הערות |
|---|---|
| `VOUCHER_QR_SECRET` / חתימת QR | אם בשימוש |
| R2: `R2_*` / `AWS_*` תואם | מדיה |
| `MEILI_*` | חיפוש |
| `QSTASH_*` | אם אינדוקס/jobs דרך QStash |
| `SENTRY_DSN` | שגיאות |
| `UNSUBSCRIBE_SIGNING_SECRET` | מיילים |

### 2.3 אסור

- העתקת Preview secrets ל-Production בלי בדיקה
- `NEXT_PUBLIC_` על כל סוד Cardcom / service role
- ערכי staging ב-Production

---

## 3. Cardcom production keys

| שלב | פעולה |
|---|---|
| 1 | במסוף Cardcom Production: Terminal + API user/password |
| 2 | הזנת ארבעת `CARDCOM_*` ב-Vercel Production בלבד |
| 3 | Success / Error / Indicator URLs על `https://kenyonexpress.co.il/...` (לא localhost) |
| 4 | Webhook URL + password תואם `CARDCOM_WEBHOOK_PASSWORD` |
| 5 | Redeploy אחרי שמירת env |
| 6 | בדיקת sandbox/test card **רק** אם Cardcom מאשר על מסוף prod; אחרת כרטיס אמיתי בסכום קטן + refund מתוכנן |

אסור לאשר תשלום ידני ב-SQL כתחליף ל-webhook.

---

## 4. DNS cutover מ-WordPress

יעד: apex + www מצביעים ל-Vercel; WP יורד מהדומיין הציבורי.

### 4.1 לפני ה-cutover

1. לוודא Vercel Domain מתווסף לפרויקט (`kenyonexpress.co.il`, `www`).
2. לרשום את רשומות ה-DNS הנוכחיות של WP (A/CNAME/MX/TXT) לצילום מסך.
3. **לא לשבור MX** של מייל עסקי אם הוא על אותו דומיין.
4. Resend: SPF/DKIM נשארים / מתעדכנים לפי הדומיין.

### 4.2 Cutover

| רשומה | יעד טיפוסי |
|---|---|
| `A` / `ALIAS` apex | לפי הנחיית Vercel (לעיתים A ל-IP שלהם או ALIAS) |
| `CNAME` www | `cname.vercel-dns.com` (או הערך ש-Vercel מציג) |
| TXT | אימות דומיין Vercel אם נדרש |

TTL: להוריד ל-300 לפני השינוי אם אפשר, יום קודם.

### 4.3 אימות

```text
dig +short kenyonexpress.co.il
dig +short www.kenyonexpress.co.il
```

Vercel: Domain Valid + Certificate Valid.  
Chrome: `https://kenyonexpress.co.il` מגיש את Next (לא WP).

### 4.4 WordPress אחרי cutover

- WP נשאר על hostname פנימי / staging לצורך ארכיון זמני
- הפניות 301 מנתיבי WP ישנים לפי מפת מיגרציה (לא במסמך זה)
- לא למחוק WP באותה שעה לפני smoke + רכישת טסט

---

## 5. Rollback plan

| כשל | פעולה מיידית |
|---|---|
| באג חמור אחרי deploy, DNS עדיין ישן | Instant Rollback ב-Vercel ל-deployment קודם |
| כסף שבור אחרי soft-open | `CHECKOUT_ENABLED=false` + Redeploy/restart | 
| DNS שבור / SSL | החזרת רשומות DNS לצילום ה-WP; TTL נמוך עוזר |
| Cardcom webhook נכשל | כיבוי checkout; לא לסמן paid ידני |
| מייל נכשל אבל הזמנה+QR תקינים | לא חוסם soft-open; תיקון Resend בנפרד |

סדר rollback מומלץ:

1. `CHECKOUT_ENABLED=false`
2. Vercel Instant Rollback
3. אם DNS רע: שיחזור רשומות קודמות
4. הודעה לתמיכה; איסוף order ids חשודים
5. לא `supabase db push` / restore עיוור בלי ARCHITECTURE-BACKUP-DR

---

## 6. Smoke + רכישת טסט

בלי תשלום: `/`, PDP קופון, cart, Google login.  
עם תשלום (אחרי DNS+env): הזמנת קופון → `paid_at` → voucher → QR ב-`/account/coupons` → מייל/outbox → (אופציונלי) refund מתוכנן.

פרטים מורחבים: `LAUNCH-DAY.md`.

---

## 7. Acceptance

- [ ] Checklist env P0 מלא ב-Production
- [ ] ארבעת `CARDCOM_*` prod + URLs על הדומיין החי
- [ ] dig מצביע ל-Vercel; WP לא על apex
- [ ] רכישת טסט PASS
- [ ] תוכנית rollback ידועה לבעלים + הנדסה
- [ ] `CHECKOUT_ENABLED` נפתח רק אחרי PASS

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
