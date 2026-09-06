# Performance budget

Measured 2026-09-06 against a real `pnpm start` build on port 3311, with
nothing else running. Every number below is command output.

## The finding, first

`pnpm lighthouse:smoke` **exits 1** on this machine. The performance score is
70-75 against a threshold of 90.

**The application is not slow.** The same page, same build, same server,
measured without Lighthouse's network simulation, scores **100**. The gap is
entirely the simulation, and the two metrics that do not depend on it are
already near-perfect.

## Both numbers, and the different questions they answer

| | default (`simulate`) | `--throttling-method=provided` |
| --- | --- | --- |
| Performance | **70-75** | **100** |
| First Contentful Paint | 2.8 s | 0.1 s |
| Largest Contentful Paint | 5.8 s | 0.2 s |
| Speed Index | 5.3 s | 0.1 s |
| Total Blocking Time | 110 ms | 0 ms |
| Cumulative Layout Shift | 0 | 0.001 |
| Server response | 355 ms | 50 ms |

Accessibility **100** and SEO **100** under both.

The default is Lantern: Lighthouse loads the page unthrottled, then *models*
what a mid-tier phone would have seen — `cpuSlowdownMultiplier: 4`,
`rttMs: 150`, ~1.6 Mbps, `formFactor: mobile`. That model is the industry
proxy for field performance and it is not wrong to care about it. But it is a
model, and on localhost it is being asked to extrapolate from a machine that is
also building, serving and running the test.

`provided` reports what actually happened. It is the honest answer to "does
this build do anything stupid", and the answer is no.

## Why the simulated number must not be optimised against here

Recorded already, and this is the second time it has cost someone a session: a
**2.7 s real improvement showed up as noise** in this metric. Lantern computes
LCP over a dependency graph covering the whole page, so a change that plainly
helps a visitor can move the reported number by less than the run-to-run
variance. Three consecutive runs of the smoke script today returned 75, 70 and
70 with no change to the tree between them.

So a red here is not evidence of a regression, and a green would not be
evidence of a fix.

## What is actually in the page

| | |
| --- | --- |
| Total transfer | 703 KiB |
| JavaScript | 311 KiB across 21 requests |
| Unused JavaScript | 60 KiB, all in one 130 KiB framework chunk |
| Render-blocking resources | **none** |

60 KiB unused inside a single framework chunk is ordinary and is not worth
chasing; there is no route-level split that would remove it without moving the
cost somewhere else. There is no oversized image, no blocking stylesheet and no
long task worth naming — TBT is 110 ms simulated and 0 ms real.

The hero is the reason there is nothing here. It used to serve a 777 KB
animated WebP, which was the whole distance between this page and a 90+ mobile
score; `b51a69b7e` removed it along with the rest of the vendor photography,
and `BrandPlaceholder` costs nothing.

## Status: OPEN, and it cannot be closed here

**The budget needs a deployment, not more local measurement.** Every number in
the left column is a simulation running on a laptop; every number in the right
column is a localhost round trip with no network, no CDN, no cold start and no
real device. Neither is the field.

`docs/BRANCH-AUDIT.md` and STATE.md record that this build has never deployed —
the only Vercel project points at the old repository and all of its deployments
are ERROR. Until that is fixed there is no URL to measure, and a performance
budget asserted against localhost would be a number nobody should trust.

**When there is a deployment, run this and record it here:**

```bash
LOCAL_BASE=https://<the-deployment> node scripts/lighthouse-smoke.mjs
```

That is the first row of this table that will mean anything. Do not raise or
lower the 90 in `scripts/lighthouse-smoke.mjs` to make the local run pass: the
threshold is not what is wrong.
