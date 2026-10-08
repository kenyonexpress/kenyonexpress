# Backlog: code work markers

Code work markers (TODO/FIXME/HACK/XXX) older than 7 days that cannot be
resolved in code, each with the reason it is blocked. Scanned 2026-10-07
(M07-c115) with `git grep` over the whole tracked tree, excluding `docs/`,
`refs/` and Markdown, using the same marker rule as `scripts/final-audit-lib.mjs`
(phone placeholders such as `05X-XXX-XXXX` and the string `'TODO'` in a test
are not markers).

## Scan result

Three real markers, all older than 7 days.

Re-scanned 2026-10-07 (M07-c116) with the same rule: only the two Cardcom
markers remain, both already filed as B1 and B2. No new marker since M07-c115,
and `node scripts/final-audit.mjs` reports 0 untracked work markers (of 2).

Re-scanned 2026-10-07 (M07-c117) with the same rule, including the two
uncommitted working-tree files: unchanged. Only `cardcom.ts:254` and
`cardcom.ts:319` match (B1, B2); the other hits are the scanner's own doc
comment and its test fixtures. `node scripts/final-audit.mjs` again reports 0
untracked work markers (of 2).

Re-scanned 2026-10-08 (M07-c118) with the same rule, including the two
uncommitted working-tree files: unchanged. Only `cardcom.ts:254` (blame
2026-07-24) and `cardcom.ts:319` (blame 2026-08-07) match, both filed as B1 and
B2; they still need live Cardcom terminal credentials. `node
scripts/final-audit.mjs` reports 0 untracked work markers (of 2).

Re-scanned 2026-10-08 (M07-c119) with the same rule, including the two
uncommitted working-tree files: unchanged. Only `cardcom.ts:254` (blame
2026-07-24) and `cardcom.ts:319` (blame 2026-08-07) match, both filed as B1 and
B2; they still need live Cardcom terminal credentials. `node
scripts/final-audit.mjs` reports 0 untracked work markers (of 2).

Re-scanned 2026-10-08 (M07-c120) with the same rule, including the two
uncommitted working-tree files: unchanged. Only `cardcom.ts:254` (blame
2026-07-24) and `cardcom.ts:319` (blame 2026-08-07) match, both filed as B1 and
B2; they still need live Cardcom terminal credentials. `node
scripts/final-audit.mjs` reports 0 untracked work markers (of 2).

Re-scanned 2026-10-08 (M07-c121) with the same rule at HEAD `ff5fa1341`,
including the two uncommitted working-tree files: unchanged. Only
`cardcom.ts:254` (blame 2026-07-24) and `cardcom.ts:319` (blame 2026-08-07)
match, both filed as B1 and B2; they still need live Cardcom terminal
credentials. `node scripts/final-audit.mjs` reports 0 untracked work markers
(of 2).

Re-scanned 2026-10-08 (M07-c122) with the same rule at HEAD `0156e5fb7`,
including the two uncommitted working-tree files: unchanged. Only
`cardcom.ts:254` (blame 2026-07-24) and `cardcom.ts:319` (blame 2026-08-07)
match, both filed as B1 and B2; they still need live Cardcom terminal
credentials. `node scripts/final-audit.mjs` reports 0 untracked work markers
(of 2).

| Where | Since | Outcome |
|---|---|---|
| `scripts/screenshot-all.mjs:42` | 2026-07-23 | **Resolved** in M07-c115. The overrides it asked for already exist (env vars and positional args), so the marker became a plain note. |
| `src/lib/payments/cardcom.ts:254` | 2026-07-24 | **Filed below** (B1, GitHub #41). |
| `src/lib/payments/cardcom.ts:319` | 2026-08-07 | **Filed below** (B2, GitHub #42). |

## Open items

### B1. Confirm the Cardcom legacy refund endpoint and field names (#41)

- Code: `refundByTransactionId` in `src/lib/payments/cardcom.ts`.
- What is missing: the legacy refund endpoint and its field names have never
  been checked against a live terminal.
- Why it is not resolved here: it needs production Cardcom keys, which no
  environment this repo can reach holds, and payment provider integration work
  is out of scope for the autonomous queue.
- Owner: Ofir, before go-live.

### B2. Confirm the Cardcom document (invoice) endpoint and field names (#42)

- Code: the document-issuing method in `src/lib/payments/cardcom.ts` (the
  legacy `BillGoldPost` shape).
- What is missing: the same live-terminal check as B1, for the document half.
- Why it is not resolved here: same blocker as B1. A wrong guess fails closed:
  success needs `ResponseCode` 0 and a document number, otherwise the
  `invoices` row stays unissued with the reason on it.
- Owner: Ofir, before go-live.
