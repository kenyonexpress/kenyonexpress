# G109 LEGAL-5

Status: DONE (verified 2026-10-30)

Implemented under C18 (`docs/C18-LEGAL.md`); G109 re-verified against the spec, no code changes.

## Pages
`/terms`, `/privacy`, `/returns`, `/accessibility`, `/cookie-policy` (`/cookies` and `/legal/cookies` 308 to it).
Content in `src/app/(legal)/_content`, rendered by `LegalArticle` in the Electro paragraph style.

## Spec checks
- Min age 18: `terms.ts` cites the Legal Capacity and Guardianship Law, s.2.
- Business reg 033798513 and legal name קניון אקספרס: single source `src/lib/legal-entity.ts`.
- Returns per Consumer Protection Law s.14C: `returns.ts`.
- Supplier agreement unlimited-refund clause: `src/lib/legal/supplier-agreement.ts` line 20.
- No social, review or Google review links in the legal pages (grep clean).

## Gates
`vitest run "src/app/(legal)" src/lib/legal src/lib/legal-entity.test.ts`: 6 files, 91 tests passed.
No forbidden files touched. No migration. No visual gate applies (text-only content).
