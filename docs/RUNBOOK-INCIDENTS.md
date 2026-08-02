# RUNBOOK: Incidents

Playbooks לאירועים: אתר למטה, תשלומים נכשלים, תקלת Supabase, QR לא נסרק אצל ספק, שחזור DB.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/RUNBOOK-OPERATIONS.md
docs/LAUNCH-DAY.md
```

תפקידים: Incident lead (בעלים/הנדסה), Communications (תמיכה), Money guard (`CHECKOUT_ENABLED`).

---

## 0. כללי תגובה

1. **Stabilize לפני investigate:** כיבוי checkout אם כסף בסיכון.
2. לא `supabase db push` / restore עיוור תחת לחץ בלי אישור lead.
3. לא לסמן `paid` ידני ב-SQL כתחליף ל-webhook.
4. לתעד timeline ב-STATE / ticket: תחילה, השפעה, פעולות, סיום.
5. אחרי האירוע: blameless note + פעולת מניעה אחת לפחות.

Severity:

| Sev | דוגמה | יעד תגובה |
|---|---|---|
| SEV1 | אתר/תשלום למטה לכולם | 15 דק׳ |
| SEV2 | redeem שבור / ספקים רבים | 30 דק׳ |
| SEV3 | מייל/חיפוש חלקי | 2 שעות |

---

## 1. Site down

### תסמינים

- 5xx / timeout על apex
- Vercel deployment Failed
- DNS לא מגיע

### פעולות

| # | פעולה | איפה |
|---|---|---|
| 1 | בדיקת Vercel Deployments + status | Vercel |
| 2 | Instant Rollback ל-deployment אחרון ירוק | Vercel |
| 3 | dig + SSL Valid | Terminal / Vercel Domains |
| 4 | אם DNS שבור: החזרת רשומות מצילום | Registrar |
| 5 | `CHECKOUT_ENABLED=false` אם חצי-עולה מסוכן | Vercel env |
| 6 | הודעה לתמיכה: "תחזוקה קצרה" | ערוצי קשר |

יציאה: home + login עובדים; error rate יורד.

---

## 2. Payments failing

### תסמינים

- begin_checkout / Cardcom iframe נכשל
- webhook לא מגיע; הזמנות תקועות
- עלייה ב-Sentry על payments

### פעולות

| # | פעולה |
|---|---|
| 1 | מיד: `CHECKOUT_ENABLED=false` + Redeploy אם צריך |
| 2 | בדיקת ארבעת `CARDCOM_*` ב-Production (לא Preview) |
| 3 | Cardcom dashboard: האם החיוב עבר אצלם? |
| 4 | לוגים: webhook auth / signature / password |
| 5 | הזמנות חשודות: רשימת order_id; **לא** paid ידני |
| 6 | אם Cardcom down: הודעה ללקוחות; המתנה / failover מדיניות |
| 7 | אחרי תיקון: רכישת טסט אחת; רק אז פתיחת checkout |

Reconcile: להשוות Cardcom deals מול `payments` / `orders` לפי RUNBOOK-OPERATIONS.

---

## 3. Supabase outage

### תסמינים

- 5xx מ-Auth/DB
- RLS errors גורפים / connection refused
- Status page של Supabase

### פעולות

| # | פעולה |
|---|---|
| 1 | `CHECKOUT_ENABLED=false` |
| 2 | בדיקת status.supabase.com + Dashboard project health |
| 3 | Storefront לקריאה: אם ISR/CDN מחזיק HTML, להשאיר read-only |
| 4 | לא להריץ migrations / restore בזמן outage ספק |
| 5 | תקשורת: "תקלה בתשתית; קופה סגורה זמנית" |
| 6 | אחרי חזרה: smoke login + PDP + cart; רכישת טסט; פתיחת checkout |

אם corruption מקומי (לא outage ספק): ראה §5 + BACKUP-DR.

---

## 4. Coupon QR not scanning at supplier

### תסמינים

- ספק מדווח "לא עובד" בקופה
- `already_used` / `invalid` / `wrong_supplier` / timeout

### אבחון מהיר

| תוצאה | משמעות | פעולה |
|---|---|---|
| login נדרש על `/scan` | אין session ספק | להתחבר כ-member |
| `already_used` | מומש | לבדוק scan log + להודיע ללקוח |
| `expired` | תוקף | מדיניות refund אם רלוונטי |
| `wrong_supplier` | עסק אחר | להפנות נכון |
| `invalid_hmac` / forged | QR פגום/צילום | קוד ידני מאזור אישי |
| 5xx / timeout | infra | §1/§3; כיבוי לא חובה אם רק scan |
| rate_limited | abuse / באג לולאה | להרפות אחרי בדיקה; Fraud doc |

### פעולות תמיכה

1. לא לבקש מהלקוח לצלם QR לואטסאפ ציבורי עם payload מלא אם אפשר להימנע.
2. לא לשנות status voucher בלי admin + מדיניות.
3. אם תקלה מערכתית לספקים רבים: SEV2, הודעה לספקים, מעקב Sentry על redeem.

---

## 5. DB restore procedure

**רק** עם Incident lead. פירוט מלא: `ARCHITECTURE-BACKUP-DR.md`.

תקציר:

```text
1. CHECKOUT_ENABLED=false
2. עצירת crons (notifications, index, expiry)
3. בחירת PITR timestamp (לפני האירוע)
4. Restore ל-staging / DB חדש קודם (לא דריסה עיוורת של prod בלי אישור)
5. אימות P0: orders, payments, vouchers, wallet
6. Reconcile מול Cardcom (חיובים אחרי timestamp)
7. קידום ל-prod רק אחרי checklist
8. רוטציית secrets אם חשד דליפה
9. Smoke + רכישת טסט
10. פתיחת checkout
```

אסור: restore תוך כדי חיובים פתוחים בלי תיעוד deal ids.

---

## 6. תקשורת (תבניות קצרות)

**פנימית:**

```text
SEV{n} | {title} | impact: {who} | action: {checkout off?} | next update: {time}
```

**ללקוחות (עברית):**

```text
אנחנו מטפלים בתקלה זמנית באתר/בקופה. הרכישות מושהות לשמירת בטיחות התשלום. נעדכן כאן כשהכול תקין.
```

---

## 7. Post-incident

- [ ] Timeline
- [ ] הזמנות/סריקות שנפגעו
- [ ] האם נדרש refund / wallet
- [ ] פעולת מניעה אחת (monitor, test, runbook fix)
- [ ] עדכון STATE

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
