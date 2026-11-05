# S36: Meilisearch optional at boot, `/api/ready` honest about it (06.11.2026)

Queue item S36: make `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` optional in `src/lib/env.ts`, keep the search code guarded, never fail a boot on them, and have `/api/ready` report `search: degraded` with a 200 when Meilisearch is unset, with 503 reserved for a required dependency that is down.

Most of this was already true, and one part was not:

- **Boot.** The two variables were not in the `env.ts` schema at all, so boot could not fail on them before this item either. They are now declared there as optional, with no format check, so that stays true on purpose instead of by omission.
- **Search code.** Every reader already tested for both values and fell back. Nothing needed a new guard. One log field read only the host and now reads both.
- **`/api/ready`.** With Meilisearch unset it already answered 200, but said nothing about search beyond `meilisearch: "not_configured"`. With Meilisearch set and unreachable it answered **503**, which is what production has done since 01.10.2026 (`docs/BACKLOG.md`, item 16) while `/api/search` answered 200. It now reports `search: "degraded"` in both cases and answers 200.

Everything below was measured on 06.11.2026 on `next build` + `next start` (port 3336), against the production database. Production itself was not measured.

## What changed

| file | change |
|---|---|
| `src/lib/env.ts` | `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` added to the schema as `z.string().optional()`. No `.url()`, no minimum length: nothing about them can refuse a boot. New `warnOnPartialSearch`, called once after parsing: one `log.warn` when only one of the pair is set (`env.search_half_configured`) or the host is not an http(s) URL (`env.search_host_malformed`). Both unset is silent. |
| `src/lib/health/ready.ts` | `ReadyReport` gains `search: 'ok' \| 'degraded'`: `ok` only when the Meilisearch check is `ok`. `ok` (and so the status code) no longer counts `meilisearch`; the other four checks count as before. `checks.meilisearch` is unchanged and still says `down` when the engine is down. |
| `src/app/api/ready/route.ts` | Comment only. The handler already maps `ok` to 200/503. |
| `src/app/api/cron/health/route.ts` | The `configured` field of the `search.outbox_backlog` log line tested the host alone; it now tests host and key, like every other reader. |
| `src/lib/health/ready.test.ts` | Four new tests: unset, set-but-down, engine answering, and each of the four required checks down. |
| `src/lib/env.search-optional.test.ts` | New. Seven tests that import `env.ts` under a full production environment: both unset, both empty, both set, host only, key only, malformed host, and a missing `CRON_SECRET` still refusing the boot. |
| `docs/S36-env.md`, `docs/INDEX.md`, `docs/BACKLOG.md`, `README.md`, `STATE.md` | This file, its index row, a note on backlog item 16, the document count, state. |

## The response shape

```json
{"ok":true,"search":"degraded","checks":{"database":"ok","redis":"ok","meilisearch":"not_configured","r2":"ok","cardcom":"ok"}}
```

`search` is new. Nothing was renamed or removed, so a probe that reads `ok`, the status code or `checks.*` reads the same fields as before.

Required for readiness: `database`, `redis` (the rate limiter), `r2`, `cardcom`. In practice only the first two can report `down`; the other two are configuration checks that answer `ok` or `not_configured`.

## Measured

### `/api/ready` on the built server

Each row is a separate `next start`, three requests each, identical every time. The first four rows override the two variables in the process environment; the local `.env.production` holds both, so an unset run has to blank them explicitly.

| Meilisearch | `/api/ready` | `search` | `checks.meilisearch` | `/api/search?q=קפה` | boot line |
|---|---|---|---|---|---|
| both empty | 200 | `degraded` | `not_configured` | 200, 3 results | none |
| host `http://127.0.0.1:9`, a key (unreachable) | 200 | `degraded` | `down` | 200, 3 results | none |
| host only | 200 | `degraded` | `not_configured` | 200, 3 results | `env.search_half_configured`, missing `MEILISEARCH_API_KEY` |
| host `search.invalid` (no scheme), a key | 200 | `degraded` | `down` | 200, 3 results | `env.search_host_malformed` |
| both empty, service key replaced by a wrong one | **503** | `degraded` | `not_configured` | not measured | none |

The last row, in full:

```json
{"ok":false,"search":"degraded","checks":{"database":"down","redis":"down","meilisearch":"not_configured","r2":"ok","cardcom":"ok"}}
```

The server booted and answered in all five. No run logged `invalid environment` or the instrumentation-hook error.

### Guards, by reader

Read, not changed (except the last row). Each one treats a missing host or a missing key as no engine.

| reader | when not configured |
|---|---|
| `src/lib/search-server.ts` | `meiliConfigured()` false, query goes to Postgres. A configured engine that fails returns `null` behind the circuit breaker, same fallback. |
| `src/app/api/search/facets/route.ts` | `meiliConfigured()` false, facets come from the database. |
| `src/lib/search/indexer.ts` | every job is a successful no-op. |
| `src/lib/search/outbox-drain.ts` | drain returns early. |
| `src/lib/search/drift.ts` | `status: 'skipped'`. |
| `src/lib/health/checks.ts` | `not_configured`, no request made. |
| `src/lib/search/meilisearch.ts` | `meiliRequest` throws `meilisearch not configured`. No file in `src` or `scripts` imports this module. |
| `src/app/api/cron/health/route.ts` | log field only; now tests both values. |

### Suites

| check | result |
|---|---|
| `vitest run` | 8296 passed, 13 skipped, 703 files passed and 1 skipped (S35: 8285 passed) |
| `tsc --noEmit` | 0 |
| `pnpm lint` | 0 |
| `next build` | 0 |
| freeze gate, `git diff design-locked-2026-10-19 -- <frozen paths>` | empty |

## Decisions taken alone

- **An unreachable Meilisearch no longer fails readiness.** The item names the unset case; "503 only when a required dep is down" is what covers the unreachable one. Search answers from Postgres in both, so both are `degraded` and 200. The engine's own status is still in `checks.meilisearch`, and the `/api/cron/health` alert still pages on it: `runHealthChecks` and `buildHealthAlert` were not touched.
- **`search` is a new top-level field**, not a new value inside `checks`. `checks.meilisearch` keeps the dependency's status; `search` says what a shopper gets.
- **No `.url()` on the host.** A host pasted without its scheme would otherwise stop the whole shop from booting over a search box. It is logged instead.
- **Two boot warnings were added**, which the item did not ask for.
- **`r2` and `cardcom` stay in the required set.** Neither can report `down` today, so this changes nothing now; it keeps a future probe on either from being silently optional.

## Not measured

- Production. The deployed `/api/ready` still answers from the previous build; whether it turns 200 there is unverified until this branch is deployed.
- A Meilisearch that answers (`search: "ok"`) on a running server. No reachable engine was available; that branch is covered by the unit test only.
- `/api/search` with the database down.
- `compare.mjs` was not run: no page changed.

## Found, not handled

- `src/lib/search/meilisearch.ts` is imported by nothing in `src` or `scripts`.
- The local `.env.production` holds both Meilisearch values, so a plain local `next start` runs as "configured" and, with no engine reachable, reports `meilisearch: "down"`.
- Backlog item 16 is still open: the production engine itself does not answer. This item stops that from failing readiness; it does not bring the engine back.
