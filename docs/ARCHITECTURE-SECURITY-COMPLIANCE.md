# ארכיטקטורה: Security Compliance

RLS, PCI SAQ-A, audit, GDPR, threat model. לא ייעוץ משפטי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-RBAC.md
docs/ARCHITECTURE-QR-SECURITY.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
```

Threat model מפורט: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| SEC1 | RLS = גבול נתונים; app checks לא מספיקים. |
| SEC2 | טבלאות כסף: אין authenticated write; DEFINER/service role אחרי gate. |
| SEC3 | PAN לא על KE; Cardcom Low Profile; SAQ-A. |
| SEC4 | `platform_percent` לא client-writable; snapshot immutable. |
| SEC5 | redeem: conditional SQL UPDATE `issued→redeemed`; HMAC QR. |
| SEC6 | Secrets שרת בלבד; לא ב-bundle. |
| SEC7 | privileged actions → `audit_log`. |
| SEC8 | No Escrow; coupon prepaid stays platform; physical split snapshot. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Direct Cardcom API with PAN | PCI scope. |
| client write to payments | SEC2. |
| unkeyed QR digest | SEC5: HMAC KEV1. |
| support exports full GMV CSV | RBAC money visibility. |
| RLS bypass "for speed" | SEC1. |

---

## סכמת DB

```text
audit_log (actor, action, entity, before, after)
payment_tokens (profile_id, last4; no PAN selectable)
vouchers (status, hmac payload)
profiles.role (pin updates server-only)
check_user_rate_limit RPC (019)
redeem_voucher DEFINER (074/085)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | webhook forgery | signature verify; 401. |
| CE2 | double redeem race | conditional update; one wins. |
| CE3 | wrong_supplier scan | anti-enumeration not_found. |
| CE4 | stolen admin JWT PostgREST | no money UPDATE policy. |
| CE5 | OAuth redirect open | allowlist origins. |
| CE6 | GDPR export request | DATA-EXPORT path; audited. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | counsel sign-off privacy (Q-SEC-1) | LEGAL. |
| O2 | unkeyed QR path audit | SEC-QR if any legacy. |
| O3 | penetration test schedule | SECURITY-AUDIT. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-28 | security compliance full |
| 2026-08-12 | batch-2: BINDING קצר |
