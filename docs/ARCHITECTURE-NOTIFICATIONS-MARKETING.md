# ארכיטקטורה: התראות שיווק והסכמה

ערוצי שיווק, הפרדה מטרנזקציוני, opt-in (חוק ספאם 30א).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| M1 | הפרדה קשיחה: `is_marketing` על outbox; טרנזקציוני תמיד לפי עדפות ערוץ. |
| M2 | שיווק ברירת מחדל **false** לכל ערוץ. |
| M3 | `consent_events` append-only (מקור, נוסח, IP, זמן). |
| M4 | חריג 30א(ג) "לקוח קיים": **לא מנוצל**; opt-in מפורש בלבד. |
| M5 | Resend: subdomains נפרדים txn / mkt. |
| M6 | Quiet hours שיווק: 09:00-21:00 IL; לא שבת. |
| M7 | Frequency cap: ≤1/יום, ≤3/שבוע שיווקי. |
| M8 | בדיקת הסכמה ב-enqueue **וגם** send-time. |
| M9 | SMS שיווקי: **כבוי** v1. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| marketing opt-out default | M2: false default. |
| עגלה נטושה כטרנזקציוני | M1: שיווקי; opt-in. |
| WhatsApp marketing בלי Meta template | M5: template approval. |
| shared IP txn+marketing | deliverability risk. |
| implicit consent at checkout | M4: explicit opt-in. |

---

## סכמת DB

```text
consent_events (user_id, channel, granted boolean, legal_text_version, ip, created_at)
notification_preferences (marketing_email, marketing_whatsapp, ...)
notification_outbox (is_marketing boolean)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | opt-out אחרי enqueue | send-time `skipped`. |
| CE2 | double opt-in incomplete | no marketing send. |
| CE3 | quiet hours boundary 21:01 | defer to next window. |
| CE4 | frequency cap exceeded | skip; log. |
| CE5 | guest marketing email | no send without account consent. |
| CE6 | complaint spike on mkt domain | isolate; txn unaffected. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | WhatsApp marketing templates | Meta. |
| O2 | A/B subject lines | analytics. |
| O3 | preference center UI copy | LEGAL review. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #28 marketing consent |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
