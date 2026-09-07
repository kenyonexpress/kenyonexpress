# Cursor pack index

Markdown only, branch
`ke-cursor-docs`,
directory
`docs/cursor/`.
It does not replace root
`docs/ARCHITECTURE-OVERVIEW.md`.
Where this pack and an older brief disagree, **the live tree on this branch is right**.

This pack does not run
`pnpm`,
does not edit
`.ts` /
`.tsx` /
`.sql` /
`.json`,
and does not checkout
`closeout/v1-final`
or
`docs/ui-design-system`.

---

## Suggested reading order

### First hour (new engineer)

1. `ONBOARDING.md` — week-one map, read order, never-touch list
2. `GLOSSARY.md` — Hebrew/English as this repo uses them
3. `ARCHITECTURE-OVERVIEW.md` — system map
4. `MONEY-INVARIANTS.md` — integer agorot and the snapshot rule

### Second hour (money and launch)

5. `DATA-FLOW.md` — buy / scan / refund / referral, table + RLS per step
6. `LAUNCH-BLOCKERS.md` — human-only, ordered, DNS last
7. `RISK-REGISTER.md` — ranked launch failures

### Third hour (who can write)

8. `RLS-CATALOG.md` — every public table, four roles, over-permissive flags
9. `API-SURFACE.md` — route handlers and server actions
10. `SECURITY-REVIEW.md` — attacker vs checkout, till, refund, admin

### Before you change anything

11. `TEST-MAP.md` — what each test protects; gaps G1–G20
12. `ERROR-TAXONOMY.md` — codes, Hebrew, operator action
13. `DECISION-LOG.md` — why the tree looks like this
14. `OPEN-QUESTIONS.md` — contradictions left standing

### When something breaks / after launch

15. `OBSERVABILITY-MAP.md` — 03:00 symptom → grep
16. `DATA-RETENTION.md` — SAR and
    `fn_anonymize_user`
17. `PERFORMANCE-NOTES.md` — ILIKE, indexes, bundle ratchet
18. `DEPENDENCY-AUDIT.md` — npm vs HTTP-only services
19. `POST-LAUNCH-ROADMAP.md` — reviews, wishlist, i18n, … (not blockers)

This file is the index (item 20).

---

## One line each

| File | One line |
|---|---|
| `ARCHITECTURE-OVERVIEW.md` | Next 16 App Router, schema domains, unused-at-runtime Drizzle, R2, Upstash, Meilisearch-without-a-search-product, Cardcom, Vercel `fra1` |
| `DATA-FLOW.md` | Coupon buy, physical buy, scan, refund-to-wallet, refund-to-card, referral: writes and RLS |
| `MONEY-INVARIANTS.md` | Agorot, `money.ts`, per-product `platform_percent` snapshot, no global rate, good/bad patterns |
| `RLS-CATALOG.md` | Public tables, policies, roles, over-permissive flags |
| `API-SURFACE.md` | Every route handler and server action: in, out, auth, failure |
| `TEST-MAP.md` | Every test file, invariant if deleted, money/RLS gaps G1–G20 |
| `RISK-REGISTER.md` | Ranked launch risks: impact, likelihood, mitigation |
| `LAUNCH-BLOCKERS.md` | Only steps a human must perform, in order, exact clicks |
| `POST-LAUNCH-ROADMAP.md` | Reviews, wishlist, abandoned cart, WhatsApp, i18n, supplier onboarding: scope + deps |
| `GLOSSARY.md` | Domain terms in Hebrew and English |
| `ONBOARDING.md` | First week: what to read, what never to touch |
| `DEPENDENCY-AUDIT.md` | Production npm rows, replacements, abandoned (`@dnd-kit`), HTTP-only vendors |
| `ERROR-TAXONOMY.md` | Classes, checkout codes, scan outcomes, SQLSTATE, user vs operator |
| `PERFORMANCE-NOTES.md` | Slow paths, missing FKs, JS ratchet, cheapest fix |
| `SECURITY-REVIEW.md` | Threat model for checkout, redemption, refunds, supplier, admin |
| `OBSERVABILITY-MAP.md` | Logs, Sentry, ntfy, analytics, journals; 03:00 playbook |
| `DATA-RETENTION.md` | What is stored, clocks, deletion request (150 + fallback, 157 IPs) |
| `DECISION-LOG.md` | Architectural choices, rejected alternatives, leftover divergences |
| `OPEN-QUESTIONS.md` | Ambiguities from this pack with best current answers |
| `README.md` | This index |

---

## Companions outside this folder (read after the pack)

Do not start here. Stale dates are common.

| File | Use |
|---|---|
| `docs/adr/` | One-page ADRs 0001–0012 |
| `.env.example` | Every key names its reader |
| `AGENTS.md` | pnpm only; compare.mjs needs no `playwright` package |
| `docs/SOURCING-RULES.md` | Live WP = content; Electro = geometry |
| `docs/REFS-POLICY.md` | `refs/` is a gate output |
| `docs/OWNER-CHECKLIST.md` | Human launch clicks |
| `migrations/pending/` + `APPLY-ORDER.md` | SQL the agent must not apply |

`docs/CONTRADICTIONS.md`
is a 2026-07 reversal diary. The 28.07 coupon model is in force.

`docs/FAILURE-MODES.md`
and
`docs/THIRD-PARTY-DEPENDENCIES.md`
still contain a 2026-09-01 "no deployment" ranking. Prefer this pack +
`https://kenyonexpress.vercel.app`.

---

## How this pack is maintained

- One file per commit, explicit path, never
  `-A`.
- Push after each commit.
- After a pass through 1–20, deepen 1–10 with what 11–20 learned.
- Code fixes belong on the code worktree.

Production project:
`ixvwfbuvfxxsjiywhbbb`.
Apex
`kenyonexpress.co.il`
is WordPress until the owner cuts DNS.
