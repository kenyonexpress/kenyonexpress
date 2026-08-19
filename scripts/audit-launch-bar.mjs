#!/usr/bin/env node
/**
 * Prints the catalogue launch bar, or the SQL that measures it.
 *
 * Like `seed-catalogue.mjs`, this connects to nothing. The local service key in
 * `.env.local` belongs to a different project and answers "Invalid API key", so
 * a script that promised to query would only ever fail here. It emits SQL you
 * run in the Supabase SQL editor and reads the row back:
 *
 *   node scripts/audit-launch-bar.mjs --sql > /tmp/audit.sql
 *   node scripts/audit-launch-bar.mjs --eval /tmp/row.json
 *   node scripts/audit-launch-bar.mjs --measured   # the 19.08.2026 snapshot
 *
 * `--eval` accepts either the object or the one-element array the SQL editor
 * copies out, from a file or from stdin.
 */
import { readFileSync } from 'node:fs'
import { MEASURED_2026_08_19, auditSql, evaluate } from './seed/launch-bar.mjs'

function readJson(path) {
  const raw = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed[0] : parsed
}

function print(metrics, title) {
  const rows = evaluate(metrics)
  const width = Math.max(...rows.map((r) => r.label.length))
  console.log(title)
  console.log('')
  for (const row of rows) {
    const mark = row.pass ? 'PASS' : 'FAIL'
    console.log(`  ${mark}  ${row.label.padEnd(width)}  צריך ${row.requirement}, יש ${row.actual}`)
  }
  const failed = rows.filter((r) => !r.pass).length
  console.log('')
  console.log(`  ${rows.length - failed}/${rows.length} שורות עוברות`)
  return failed
}

const [flag, arg] = process.argv.slice(2)

if (flag === '--eval') {
  process.exit(print(readJson(arg), 'שער השקה לקטלוג, מדידה שסופקה') > 0 ? 1 : 0)
} else if (flag === '--measured') {
  print(MEASURED_2026_08_19, 'שער השקה לקטלוג, פרודקשן 19.08.2026')
  // The snapshot is a record, not a gate: it is known to fail and exiting
  // non-zero would make every run look broken.
  process.exit(0)
} else {
  console.log(auditSql())
}
