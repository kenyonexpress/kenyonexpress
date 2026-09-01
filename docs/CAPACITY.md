# Capacity

Measured 2026-09-01 with the k6 scenarios already in `load/`. Every number here
is k6 output or `curl` output. Where a number does not mean what it looks like,
that is said next to it rather than in a footnote.

## The trap this document exists to name

**A load test run on the same machine as the server measures the machine.**

The first run was 100 VUs against `pnpm start` on the same laptop that was
running k6. It aborted at 8% of the plan:

```
http_req_duration{name:home}  p(95)=3.14s     abort threshold 2000ms
thresholds on metrics 'http_req_duration{name:home}' were crossed;
at least one has abortOnFail enabled, stopping test prematurely
```

3.14 seconds looks like a homepage bottleneck. It is not. The same page, same
build, same server, one user at a time:

```
ttfb=0.177s total=0.615s     (first, cold)
ttfb=0.005s total=0.093s
ttfb=0.003s total=0.075s
ttfb=0.004s total=0.102s
ttfb=0.003s total=0.065s
```

**65 milliseconds.** The 3.14s is contention between the server process, 100
virtual users and the k6 runtime competing for the same cores. It is a fact
about the laptop and it would be a lie in a capacity report.

## What was actually measured

`load/browse.js`, ramp 10s, hold 20s, against `pnpm start` on port 3311.

| VUs | home p95 | product p95 | errors | checks | verdict |
| --- | --- | --- | --- | --- | --- |
| 25 | **73ms** / 133ms | **117ms** | 0.00% | 745/745 | all thresholds pass |
| 100 | 3.14s | 148ms | 0.00% | 50/50 | **aborted at 8%**, home threshold |

Two `home`-tagged requests are measured separately, hence two figures. The
thresholds come from `load/lib/thresholds.js`, which encodes
`docs/ARCHITECTURE-TESTING.md` section 5.3: home target 1000ms / abort 2000ms,
product 800/1500, begin_checkout 1500/3000, redeem 500/1000.

**The knee is between 25 and 100 VUs on this hardware.** That bound is the only
honest capacity statement available from a laptop, and it is a bound on the
laptop, not on production.

## Production, for comparison

Not a load test. Six sequential requests, no concurrency:

```
ttfb=3.170s total=5.245s code=200     <- cold start
ttfb=0.525s total=2.090s code=200
ttfb=0.502s total=2.255s code=200
ttfb=0.495s total=2.129s code=200
ttfb=0.227s total=1.748s code=200
```

The first sample is a cold serverless start and the rest settle around 500ms
TTFB. Production is slower per request than local and that is expected: local
has no network, no cold start and a warm page cache.

## Where a trustworthy number comes from

`.github/workflows/load.yml`, run by hand against a preview deployment. That is
the only configuration in this project where the load generator and the server
are not the same computer. Until it has been run, **this project has no measured
capacity figure**, and no number in this file should be quoted as one.

The workflow is deliberately `workflow_dispatch` only. A load test that runs on
every push is a bill, and one pointed at the wrong host is an outage.

## The guard that makes this safe

`load/lib/guard.js` exports `assertNotProduction()` and every scenario calls it.
`LOAD_BASE` must be an absolute http(s) URL and must not be the production host.
A capacity run against the live site would be indistinguishable from an attack
on it, and the redemption scenario writes rows.

## Scenarios in `load/`

| File | What it exercises |
| --- | --- |
| `browse.js` | homepage, category, products, product detail |
| `search.js` | the search backend, not the UI |
| `checkout.js` | the full begin-checkout path |
| `redeem.js` | concurrent voucher redemption, the race the DB lock has to win |
| `pool.js` | connection pool behaviour under sustained load |

`redeem.js` and `pool.js` gate on `MUST_BE_ZERO` counters rather than latency.
Section 5.3 is explicit that a run finishing with one double redemption is a
failed run even when every p95 is green, so those abort on the first occurrence.

## Not yet measured

- 500 and 2000 VUs. Both need the workflow above; neither is meaningful here.
- `checkout.js` and `redeem.js` under load. They need seeded fixtures and a
  terminal in mock mode, and `redeem.js` writes rows, so it needs a target that
  is safe to dirty.
- The breaking point. Unknown, and this document will not guess at one.
