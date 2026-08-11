# WhatsApp Business (הקמה)

תקציר BINDING. פירוט התראות:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-NOTIFICATIONS-V2.md
docs/WHATSAPP-COMMERCE-SPEC.md
```

Status: **BINDING (setup)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
MVP: **Resend first**; WhatsApp utility P2.

---

## החלטה

| # | הכרעה |
|---|---|
| WA1 | MVP email (Resend); WhatsApp after opt-in + templates approved. |
| WA2 | BSP ישראלי על Cloud API (חשבונית ₪, תמיכה עברית). |
| WA3 | `wa.me` link via `NEXT_PUBLIC_WHATSAPP_PHONE` OK without full API. |
| WA4 | Templates: UTILITY; no Escrow/נאמן in copy. |
| WA5 | Marketing WhatsApp: opt-in only (30א). |
| WA6 | Webhook for delivery status; queue `channel=whatsapp`. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| WhatsApp before email stable | WA1 |
| marketing templates day-1 | consent |
| Meta direct without BSP | ops burden MVP |
| Escrow wording in templates | No Escrow |

---

## סכמת DB

```text
notification_queue: channel, template_id, payload
consent_events: whatsapp_marketing
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | template rejected | fallback email |
| CE2 | user no opt-in | session 24h only |
| CE3 | wrong phone E164 | validate |
| CE4 | BSP outage | retry + email |
| CE5 | PII in template vars | minimize |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | BSP vendor selection |
| O2 | order_paid template prod approval |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
