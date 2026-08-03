/**
 * The threshold table from docs/ARCHITECTURE-TESTING.md section 5.3, as code.
 *
 * The doc gives two numbers per row -- a target and a failure point. k6
 * thresholds are binary, so both are expressed: the target is the gate (a
 * crossed threshold exits 99), and the failure point additionally carries
 * `abortOnFail`, which stops a run that has already gone so far wrong that the
 * remaining minutes only cost time.
 *
 * The last three rows of that table are correctness, not performance. They are
 * counters that must end at zero, and section 5.3 is explicit that a run
 * finishing with one double charge is a failed run even when every p95 is
 * green -- so they abort immediately.
 */

/** `p(95)<target` as the gate, `p(95)<fail` as the abort. */
export function latency(target, fail) {
  return [`p(95)<${target}`, { threshold: `p(95)<${fail}`, abortOnFail: true }]
}

/** Section 5.3: error rate under 0.5%, failing over 1%. */
export const ERROR_RATE = [
  'rate<0.005',
  { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' },
]

/**
 * A correctness counter. Zero is the only passing value, and the first
 * occurrence ends the run: every further second of load is spent producing more
 * of the same bad rows.
 */
export const MUST_BE_ZERO = ['count==0', { threshold: 'count==0', abortOnFail: true }]

/** Section 5.3, keyed by the tag each scenario puts on the request. */
export const PAGE_LATENCY = {
  home: latency(1000, 2000),
  product: latency(800, 1500),
  begin_checkout: latency(1500, 3000),
  redeem: latency(500, 1000),
}
