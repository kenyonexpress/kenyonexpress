# צ'קליסט משפטי

תקציר BINDING לציות IL ecommerce. **לא ייעוץ משפטי.** פירוט:

```
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-LEGAL-PAGES.md
docs/LEGAL-CONTENT.md
```

Status: **BINDING (checklist)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow בכל נוסח.

---

## החלטה

| # | הכרעה |
|---|---|
| LC1 | עמודים חובה: terms, privacy, cancellation, accessibility, contact. |
| LC2 | קופון: prepaid באתר; יתרה בעסק; **אין Escrow/נאמן**. |
| LC3 | `platform_percent` פר מוצר; **אין עמלה קבועה 5%** בנוסח. |
| LC4 | חשבונית על סכום שנגבה באתר בלבד. |
| LC5 | marketing: opt-in + `consent_events`; transactional OK. |
| LC6 | counsel review לפני GA. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| נוסח Escrow 2026-07 | C11א No Escrow |
| "עמלה 10% קבועה" | C1 |
| יתרה בעסק על חשבונית KE | LC4 |
| WhatsApp marketing בלי opt-in | חוק 30א |

---

## סכמת DB

```text
consent_events: marketing opt-in/out
legal_pages / wording_version (if stored)
orders: invoice reference fields
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | refund → credit note |
| CE2 | GDPR delete vs invoice retention |
| CE3 | coupon unredeemed expiry copy |
| CE4 | supplier dispute wording |
| CE5 | accessibility statement update |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | `[דורש עו"ד]` entity details |
| O2 | cross-border processors clause |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING; הסרת Escrow |
