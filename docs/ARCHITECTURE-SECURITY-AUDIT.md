# ארכיטקטורה: ביקורת אבטחה (Security Audit)

תוכנית **ביקורת אבטחה** מעשית ל-KenyonExpress: מה בודקים, איך, באיזו תדירות, ואיך מתעדים ממצאים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-COMPLIANCE.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-INCIDENT-RESPONSE.md
docs/ARCHITECTURE-ENV-SECRETS.md
```

חלוקת אחריות: COMPLIANCE אומר **מה הכלל**; המסמך הזה אומר **איך מוודאים שהכלל מתקיים בפועל**, עם פקודות ותוצאות צפויות.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| A1 | ביקורת בלי ראיה = לא בוצעה. כל בדיקה מסתיימת בפלט שמור (לוג, צילום, קובץ) עם timestamp. |
| A2 | בודקים כמו תוקף: anon key, session משתמש רגיל, session ספק. אף בדיקה לא רצה רק כ-service role. |
| A3 | ממצא לא נסגר בצ'אט. נרשם ב-`docs/security-findings.md`, מקבל דרגה ו-SLA, נסגר עם commit או שינוי תצורה מזוהה. |
| A4 | בדיקות הרסניות (rate limit, brute force) רצות על preview/staging בלבד, לא על production בכתיבה. |
| A5 | RLS probes לפני כל merge של מיגרציה עם policy. 0 rows צפוי; שורות = CRITICAL. |
| A6 | סריקת client bundle לסודות בכל deploy production. hit = CRITICAL. |
| A7 | CRITICAL פתוח על מסלול כסף = `CHECKOUT_ENABLED=false` עד סגירה. |
| A8 | Full audit (כל הסעיפים) לפני Go-Live, ואז רבעוני; גם אחרי incident SEV1/SEV2. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ביקורת רק כ-service role | מדלג על RLS; false sense of security. |
| Pentest חיצוני חובה ביום 1 | יקר ואיטי; scope פנימי מינימלי מספיק ל-MVP. |
| סגירת ממצא ב-Slack בלבד | אין audit trail; חובה commit/config + רישום. |
| מחיקת סוד מ-git history בלבד | סוד שדלף = rotation חובה, לא rewrite history. |
| בדיקות rate limit על production | סיכון denial; staging/preview בלבד. |
| SOC2 / ISO27001 כיעד ראשון | out of scope; SAQ-A + RLS + audit מספיקים ל-launch. |
| Bug bounty ציבורי לפני launch | surface לא מבוקר; אחרי יציבות. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

הביקורת **קוראת** טבלאות קיימות; לא יוצרת סכימה חדשה.

| טבלה | מה נבדק |
|---|---|
| `orders`, `order_items` | RLS: user B על נתוני A = 0 rows |
| `vouchers`, `voucher_redemptions` | scope ספק; redeem idempotency |
| `wallet_accounts`, `wallet_entries` | anon/authenticated = 0 |
| `payment_tokens` | אין SELECT ל-`cardcom_token` מ-client |
| `carts`, `profiles` | isolation בין sessions |
| `products` | published readable; draft hidden |
| `suppliers`, `supplier_members` | vendor רואה רק את עצמו |
| `payment_webhook_events` | dedup UNIQUE |

רישום ממצאים (קובץ, לא DB):

```
docs/security-findings.md
```

פורמט שורה: ID, תאריך, דרגה, משטח, תיאור, SLA, סגירה (commit hash + מי אימת).

---

## 3. לוח תדירויות

| ביקורת | תדירות | טריגר נוסף |
|---|---|---|
| RLS probes | לפני merge מיגרציה עם policy | שינוי סכימה |
| סריקת bundle לסודות | כל deploy production | שינוי env vars |
| Headers + TLS | חודשי | שינוי middleware / frame policy |
| Dependency audit | שבועי (אוטומטי) | CVE בחבילת כסף |
| הרשאות אדמין וספקים | חודשי | עזיבת עובד / ספק |
| Full audit | לפני Go-Live, רבעוני | אחרי SEV1/SEV2 |

---

## 4. RLS probes (הבדיקה החשובה ביותר)

### 4.1 מתודולוגיה

```
1. anon (בלי session)
2. authenticated: משתמש A (own data)
3. authenticated: משתמש B מנסה נתוני A
4. supplier member: מנסה נתוני ספק אחר
```

### 4.2 מטריצת ציפיות

| טבלה | anon | user B על A | ספק זר |
|---|---|---|---|
| `orders` | 0 | 0 | 0 |
| `order_items` | 0 | 0 | רק שורות הספק שלו |
| `vouchers` | 0 | 0 | רק מיועדים למימוש אצלו |
| `wallet_*` | 0 | 0 | 0 |
| `payment_tokens` | 0 | 0 (גם A בלי cardcom_token) | 0 |
| `products` published | קריאה | קריאה | קריאה |

### 4.3 ביצוע

Supabase > SQL Editor (עם `set role` מתאים) או סקריפט עם anon key:

```sql
select id, total_agorot from orders where user_id = '<A_UUID>';
-- צפי: 0 rows
```

---

## 5. סריקת סודות ו-client bundle

Terminal (אחרי build ייצור):

```bash
grep -RIl "service_role\|SUPABASE_SECRET\|CARDCOM.*PASSWORD\|RESEND_API" .next/static && echo LEAK || echo CLEAN
```

צפי: CLEAN.

Git history:

```bash
git log -p --all -S "SUPABASE_SECRET_KEY=" -- '*.env*' | head
```

סוד שהיה ב-git = rotation חובה.

---

## 6. Headers, TLS ותלויות

```bash
curl -sI https://kenyonexpress.co.il | grep -i "strict-transport\|x-frame\|content-security\|x-content-type"
```

```bash
pnpm audit --prod
```

| דרגת CVE | חבילת כסף | חבילה אחרת |
|---|---|---|
| Critical | לפני deploy הבא | 7 ימים |
| High | 7 ימים | 30 יום |

---

## 7. Pentest לפני Go-Live (scope מינימלי)

מישהו שאינו הכותב יריץ:

1. שינוי מחיר בצד לקוח; צפי: חיוב מהשרת בלבד.
2. Replay webhook תשלום; צפי: voucher אחד.
3. QR מזויף / QR כבר מומש; צפי: דחייה.
4. גישה ל-`/admin` ו-`/supplier` עם משתמש רגיל; צפי: redirect/deny.
5. הזרקת `platform_percent` מהדפדפן; צפי: השרת מתעלם.
6. `token_id` זר ב-checkout; צפי: דחייה לפני חיוב.

---

## 8. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `rls_leak_rows` | user B רואה orders של A | CRITICAL; עצירת merge |
| `bundle_secret_hit` | service_role ב-static | CRITICAL; rotation |
| `header_missing_hsts` | אין Strict-Transport | HIGH; תיקון middleware |
| `cve_critical_payment` | CVE ב-supabase/next | block deploy |
| `pentest_price_tamper` | checkout עם מחיר זר | FAIL אם charged wrong |
| `webhook_replay_pass` | voucher כפול | FAIL; dedup broken |
| `admin_no_2fa` | admin ללא 2FA | MEDIUM; לפני go-live |
| `stale_supplier_member` | member לספק terminated | HIGH; revoke |
| `finding_no_evidence` | "בדקנו RLS" בלי output | לא נספר כבוצע |
| `audit_on_prod_write` | brute force על prod | אסור; staging בלבד |

---

## 9. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | אוטומציה מלאה של RLS probes ב-CI | היום: ידני לפני merge מיגרציה |
| O2 | `docs/security-findings.md` קיים ומאוכלס | ליצור אם חסר |
| O3 | Pentest חיצוני: מתי אחרי launch | רבעוני מומלץ, לא חובה יום 1 |
| O4 | threshold ל-spike של signature_valid=false | קשור OBSERVABILITY |
| O5 | checklist SAQ-A signed | COMPLIANCE |

עודכן: 2026-08-12.

---

## 10. Out of scope

- PCI מלא מעבר למינימיזציה (כרטיס אצל Cardcom)
- Bug bounty ציבורי
- SOC2 / ISO27001

---

## 11. Acceptance

- [ ] RLS probes מתועדים עם 4 contexts
- [ ] bundle scan + git secret scan בכל deploy
- [ ] רישום ממצאים ב-security-findings.md
- [ ] pentest scope 6 תרחישים לפני Go-Live
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 12. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | rev A: תוכנית ביקורת מלאה |
| 2026-08-12 | batch-2: שכתוב לפי תבנית חובה (החלטה, חלופות, DB, קצה, פתוחות) |
