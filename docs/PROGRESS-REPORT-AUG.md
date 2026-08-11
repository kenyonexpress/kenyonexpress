# דוח מנהלים: אוגוסט 2026

סיכום מה נבנה ב-docs, מה חסר להשקה, סיכונים, ולוח לשבוע הקרוב.  
עודכן אחרי סבב 20 המסמכים (checkout → progress).

Status: **REPORT** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · מקור:

```
STATE.md
docs/MASTER-INDEX.md
docs/LAUNCH-VALIDATION.md
docs/LAUNCH-WEEK-RUNBOOK.md
docs/V2-VISION.md
```

אין שינוי קוד. אין נגיעה בתיקייה הראשית.

---

## 1. במספרים (ke-arch, 2026-08-11)

| מדד | ערך | הערה |
|---|---:|---|
| מסמכי `docs/*.md` | **~135** | כולל companions + סבבים 1–29 |
| קומיטי docs מאז 01.08 | **~260+** | ענף `arch/docs-lifecycle` |
| מיגרציות SQL בריפו | **73** | החלה ל-prod רק MCP |
| דפי `page.tsx` | **55** | store / account / admin / supplier |
| טסטי unit (`*.test.ts/x`) | **56** | Vitest; רף כסף בדרך ל-100% |
| מפרטי E2E | **7** | Playwright |
| ספקי פרוד פעילים (מדידה) | **11** | LAUNCH-VALIDATION |
| מוצרים לא מחוקים בפרוד | **61** | אותה מדידה |
| דילי השקה מול suppliers | **10/10 missing** | עדיין חוסם השקה שיווקית |

