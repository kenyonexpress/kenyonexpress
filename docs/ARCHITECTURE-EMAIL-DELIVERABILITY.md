# ארכיטקטורה: Email Deliverability (Resend)

הגדרת דומיין Resend ל-`kenyonexpress.co.il`: SPF, DKIM, DMARC, warm-up, bounce, נושאי מייל בעברית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: No Escrow (מיילים טרנזקציוניים: `*_agorot` integers בלבד).

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/LAUNCH-DAY.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/LEGAL-CHECKLIST.md
```

From יעד:

```
KenyonExpress <noreply@kenyonexpress.co.il>
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| E1 | כל המייל **טרנזקציוני** יוצא דרך **Resend** בלבד. |
| E2 | דומיין השולח מאומת ב-Resend לפני soft-open. |
| E3 | SPF + DKIM חובה; DMARC לפחות `p=none` בשיגור, החמרה אחרי יציבות. |
| E4 | לא לשבור MX של מייל עסקי ב-cutover DNS. |
| E5 | Bounce/complaint → suppression; לא enqueue חוזר לאותה כתובת. |
| E6 | Warm-up: לא blast שיווקי ביום 0; transactional בלבד. |
| E7 | Subjects בעברית, קצרים, בלי spam triggers; RTL בגוף. |
| E8 | `dedupe_key` UNIQUE ב-outbox = Idempotency-Key ל-Resend. |
| E9 | Payload כסף: `total_agorot`, `balance_agorot` integers; אסור float / Escrow copy. |
| E10 | Webhook Resend → `notification_delivery_events` → `email_suppressions`. |

### 1.1 Resend domain setup

1. Add domain: `kenyonexpress.co.il`  
2. DNS records מ-Resend Dashboard (DKIM, SPF include, verification TXT)  
3. אחרי propagation: Domain status = **Verified**  
4. Default From תואם דומיין מאומת  

### 1.2 DNS records (תבנית)

| Type | Name | Value (typical) | Purpose |
|---|---|---|---|
| TXT | `@` | `v=spf1 include:… ~all` | SPF (merge, לא replace) |
| CNAME/TXT | `resend._domainkey` | Resend value | DKIM |
| TXT | `_dmarc` | ראה §1.4 | DMARC |
| TXT | verification | Resend token | Ownership |

SPF יעד אחרי מיזוג (התאם ל-includes אמיתיים):

```text
v=spf1 include:_spf.google.com include:amazonses.com include:resend.com ~all
```

כללים: רשומת SPF **אחת** ל-apex; `~all` בהתחלה; לא יותר מ-10 DNS lookups.

### 1.3 DKIM

- כל הסלקטורים ש-Resend דורש  
- Resend UI: DKIM = Pass לפני go-live  
- סיבוב מפתח: לפי Resend; לתעד ב-ops  

### 1.4 DMARC

יום שיגור:

```text
v=DMARC1; p=none; rua=mailto:dmarc@kenyonexpress.co.il; fo=1; aspf=r; adkim=r
```

אחרי 2–4 שבועות יציבים:

```text
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@kenyonexpress.co.il; ruf=mailto:dmarc@kenyonexpress.co.il; fo=1
```

`p=reject` רק אחרי ייעוץ + כיסוי כל השולחים הלגיטימיים.

### 1.5 Warm-up plan

| יום | נפח | סוג |
|---|---|---|
| 0–3 | נמוך | transactional (הזמנה, קופון, סריקה, החזר) |
| 4–14 | לפי הזמנות אמיתיות | בלי קמפיין שיווקי |
| 15+ | שיווק רק opt-in | stream נפרד אם אפשר |

כללים: לא רשימות קרות; From קבוע לטרנזקציה; Reply-To תמיכה; מעקב delivery/bounce/complaint יומי בשבוע 1.

### 1.6 Bounce handling

```text
Resend webhook (bounced / complained)
  → notification_delivery_events (dedup external_event_id)
  → email_suppressions upsert
  → fn_enqueue_notification skips suppressed
```

| סוג | פעולה |
|---|---|
| Hard bounce | suppression קבוע עד תיקון ידני |
| Soft bounce | retry outbox; אחרי N → suppression זמני |
| Complaint | suppression מיידי + לא שיווק |
| Missing `RESEND_API_KEY` | לא לשרוף attempts על כל התור |

### 1.7 Hebrew subject best practices

