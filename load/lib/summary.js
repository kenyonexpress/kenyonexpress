/**
 * What every scenario records, so a run can be read the same way twice.
 *
 * k6's default trend line is avg/min/med/max/p(90)/p(95). Section 42 asks for
 * p50, p95 and p99 per scenario, and p99 is the one that is not there by
 * default -- it is also the one that shows a tail the p95 hides: a connection
 * pool that stalls one request in a hundred is invisible at p95 and a wall at
 * p99. `med` is p50 under k6's own name; asking for `p(50)` as well would print
 * the same number twice.
 *
 * Set on `options.summaryTrendStats` in every scenario, not passed on the
 * command line: a flag is exactly the kind of thing that is forgotten right
 * before the run that matters, and a summary without p99 cannot be compared
 * with one that has it. `--summary-export` writes these same stats to JSON,
 * which `scripts/load-summary.mjs` turns into the table in
 * docs/LOAD-TEST-RESULTS.md.
 */
export const TREND_STATS = ['med', 'p(95)', 'p(99)', 'max']