חבילת ROADMAP-V2 (#1-20): **QA-PASS**. מודל מחייב: **No Escrow** + `platform_percent` פר מוצר.

---

## 2. סבב 20 מסמכים (2026-08-11): הושלם

כל קובץ: כתיבה/רענון + commit + push ל-`arch/docs-lifecycle`.

| # | מסמך | תוכן עיקרי |
|---|---|---|
| 1 | `CHECKOUT-OPTIMIZATION.md` | זרימת Cardcom, כשלים, retry |
| 2 | `GUEST-VS-MEMBER-STRATEGY.md` | שערים לאורח/חבר מול checkout |
| 3 | `SUPPLIER-QUALITY-PROGRAM.md` | איכות ספקים + SLA |
| 4 | `FEATURED-DEALS-PRICING.md` | קידום דילים מחוץ ל-checkout לקוח |
| 5 | `ARCHITECTURE-MOBILE-APP.md` | Expo, WebView תשלום, push |
| 6 | `ADMIN-USER-GUIDE.md` | מדריך אדמין בעברית |
| 7 | `SUPPLIER-ONBOARDING.md` | צירוף ספק בעברית |
| 8 | `MARKETING-LAUNCH-PLAN.md` | תוכנית שיווק: תקציב, שערי עצירה |
| 9 | `ANALYTICS-SPEC.md` | אירועים + KPI מוצר |
| 10 | `CUSTOMER-SUPPORT-PLAYBOOK.md` | תסריטי מענה מורחבים |
| 11 | `SECURITY-AUDIT-CHECKLIST.md` | צ׳קליסט אבטחה להשקה |
| 12 | `PERFORMANCE-BUDGET.md` | תקציבי CWV ומשקל |
| 13 | `INTEGRATIONS-ROADMAP.md` | Wolt/Gett פנימי V0–V5 |
| 14 | `CASHBACK-WALLET-SPEC.md` | מפרט ארנק קאשבק |
| 15 | `SUBSCRIPTIONS-BILLING-SPEC.md` | Cardcom Recurring |
| 16 | `GEO-FEATURES-SPEC.md` | עיר / near / פרטיות |
| 17 | `WHATSAPP-COMMERCE-SPEC.md` | WA בלי סליקה בצ׳אט |
| 18 | `SEO-CONTENT-STRATEGY.md` | אסטרטגיית תוכן SEO |
| 19 | `LAUNCH-WEEK-RUNBOOK.md` | D-2 עד D+7 |
| 20 | `PROGRESS-REPORT-AUG.md` | דוח זה |

### 2.1 סבב 21–29 (2026-08-11): הושלם

| # | מסמך | תוכן עיקרי |
|---|---|---|
| 21 | `LEGAL-TERMS-SUPPLIERS.md` | הסכם ספקים בעברית (טיוטה; דורש עו״ד) |
| 22 | `REFUNDS-CANCELLATION-POLICY.md` | ביטולים לפי הגנת הצרכן |
| 23 | `DATA-RETENTION-POLICY.md` | משכי שמירה + קישור IR/backup |
| 24 | `INCIDENT-RESPONSE-RUNBOOK.md` | מסגרת SEV / kill switch / postmortem |
| 25 | `BACKUP-RESTORE-RUNBOOK.md` | Supabase PITR + dump offsite |
| 26 | `EMAIL-TEMPLATES-SPEC.md` | קטלוג Resend RTL |
| 27 | `COUPON-LIFECYCLE-SPEC.md` | issued / used / expired / refunded |
| 28 | `FRAUD-PREVENTION-SPEC.md` | משטחים, velocity, chargeback |
| 29 | `VENDOR-PAYOUT-SPEC.md` | פיזי: Cardcom ללקוח → באצ' בנקאי לספק |

הכרעת payout: "דרך Cardcom" = סליקת לקוח ב-Cardcom; העברה לספק נשארת ידנית+CSV (לא Cardcom Financial ב-MVP).

אינדקס מעודכן:

```
docs/MASTER-INDEX.md
```

---

## 3. מה נבנה החודש (לפי נושא)

| תחום | דוגמאות |
|---|---|
| כסף | Cardcom flow, checkout retry, vendor payout אחרי settlement, No Escrow |
| השקה | VALIDATION, LAUNCH-WEEK-RUNBOOK, MARKETING-LAUNCH-PLAN |
| תפעול | IR runbook, PITR restore, SLA, SUPPORT playbook |
| משפט/פרטיות | הסכם ספקים, ביטולים, data retention |
| קופונים/הונאה | lifecycle FSM, fraud spec |
| מייל | EMAIL-TEMPLATES-SPEC + COPY |
| אבטחה/ביצועים | SECURITY-AUDIT-CHECKLIST, PERFORMANCE-BUDGET |
| צמיחה | SEO strategy, analytics KPI, referral, seasonal |
| ספקים | quality, onboarding, featured pricing, LEGAL-TERMS |
| מובייל/עתיד | Expo WebView, integrations roadmap, geo, WA, subscriptions, wallet spec |
| חזון | V2-VISION |

---

## 4. מה נשאר להשקה (רשימת חסימה)

| # | פריט | בעלות | חומרה |
|---|---|---|---|
| 1 | קישור 10 דילי seed ל-`suppliers` אמיתיים | אדמין / דאטה | **חוסם** |
| 2 | Cardcom production (טרמינל חי, smoke תשלום) | בעלים + סליקה | **חוסם** |
| 3 | DNS cutover / דומיין סופי מול Vercel | בעלים | **חוסם** לפני מותג |
| 4 | Login ל-Vercel + אימות env names מול `.env.example` | בעלים | גבוה |
| 5 | באנר עוגיות / Consent Mode חי | קוד | גבוה למדידה |
| 6 | Soft-open: `CHECKOUT_ENABLED` + רכישת טסט | בעלים | חוסם מסחרי |
| 7 | סגירת ממצאי SEC-QR / SEC-WALLET לפני פרוד מלא | קוד | **חוסם** אבטחה |

פירוט דילים: `LAUNCH-VALIDATION.md`.  
תפעול שבוע: `LAUNCH-WEEK-RUNBOOK.md`.

---

## 5. סיכונים פתוחים

### 5.1 Cardcom production

- טרמינל/סודות בפרוד לא אומתו בדשבורד בסשן docs זה.
- חובה smoke: הזמנה → LP → return → אימות → paid.
- Kill switch: `CHECKOUT_ENABLED=false` עד ירוק.

### 5.2 DNS cutover

- TTL נמוך מראש, SSL, rollback ל-Vercel.
- סיכון: webhook/מיילים לכתובת ישנה.

### 5.3 נוספים

| סיכון | מצב |
|---|---|
| דילי השקה בלי ספק | 10× missing |
| Vercel env drift | audit חסום בלוגין |
| SEC-QR / SEC-WALLET | פתוחים ב-SECURITY ADR |
| רף coverage money | ליישור מול מדיניות 100% |
| מפעיל יחיד | SEV1 לטלפון |

---

## 6. לוח מוצע: שבוע הקרוב

| יום | מיקוד | תוצר |
|---|---|---|
| א׳ | דאטה השקה | ≥ 5/10 דילים מקושרים לספק |
| ב׳ | Cardcom | env + smoke מתועד |
| ג׳ | Vercel/DNS | login, טבלת env, תוכנית cutover |
| ד׳ | Consent + security checklist כסף | באנר; סעיפי SECURITY-AUDIT |
| ה׳ | E2E עד לפני תשלום | ירוק אורח |
| ו׳–ש׳ | באפר | רק חוסמים |

אחרי השבוע: Go / No-Go soft-open לפי שערי `LAUNCH-WEEK-RUNBOOK`.

---

## 7. המלצת הנהלה

**הארכיטקטורה והמסמכים לשבוע השקה מוכנים.**  
**אל תפתחו שיווק ממומן לפני דילים מחוברים, Cardcom smoke, וסגירת ממצאי כסף/QR קריטיים.**  
החסם הוא דאטה + סליקה + DNS + אבטחת כסף, לא חוסר תוכנית.

---

## 7.5 סבב 21-29 (משפטי/תפעול/כסף)

LEGAL-TERMS, REFUNDS, DATA-RETENTION, IR, BACKUP-RESTORE (PITR), EMAIL Resend,
COUPON lifecycle (`redeemed`), FRAUD, VENDOR-PAYOUT (Cardcom ללקוח → CSV לספק).

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | דוח מנהלים ראשון לאוגוסט |
| 2026-08-11 | סיכום סבב 20 מסמכים; מספרים מעודכנים; חסימת SEC |
| 2026-08-11 | סבב 21-29: משפטי, IR, PITR, מיילים, lifecycle, payout |
| 2026-08-11 | סיכום סבב 21–29 (legal→vendor payout) |
