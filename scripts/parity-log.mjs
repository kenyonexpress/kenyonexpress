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

/**
 * WHY THE NOTE COMES FROM THE ENVIRONMENT.
 *
 * `notes` has been a parameter of this function since it was written and NO
 * CALLER HAS EVER PASSED ONE, so the column the header calls the place "the
 * cause belongs" has only ever been empty. It could not be filled without
 * threading an argument through compare.mjs and diff-bands.mjs to get here.
 *
 * MEASURED, 2026-09-08: seven rows written in one session, four from a
 * next 16.2.12 build and three from 16.3.4, every one labelled with the same
 * `-dirty` commit because the version bump was uncommitted while it was being
 * measured. Identical rows, and nothing in the file able to say that two of
 * them are the before and after of the thing the session existed to measure.
 *
 * PARITY_NOTE is read here rather than parsed as a flag so it reaches this
 * function no matter which script above it did the measuring.
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
  const notes = cell(row.notes ?? process.env.PARITY_NOTE ?? '')
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
  const note = cell(process.env.PARITY_NOTE ?? '')
  const reason = cell(row.reason ?? 'unknown') + (note ? ` -- ${note}` : '')
  appendFileSync(
    path,
    `| ${when} | ${row.page} | ${row.width} | n/a | **UNMEASURED** | \`${commit}\` | ${reason} |\n`,
  )
}
