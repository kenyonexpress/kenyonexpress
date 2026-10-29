# C18 LEGAL-PAGES-FINAL

Status: DONE (verified 2026-10-29)

## Pages
Single content set in `src/app/(legal)/_content` (terms, privacy, returns, accessibility, cookies), rendered by `LegalArticle`.

| Path | Notes |
|---|---|
| /terms | Min age 18 (Legal Capacity and Guardianship Law, s.2), Israeli law, Tel Aviv jurisdiction |
| /privacy | Processor disclosure, GDPR-equivalent rights |
| /returns | Consumer Protection Law s.14C |
| /accessibility | IS 5568 |
| /cookie-policy | Canonical cookies page; `/cookies` and `/legal/cookies` 308 here |

Legacy WordPress URLs 308 to the canonical paths (`next.config.ts`).

## Identity
`src/lib/legal-entity.ts`: legal name קניון אקספרס, business reg 033798513 (checksum-tested). One source for legal pages, footer, invoices, emails.

## Supplier agreement v2
`src/lib/legal/supplier-agreement.ts`, version `2026-10-21`, click-wrap hashed. Includes the unlimited-refund clause: the company may refund any customer in full, at any time, on any deal, without supplier approval or stated reason; amounts already paid to the supplier are offset against the next payout.

## Verification
`vitest run src/app/(legal) src/lib/legal src/lib/legal-entity.test.ts`: 6 files, 91 tests passed.
