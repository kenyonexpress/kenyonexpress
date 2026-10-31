# Backlog

Open TODO/FIXME items filed from code scans. Each entry names the source location so the marker can be removed when the item is resolved.

## Scan M07-c192 (2026-10-25)

Scanned all tracked files for `TODO` / `FIXME`. Markers older than 7 days (all blamed to 2026-09-17):

| # | Location | Item | Status |
|---|----------|------|--------|
| 1 | `src/lib/payments/cardcom.ts:254` | `TODO(cardcom)`: confirm the legacy refund endpoint and field names against the live terminal | Filed. Needs Cardcom production credentials, so it cannot be verified from here. Also tracked in `docs/KNOWN-ISSUES.md` #2. |
| 2 | `src/lib/payments/cardcom.ts:317` | `TODO(cardcom)`: confirm the document endpoint and field names against the live terminal | Filed. Same blocker as #1. |
| 3 | `scripts/screenshot-all.mjs:42` | `TODO`: set real product/category slugs per environment | Filed. Low priority. Defaults are placeholders, and all four paths can be overridden by env vars or argv. |

Not a TODO: `src/lib/whatsapp.test.ts:91` uses the literal string `'TODO'` as a fixture for an invalid phone value.

## Scan M07-c208 (2026-10-26)

Re-scanned `src` and `scripts` for `TODO` / `FIXME`. The same three markers remain, all blamed to 2026-09-17 (older than 7 days) and unchanged since the M07-c192 scan. Nothing could be resolved in code: #1 and #2 need Cardcom production credentials, and #3 needs per-environment slugs. All three stay filed in the table above. No new markers found. No locked files touched.

## Scan M07-c284 (2026-10-30)

Re-scanned the repo for `TODO` / `FIXME`. Same three markers as M07-c192 and M07-c208, all blamed to 2026-09-17 (older than 7 days) and at the same lines: `cardcom.ts:254`, `cardcom.ts:317`, `screenshot-all.mjs:42`. Nothing resolvable in code (#1 and #2 need Cardcom production credentials, #3 needs per-environment slugs), so all stay filed above. No new markers. No locked files touched.

## Scan M07-c297 (2026-10-31)

Re-scanned `src` and `scripts` for `TODO` / `FIXME`. Same three markers as M07-c192, M07-c208 and M07-c284, all blamed to 2026-09-17 (older than 7 days) and at the same lines: `cardcom.ts:254`, `cardcom.ts:317`, `screenshot-all.mjs:42`. Nothing resolvable in code (#1 and #2 need Cardcom production credentials, #3 needs per-environment slugs), so all stay filed above. No new markers. No locked files touched.

## Scan M07-c325 (2026-11-01)

Re-scanned tracked files for `TODO` / `FIXME`. Same three markers as M07-c192, M07-c208, M07-c284 and M07-c297, all blamed to 2026-09-17 (older than 7 days) and at the same lines: `cardcom.ts:254`, `cardcom.ts:317`, `screenshot-all.mjs:42`. Nothing resolvable in code (#1 and #2 need Cardcom production credentials, #3 needs per-environment slugs), so all stay filed above. No new markers. No locked files touched.
