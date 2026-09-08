/**
 * APPENDS EVERY GATE RESULT TO docs/UI-PARITY-REPORT.md.
 *
 * WHY IT LIVES INSIDE THE GATE. The gate ran at 380, 768 and 1440 and reported
 * 10.69, 7.36 and 7.07 percent, and `docs/UI-PARITY-REPORT.md` was empty --
 * because writing the row was a step a person had to remember, and the person
 * was reporting the numbers in a commit message instead. A measurement nobody
 * recorded is a measurement nobody can compare against next week.
 *
 * So `diff-bands.mjs` calls this the moment the number exists, before anything
 * is printed. There is no path that computes a percentage and does not log it.
 *
 * EVERY ROW CARRIES THE COMMIT. A parity number without one is unusable: it
 * cannot be attributed, reproduced, or told apart from the run before it. The
 * hash comes from git, with a `-dirty` suffix when the tree has uncommitted
 * changes, because a number measured against a dirty tree is not a number
 * measured against that commit.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * IS TODAY WORSE THAN THE BEST THIS REFERENCE HAS EVER ALLOWED?
 *
 * At 380 and 768 the 11% gate is not reachable and never will be: the reference
 * dropped 57 scripts and 37 fonts, refs/live-assets captured none of either,
 * and the origin answers 403. Those rows have therefore read **FAIL** on every
 * run since the snapshot was localized, which is the kind of permanent red that
 * teaches a reader to skip the column.
 *
 * So the ceiling verdict is left exactly as it was - it is the project's rule
 * and not this file's to soften - and a second question is asked beside it,
 * which a permanent FAIL cannot answer. The numbers are stable to the hundredth
 * across separate builds, so half a point is a wide tolerance and still catches
 * a real layout regression.
 *
 * Advisory on purpose. It writes a note and prints a warning; it does not
 * change an exit code. Promoting it to a failing gate is worth doing once the
 * pixel job actually runs in CI, and that is blocked on the reference being
 * reachable there at all.
 */
function baselines() {
  try {
    const path = resolve(process.cwd(), 'scripts/parity-baselines.json')
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @param {string} page
 * @param {number} width
 * @param {number} pct
 * @returns {string} '' when there is no baseline or no regression
 */
export function regressionNote(page, width, pct) {
  const data = baselines()
  const best = data?.pages?.[page]?.[String(width)]
  if (typeof best !== 'number') return ''
  const tolerance = typeof data.tolerance === 'number' ? data.tolerance : 0.5
  if (pct <= best + tolerance) return ''
  return `WORSE than the ${best}% best known for ${page}/${width} (tolerance ${tolerance})`
}

const REPORT = 'docs/UI-PARITY-REPORT.md'

/** The 11% ceiling every visual step is scored against. */
export const GATE_CEILING = 11

const HEADER = `# UI parity report

Every \`scripts/compare.mjs\` run appends a row here automatically -- the gate
writes it, not the person running the gate, because the version where a person
wrote it produced an empty file while three measurements sat in a commit
message.

**The gate is ${GATE_CEILING}%.** A row above it is an open defect, and the cause
belongs in the notes column rather than being left as a number.

The diff is the share of mismatched pixels over the first 2600px of the page,
live against our build, at the stated viewport width. \`dirty\` on a commit means
the tree had uncommitted changes when it was measured.

| when (UTC) | page | width | diff | verdict | commit | notes |
|---|---|---:|---:|---|---|---|
`

function commitHash() {
  try {
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return dirty ? `${hash}-dirty` : hash
  } catch {
    return 'unknown'
  }
}

/** Table cells cannot contain a pipe or a newline, whatever the caller passes. */
function cell(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .trim()
    .slice(0, 160)
}

/** The first value that is actually there. An empty string is not a note. */
function firstNote(...values) {
  return values.map(cell).find((value) => value !== '') ?? ''
}

/**
 * WHY THE NOTE IS RESOLVED HERE, AND WHY `??` WAS THE WRONG OPERATOR.
 *
 * The column the header calls the place "the cause belongs" had never been
 * filled in the file's history. `COMPARE_NOTES` existed the whole time -
 * diff-bands.mjs reads it - but it passes `notes: process.env.COMPARE_NOTES ??
 * ''`, so this function receives an explicit EMPTY STRING on every run, and an
 * empty string is not null: any `??` fallback here is dead code the caller can
 * never reach.
 *
 * MEASURED TWICE, 2026-09-08. First: seven rows in one session, four from a
 * next 16.2.12 build and three from 16.3.4, every one carrying the same
 * `-dirty` commit because the bump was uncommitted while being measured -
 * identical rows, nothing able to say which was the before and which the after.
 * Then, fixing that, five more empty rows - because the fallback added for it
 * used `??` against the caller's empty string and was itself inert, while a
 * second env var was invented for a job the first one already had.
 *
 * So: one variable, the one that already existed, and emptiness treated as
 * absence rather than as a value.
 *
 * @param {{page: string, width: number, pct: number, notes?: string, when?: string, commit?: string}} row
 */
export function appendParityRow(row) {
  const path = resolve(process.cwd(), REPORT)
  if (!existsSync(path) || !readFileSync(path, 'utf8').includes('| when (UTC) |')) {
    writeFileSync(path, HEADER)
  }
  const when = row.when ?? new Date().toISOString().replace('T', ' ').slice(0, 16)
  const verdict = row.pct <= GATE_CEILING ? 'PASS' : '**FAIL**'
  const commit = row.commit ?? commitHash()
  const regression = regressionNote(row.page, row.width, row.pct)
  if (regression) console.warn(`  parity: ${regression}`)
  const notes = firstNote(
    [regression, row.notes].filter(Boolean).join('; '),
    process.env.COMPARE_NOTES,
  )
  appendFileSync(
    path,
    `| ${when} | ${row.page} | ${row.width} | ${row.pct.toFixed(2)}% | ${verdict} | \`${commit}\` | ${notes} |\n`,
  )
}

/**
 * RECORDS A RUN THAT COULD NOT PRODUCE A NUMBER AT ALL.
 *
 * `appendParityRow` takes a percentage, so it can only be called once the diff
 * exists. That left a hole the exact shape of the one this file was written to
 * close: a run that dies BEFORE measuring writes nothing, and the newest row in
 * the report stays whatever last succeeded.
 *
 * CAUGHT ON 2026-09-08. Two `--page=home` runs died on
 * `net::ERR_CONNECTION_CLOSED` against the live reference, which no longer
 * serves TLS. Neither wrote a row, so the file's last word was six PASS rows
 * from 2026-09-07 and the gate looked green while it was in fact incapable of
 * running. Stale green is worse than red: red gets fixed.
 *
 * So a failure is a result and gets a row too. It carries no percentage,
 * because inventing one would be worse than the silence it replaces.
 */
export function appendParityFailure(row) {
  const path = resolve(process.cwd(), REPORT)
  if (!existsSync(path) || !readFileSync(path, 'utf8').includes('| when (UTC) |')) {
    writeFileSync(path, HEADER)
  }
  const when = row.when ?? new Date().toISOString().replace('T', ' ').slice(0, 16)
  const commit = row.commit ?? commitHash()
  const note = firstNote(process.env.COMPARE_NOTES)
  const reason = cell(row.reason ?? 'unknown') + (note ? ` -- ${note}` : '')
  appendFileSync(
    path,
    `| ${when} | ${row.page} | ${row.width} | n/a | **UNMEASURED** | \`${commit}\` | ${reason} |\n`,
  )
}
