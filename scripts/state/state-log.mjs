#!/usr/bin/env node
/**
 * Record one queue item's outcome in STATE.md and keep STATE.md short.
 *
 *   node scripts/state/state-log.mjs --id XF01 --result "RESULT: DONE" --next XF02
 *   node scripts/state/state-log.mjs --id XF03 --result "BLOCKED no deployed URL"
 *
 * Options:
 *   --repo <dir>        repository root (default: cwd). STATE.md and
 *                       docs/STATE-ARCHIVE.md are resolved against it.
 *   --state <file>      default STATE.md
 *   --archive <file>    default docs/STATE-ARCHIVE.md
 *   --id <item id>      required
 *   --result <text>     required; DONE or a BLOCKED reason, `RESULT: ` prefix optional
 *   --next <item id>    rewrites line 1 to `RESUME FROM: <id>` when given
 *   --max-lines <n>     default 300
 *   --max-entries <n>   default 25 log entries kept in STATE.md
 *   --timestamp <iso>   override the clock (tests)
 *   --dry-run           print what would change, write nothing
 *
 * Called by ~/ke-goals/run-final.sh after every RESULT line. Exit 0 on a
 * write, 2 on a usage error, 1 on an I/O failure. Never deletes: every line
 * that leaves STATE.md is appended to the archive in the same run, and the
 * archive is written before STATE.md so a crash between the two leaves the
 * line in both files rather than in neither.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_LOG_ENTRIES,
  applyStateLog,
  isoLocal,
} from './state-log-lib.mjs'

function parseArgs(argv) {
  const opts = { dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[i + 1]
      if (v === undefined) throw new Error(`${a} needs a value`)
      i++
      return v
    }
    switch (a) {
      case '--repo':
        opts.repo = next()
        break
      case '--state':
        opts.state = next()
        break
      case '--archive':
        opts.archive = next()
        break
      case '--id':
        opts.id = next()
        break
      case '--result':
        opts.result = next()
        break
      case '--next':
        opts.next = next()
        break
      case '--max-lines':
        opts.maxLines = Number(next())
        break
      case '--max-entries':
        opts.maxLogEntries = Number(next())
        break
      case '--timestamp':
        opts.timestamp = next()
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '-h':
      case '--help':
        opts.help = true
        break
      default:
        throw new Error(`unknown argument ${a}`)
    }
  }
  return opts
}

function usage() {
  return 'usage: state-log.mjs --id <item> --result <DONE|BLOCKED reason> [--next <item>] [--repo <dir>] [--dry-run]'
}

let opts
try {
  opts = parseArgs(process.argv.slice(2))
} catch (err) {
  console.error(`state-log: ${err.message}\n${usage()}`)
  process.exit(2)
}
if (opts.help) {
  console.log(usage())
  process.exit(0)
}
if (!opts.id || opts.result === undefined) {
  console.error(`state-log: --id and --result are required\n${usage()}`)
  process.exit(2)
}
for (const [name, value] of [
  ['--max-lines', opts.maxLines],
  ['--max-entries', opts.maxLogEntries],
]) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    console.error(`state-log: ${name} must be a positive integer`)
    process.exit(2)
  }
}

const repo = resolve(opts.repo ?? process.cwd())
const statePath = resolve(repo, opts.state ?? 'STATE.md')
const archivePath = resolve(repo, opts.archive ?? 'docs/STATE-ARCHIVE.md')

let stateText = ''
let archiveText = ''
try {
  stateText = existsSync(statePath) ? readFileSync(statePath, 'utf8') : ''
  archiveText = existsSync(archivePath) ? readFileSync(archivePath, 'utf8') : ''
} catch (err) {
  console.error(`state-log: cannot read: ${err.message}`)
  process.exit(1)
}

const out = applyStateLog({
  stateText,
  archiveText,
  id: opts.id,
  result: opts.result,
  next: opts.next,
  timestamp: opts.timestamp ?? isoLocal(),
  maxLines: opts.maxLines ?? DEFAULT_MAX_LINES,
  maxLogEntries: opts.maxLogEntries ?? DEFAULT_MAX_LOG_ENTRIES,
})

const archiveLabel = opts.archive ?? 'docs/STATE-ARCHIVE.md'
const resumeLabel = opts.next ? `, resume ${opts.next}` : ''
const summary = `state-log: ${opts.id} ${out.status} at ${out.block[0].slice(4)}; STATE.md ${out.lineCount} lines, moved ${out.movedCount} to ${archiveLabel}${resumeLabel}`

if (opts.dryRun) {
  console.log(`${summary} (dry run)`)
  console.log(out.block.join('\n'))
  process.exit(0)
}

try {
  if (out.movedCount > 0) {
    mkdirSync(dirname(archivePath), { recursive: true })
    writeFileSync(archivePath, out.archiveText)
  }
  writeFileSync(statePath, out.stateText)
} catch (err) {
  console.error(`state-log: cannot write: ${err.message}`)
  process.exit(1)
}
console.log(summary)
