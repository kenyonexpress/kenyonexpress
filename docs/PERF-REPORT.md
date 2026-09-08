# Performance report

Measured 2026-09-08 against a production build (`pnpm build` + `pnpm start`)
on `localhost:3390`, commit `e8603d9e0`.

Read the caveat section before quoting any number here.

---

## 1. The four budgets

| Budget | Target | Measured | Verdict |
| --- | --- | --- | --- |
| Shared first-load JS | < 180 KB gz | **255.8 KB gz** | ❌ over by 42% |
| LCP | < 2.0 s | 1.2 s home, 0.9 s product, 1.2 s checkout | ✅ (see caveat) |
| CLS | < 0.05 | 0.011 home, 0.012 product, **0.357 checkout** | ❌ on checkout |
| TTFB | < 200 ms | 10 ms | ✅ (see caveat) |

Two pass, two do not, and the two that fail fail for unrelated reasons.

---

## 2. Lighthouse, the three routes the step names

Desktop preset, headless Chrome, production build.

| Route | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 97 | 96 | 96 | 100 | 1.2 s | 0.011 | 0 ms |
| `/product/<slug>` | 99 | 100 | 96 | 100 | 0.9 s | 0.012 | 0 ms |
| `/checkout` | **80** | 100 | 96 | 69 | 1.2 s | **0.357** | 0 ms |

The SEO 69 on `/checkout` is not a defect. That page is disallowed in
`robots.txt` and carries no canonical by design; Lighthouse scores it as a
document it was never meant to score.

---

## 3. The bundle: 255.8 KB against a 180 KB target

Nine shared chunks:

```
    4.6 KB  static/chunks/04cftuypms-ym.js
   17.5 KB  static/chunks/325gupte89gew.js
    9.2 KB  static/chunks/06nvizxfh2jge.js
   28.0 KB  static/chunks/1-vuxjyw-1dw7.js
  130.1 KB  static/chunks/28u3rfooq48dn.js     <- half the budget in one chunk
   14.8 KB  static/chunks/36vf13lm6qy9h.js
    8.7 KB  static/chunks/22g-9uh_dj6hz.js
    4.2 KB  static/chunks/turbopack-1nx7bn1zaw2_h.js
   38.5 KB  static/chunks/0cz1d0mv5g_q7.js
```

The 130 KB chunk is 424 KB raw and carries 232 Sentry markers, so the browser
SDK dominates it.

**THE OBVIOUS LEVER IS ALREADY PULLED, and this is worth writing down so the
next person does not spend an afternoon on it.** Session replay is the usual
reason a Sentry browser bundle is large, and the natural assumption is that
`replaysSessionSampleRate: 0` disables it at runtime while still shipping the
code. Checked in the built chunk:

```
replayIntegration    0
rrweb                0
session-replay       0
maskAllText          0
blockAllMedia        0
```

Replay is not in the bundle. Neither is `browserTracingIntegration`. What is
left is Sentry core, and getting from 255.8 to 180 needs a real investigation
rather than a flag.

### Addendum, 2026-09-08: the Sentry bundle is currently pure cost

Measured against the deployed site rather than a local build — the 18 client
chunks `kenyonexpress.vercel.app` actually links from its homepage, 1,079,737
bytes downloaded and grepped:

```
sentry              305 markers
captureException      9
ingest.sentry.io      0     <- no DSN was baked in at build time
posthog               0
phc_                  0
```

So production **ships the whole Sentry browser SDK and gives it nowhere to
report.** This is the same measurement from the other side of the wire as the
Sentry finding in STATE.md: the project's issue stream holds 49 events over 90
days and every one is from `MacBook-Air.local`.

That reframes section 3 rather than contradicting it. The 130 KB chunk is
Sentry-dominated and the SDK is not removable by a flag — both still true. What
is new is that today the bundle pays for it and buys nothing. The fix is not to
strip the SDK, which would be the wrong lever the moment reporting is switched
on; it is to set the DSN, which `scripts/deploy-preflight.mjs` now refuses to
deploy without.

PostHog is absent from the bundle entirely, so there is no browser analytics
payload to weigh either way.

`scripts/bundle-gate.mjs` currently ratchets at 260 KB against a 255.6 KB
baseline taken 2026-09-02. Today's build is 255.8 KB - a 0.2 KB rise from the
CSS added for the 44px hit areas. The ratchet is doing its job; the gap to the
spec target is a known, tracked shortfall and not a regression.

---

## 4. The one real defect: CLS 0.357 on checkout

Home and product sit at 0.011 and 0.012. Checkout is **0.357**, seven times
the budget, and it is the worst page in the product to have layout shift on: a
form that jumps while somebody is entering payment details causes mis-taps on
the controls that move money.

Lighthouse reports three shifts, and the first one is almost all of it:

```
0.3452  Media element lacking an explicit size
0.0112  Media element lacking an explicit size
0.0006  Media element lacking an explicit size + three web fonts loading
```

**WHAT IS NOT YET ESTABLISHED.** All three `<img>` elements on the page carry
explicit `width` and `height` attributes, checked in the served HTML, so the
cause is not a missing attribute. The likely mechanism is the shared header
logo, which pairs those attributes with `class="h-handheld-logo-h w-auto"` -
a CSS height plus an automatic width, which changes the box once CSS applies.
The token values make that plausible: `--spacing-handheld-logo-h` is 26px and
`--spacing-logo-h` is 79px against an intrinsic 300x79.

That mechanism is **not proven**, and it does not obviously explain why the
same header costs 0.011 on the homepage and 0.345 here. The honest reading is
that checkout's viewport is almost entirely form, so any header height change
moves a much larger fraction of the page - CLS is impact fraction times
distance fraction, and impact is what differs.

It was left unfixed deliberately. The header is shared by every route and is
measured by the pixel-parity gate, so changing it is a change to every page's
geometry, and it should be done as a focused pass that re-measures both CLS
and `compare.mjs` rather than as a footnote to a performance report.

---

## 5. Caveats, so these numbers are not quoted as production truth

- **LCP and TTFB are localhost figures.** Lighthouse's LCP under Lantern is a
  simulation over a request graph, and on a loopback interface with no network
  latency it is optimistic. A previously measured real-world improvement of
  2.7 s once showed up here as noise. Treat 1.2 s as "not obviously bad", not
  as a field measurement.
- **TTFB of 10 ms is a warm local server.** It excludes DNS, TLS, the network,
  and cold-start on the edge. The 200 ms budget is a production budget and this
  number does not test it.
- **Desktop preset.** The mobile budgets in STEP 09 are a separate measurement.
- **These ran against the local build, not production.** Production is
  currently serving a build from before 2026-09-02 (see STATE.md), so its
  numbers would describe different code.

---

## 6. Not measured

`EXPLAIN ANALYZE` over the top ten queries, and therefore the "covering
indexes only if measured" rule, needs a database connection. The Supabase MCP
tool was disconnected for this pass and `.env.local` carries a stale key, so
no query plan was read. Nothing was added to the schema on the strength of a
guess, which is the outcome that rule is there to force.
