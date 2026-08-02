# ARCHITECTURE: Email Deliverability (Resend)

הגדרת דומיין Resend ל-`kenyonexpress.co.il`: SPF, DKIM, DMARC, warm-up, bounce, נושאי מייל בעברית.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/LAUNCH-DAY.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/LEGAL-CHECKLIST.md
```

From יעד:

```
KenyonExpress <noreply@kenyonexpress.co.il>
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| E1 | כל המייל הטרנזקציוני יוצא דרך **Resend** בלבד. |
| E2 | דומיין השולח מאומת ב-Resend לפני soft-open. |
| E3 | SPF + DKIM חובה; DMARC לפחות `p=none` בשיגור, החמרה אחרי יציבות. |
| E4 | לא לשבור MX של מייל עסקי ב-cutover DNS. |
| E5 | Bounce/complaint → suppression; לא לנסות שוב לאותה כתובת. |
| E6 | Warm-up: לא לשלוח blast שיווקי ביום השיגור; רק transactional. |
| E7 | Subjects בעברית, קצרים, בלי spam triggers; RTL בגוף. |

---

## 1. Resend domain setup

### 1.1 ב-Resend Dashboard

1. Add domain: `kenyonexpress.co.il`
2. להעתיק רשומות DNS ש-Resend מציג (DKIM, לעיתים SPF include / verification TXT)
3. אחרי propagation: Domain status = **Verified**
4. לקבוע Default From תואם דומיין מאומת

### 1.2 DNS records (תבנית; הערכים המדויקים מ-Resend)

| Type | Name (טיפוסי) | Value (טיפוסי) | Purpose |
|---|---|---|---|
| TXT | `@` או כפי ש-Resend מורה | `v=spf1 include:… ~all` | SPF |
| CNAME / TXT | סלקטור DKIM (למשל `resend._domainkey`) | ערך Resend | DKIM |
| TXT | `_dmarc` | ראה §3 | DMARC |
| TXT | אימות דומיין Resend אם נדרש | token | Ownership |

לעולם לא למחוק SPF קיים של Google/Microsoft בלי מיזוג `include:`.

---

## 2. SPF

יעד אחרי מיזוג:

```text
v=spf1 include:_spf.google.com include:amazonses.com include:resend.com ~all
```

(התאם ל-includes האמיתיים של הספקים שבשימוש; Resend יציג את ה-include המדויק.)

כללים:

- רשומת SPF **אחת** ל-apex
- `~all` בהתחלה; `-all` רק אחרי מדידה
- לא לשרשר יותר מדי lookups (מגבלת 10)

---

## 3. DKIM

- להפעיל את כל הסלקטורים ש-Resend דורש
- לוודא ב-Resend UI: DKIM = Pass
- סיבוב מפתח: לפי Resend; לתעד ב-ops אם מחליפים סלקטור

---

## 4. DMARC

יום שיגור (שמרני):

```text
v=DMARC1; p=none; rua=mailto:dmarc@kenyonexpress.co.il; fo=1; aspf=r; adkim=r
```

אחרי 2–4 שבועות יציבים (אין spoof לגיטימי נכשל):

```text
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@kenyonexpress.co.il; ruf=mailto:dmarc@kenyonexpress.co.il; fo=1
```

`p=reject` רק אחרי ייעוץ + כיסוי כל השולחים הלגיטימיים.

---

## 5. Warm-up plan

| יום | נפח | סוג |
|---|---|---|
| 0–3 | נמוך | transactional בלבד (הזמנה, קופון, סריקה, החזר) |
| 4–14 | לפי הזמנות אמיתיות | בלי קמפיין שיווקי |
| 15+ | שיווק רק עם opt-in + הסרה | נפרד מ-transactional stream אם אפשר |

כללים:

- לא לייבא רשימות קרות
- כתובת From קבועה לטרנזקציה
- Reply-To תמיכה אם צריך תשובות אנושיות
- מעקב Resend: delivery / bounce / complaint יומי בשבוע הראשון

---

## 6. Bounce handling

```text
Resend webhook (bounced / complained)
  → notification_delivery_events
  → email_suppressions upsert
  → enqueue future skipped
```

| סוג | פעולה |
|---|---|
| Hard bounce | suppression קבוע עד תיקון ידני |
| Soft bounce | retry לפי outbox; אחרי N → suppression זמני |
| Complaint | suppression מיידי + לא שיווק |
| Missing API key | לא לשרוף attempts על כל התור |

Outbox: ראה `ARCHITECTURE-NOTIFICATIONS.md`.

---

## 7. Hebrew subject line best practices

| כלל | דוגמה טובה | להימנע |
|---|---|---|
| קצר (≈ 1–40 תווים נראים) | `הקופון שלך מוכן` | פסקאות בנושא |
| מותג או הקשר ברור | `הזמנה התקבלה · A1B2C3D4` | `!!! דחוף !!!` |
| בלי ALL CAPS / סימני קריאה מרובים | | `הזדמנות!!!` |
| בלי מילות spam | | חינם מוחלט / להרוויח כסף |
| מספר הזמנה ב-`dir` לוגי בגוף; בנושא מותר LTR קצר | `· A1B2C3D4` | |
| התאמה לגוף | נושא = תוכן אמיתי | clickbait |
| קידוד | UTF-8 דרך Resend | mojibake |

Subjects קנוניים: במסמך Notifications.

---

## 8. Launch checklist

- [ ] Domain Verified ב-Resend
- [ ] SPF/DKIM ירוקים
- [ ] DMARC `p=none` לפחות
- [ ] MX של מייל עסקי לא נשבר
- [ ] מייל טסט ל-Gmail + Outlook IL מגיע ל-Inbox (לא Spam)
- [ ] Webhook bounce מחובר
- [ ] `RESEND_API_KEY` + `RESEND_FROM` רק ב-Vercel Production

---

## 9. Acceptance

- [ ] Authenticated domain לפני soft-open
- [ ] Suppression על bounce/complaint
- [ ] Warm-up בלי marketing blast ביום 0
- [ ] Subjects עברית לפי הטבלה

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
