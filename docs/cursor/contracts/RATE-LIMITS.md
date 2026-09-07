# Rate limits

Postgres `check_rate_limit` is **service_role only** after 127. Upstash Redis when `UPSTASH_*` set, else that RPC.

| Surface | Limit (as documented in architecture/code comments) | Key | User sees |
|---|---|---|---|
| Search | per IP/route | IP | empty or 429 `rate_limited` |
| `/api/a` | ingest | IP / session | 429 |
| Voucher scan | 30/min/user | uid | outcome `rate_limited` |
| Staff PIN | 15/hour/staff | staff id | Hebrew too many PIN |
| Review submit | 5/hour/user | uid | יותר מדי ביקורות בשעה האחרונה |
| Login | per IP and per account sliding | IP + email | generic auth error |
| Contact / lead / newsletter | action limits | IP | Hebrew retry |
| Checkout | `RATE_LIMITED` code | uid/IP | יותר מדי ניסיונות |

Headers: `src/lib/rate-limit/headers.ts` (test exists). Do not expose which secret matched (webhook is constant-time, not a rate bucket).

Missing Upstash: Postgres path, not "unlimited".

---

## Open questions

| Q | Best answer |
|---|---|
| Exact search numbers? | Read `src/lib/rate-limit` on code branch; comments above are the pack's measured intent. |

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