| כלל | דוגמה טובה | להימנע |
|---|---|---|
| קצר (≈ 1–40 תווים) | `הקופון שלך מוכן` | פסקאות בנושא |
| הקשר ברור | `הזמנה התקבלה · A1B2C3D4` | `!!! דחוף !!!` |
| בלי ALL CAPS | | `הזדמנות!!!` |
| בלי מילות spam | | חינם מוחלט |
| מספר הזמנה LTR בנושא | `· A1B2C3D4` | |
| התאמה לגוף | נושא = תוכן | clickbait |
| UTF-8 | דרך Resend | mojibake |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| SendGrid / SES במקביל ל-Resend | שני ספקים = SPF/DMARC מורכב + dedupe כפול; Resend מספיק לטרנזקציוני. |
| שליחה sync בתוך webhook תשלום | כשל Resend לא יפיל paid; outbox + drain (NOTIFICATIONS). |
| DMARC `p=reject` ביום 0 | spoof לגיטימי (Google Workspace) יחסם מיילים; `p=none` → quarantine. |
| Subdomain `mail.` בלי DKIM על apex | חלק מהמקבלים בודקים alignment; apex מאומת חובה. |
| Marketing מ-`noreply@` | complaint rate גבוה; שיווק מ-stream/From נפרד עם opt-in. |
| Retry אינסופי על hard bounce | פוגע reputation; suppression מיידי. |

---

## 3. סכמת DB

**אין DDL חדש ב-batch זה.** שימוש בטבלאות קיימות:

### `notification_outbox` (095)

| עמודה | שימוש deliverability |
|---|---|
| `recipient_email` | lower-case לפני enqueue |
| `dedupe_key` | UNIQUE; Idempotency-Key Resend |
| `status` | pending / sent / failed / dead |
| `attempts`, `last_error`, `next_attempt_at` | retry backoff |

`fn_enqueue_notification`: בודק `email_suppressions` לפני INSERT (אם הטבלה קיימת).

### `notification_delivery_events` (031)

| עמודה | שימוש |
|---|---|
| `provider` | `resend` |
| `external_event_id` | dedup webhook |
| `event_type` | delivered / bounced / complained |
| `outbox_id` | קישור לשורת outbox |
| `payload` | jsonb גולמי |

UNIQUE `(provider, external_event_id)`.

### `email_suppressions`

| עמודה (typical) | שימוש |
|---|---|
| `email` | lower-case UNIQUE |
| `reason` | hard_bounce / complaint / manual |
| `created_at` | audit |

נוצר/מתעדכן מ-webhook; נבדק ב-`fn_enqueue_notification` וב-`voucher-email` path.

RLS: admin SELECT; webhook handler = service role.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | DNS propagation איטי | לא soft-open עד Verified + test inbox |
| E2 | SPF merge שובר Google Workspace | merge `include:`; לא replace record |
| E3 | Webhook duplicate | `external_event_id` dedup; idempotent suppression |
| E4 | Soft bounce × N | backoff; אחרי threshold → suppression |
| E5 | enqueue לכתובת suppressed | skip INSERT / no-op; log |
| E6 | Resend 429 rate limit | `next_attempt_at` backoff; לא DLQ מיד |
| E7 | `RESEND_API_KEY` חסר ב-preview | skip send; לא mock "sent" |
| E8 | מייל עברית + מספר LTR | `dir="ltr"` על order id בגוף |
| E9 | complaint אחרי שליחה מוצלחת | suppression + לא marketing עתידי |
| E10 | cutover MX בטעות | rollback DNS; MX עסקי לא נוגעים ל-Resend |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | מיגרציה standalone ל-`email_suppressions` | 095 conditional; DDL formal ב-backlog | 2026-08-12 |
| O2 | `include:resend.com` vs ערך Resend 2026 | copy מ-Dashboard בזמן setup | 2026-08-12 |
| O3 | Marketing stream נפרד ב-Resend | Phase 2; transactional קודם | 2026-08-12 |
| O4 | DMARC aggregate reports parsing | ידני בשבועות 1–4 | 2026-08-12 |

---

## 6. Launch checklist

- [ ] Domain Verified ב-Resend  
- [ ] SPF/DKIM ירוקים  
- [ ] DMARC `p=none` לפחות  
- [ ] MX עסקי לא נשבר  
- [ ] מייל טסט Gmail + Outlook IL → Inbox  
- [ ] Webhook bounce מחובר  
- [ ] `RESEND_API_KEY` + `RESEND_FROM` רק Vercel Production  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
