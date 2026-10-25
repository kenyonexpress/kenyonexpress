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
