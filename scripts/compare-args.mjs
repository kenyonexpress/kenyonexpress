import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/**
 * The compare gate's command line, in one place and testable.
 *
 * F43 (2026-10-21) was handed this invocation by the goal queue:
 *
 *   pnpm run compare -- --page=home --widths=380 --baseline=electro-v7-380.png --live-url=http://localhost:3311
 *
 * and compare.mjs accepted none of the three flags. It read `--width=` singular,
 * took the server under test from LOCAL_BASE, and always shot the reference
 * itself. Unknown `--x=` flags were ignored WITHOUT A WORD, so the literal
 * command would have measured 1440 against a fresh archive shot and printed a
 * number that looked like the answer to a question it had not been asked.
 *
 * This module gives the flags a meaning and a test, and compare.mjs consumes
 * the result rather than process.argv. Mapping, with the gate's own vocabulary
 * on the right:
 *
 *   --page=<name>          page (unchanged)
 *   --width=<n>            viewport width (unchanged)
 *   --widths=<a,b,c>       fan out: one child run per width, in order. A single
 *                          value is the same as --width.
 *   --live-url=<url>       THE SERVER UNDER TEST (our build). The goal wording
 *                          says "live" for the thing being measured; the gate
 *                          says `--live=` for the REFERENCE. They are opposites,
 *                          so this is spelled out at the call site and here.
 *   --baseline=<png>       use this PNG as the reference side instead of
 *                          shooting refs/localized/ afresh. A bare name resolves
 *                          under refs/. The ledger row names the file, because
 *                          a frozen baseline and a fresh shot are different
 *                          measurements (docs/REFS-POLICY.md).
 *
 * `--widths` and `--width` together: `--widths` wins, since it is the one that
 * says how many runs there are.
 */
export function parseCompareArgs(argv, { exists = existsSync, refsDir = 'refs' } = {}) {
  const argOf = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : null
  }

  const page = argOf('page') ?? 'home'

  const widthsRaw = argOf('widths')
  const widths = widthsRaw
    ? widthsRaw
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .map(Number)
    : []
  if (widths.some((w) => !Number.isInteger(w) || w <= 0)) {
    throw new Error(
      `compare: --widths must be a comma list of positive integers, got "${widthsRaw}"`,
    )
  }
  const width = widths.length > 0 ? widths[0] : Number(argOf('width') ?? '1440')

  const underTest = argOf('live-url')

  const baselineRaw = argOf('baseline')
  let baseline = null
  if (baselineRaw) {
    const candidates = isAbsolute(baselineRaw)
      ? [baselineRaw]
      : [resolve(baselineRaw), resolve(refsDir, baselineRaw)]
    const found = candidates.find((p) => exists(p))
    if (!found) {
      // One template literal, not concatenated pieces: joining them with `+` is
      // a recorded way to lose text in this repo.
      throw new Error(
        `compare: --baseline=${baselineRaw} names no file (looked at ${candidates.join(', ')}).
A baseline is a PNG of the reference at the run's width. Make one from a fresh run's refs/live-<page>.png,
or drop the flag to shoot refs/localized/ as usual.`,
      )
    }
    baseline = { name: baselineRaw, path: found }
  }

  return { page, width, widths, underTest, baseline }
}
