#!/usr/bin/env node
/**
 * Repo-wide hygiene sweep for SECTIONS 23 (FINAL-AUDIT).
 *
 * Seven dimensions, each one measured by `final-audit-lib.mjs` rather than by a
 * grep, for the reasons written at the top of that file. Reports counts and,
 * with --verbose, every hit. The seventh is the only one that is not about a
 * file: SECTIONS 23 also asks for a git log that is clean and readable, and that
 * is graded from GIT_BASELINE forward for the reason written there.
 *
 *   node scripts/final-audit.mjs            human table
 *   node scripts/final-audit.mjs --json     machine readable
 *   node scripts/final-audit.mjs --verbose  every hit, with file:line
 *
 * Exit: 0 when every dimension is within budget, 1 otherwise. The budgets are
 * in BUDGET below and they are all zero except the two that are zero by a
 * different route -- an `any` with a written reason and a `console.*` inside the
 * logging layer itself are not debt, and the code that follows says so.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  PLATFORM_ENV,
  classifyCommitSubject,
  parseEnvExample,
  scanAnyTypes,
  scanConsole,
  scanDynamicEnvAccess,
  scanEnvReads,
  scanIndirectEnvNames,
  scanMarkers,
} from './final-audit-lib.mjs'

const CODE_EXTS = new Set(['.ts', '.tsx'])
const ENV_EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'playwright-report'])

/**
 * Who may call `console.*`, in two tiers, because the two reasons are not the
 * same reason and a single flat list hid that.
 *
 * CONSOLE_LOGGING_LAYER is the structured logger itself. Its last hop has to
 * reach stdout, and it needs all three of `log`/`warn`/`error` because on Vercel
 * the method is what assigns the severity of the line.
 *
 * CONSOLE_BOUNDARIES are React error boundaries. They run in the browser, where
 * `observability/log.ts` cannot: it reads its request id from `node:async_hooks`,
 * which is a build error in a client bundle. The digest they print is the only
 * handle on the server-side stack, and it is also what still works when the
 * Sentry DSN is unset and every capture beside it is inert.
 *
 * A boundary may call `console.error` and NOTHING ELSE. That is the whole point
 * of the second tier: this list grows every time a segment gets a boundary, and
 * a blanket file exemption would carry a stray `console.log` in on the next one.
 */
const CONSOLE_LOGGING_LAYER = new Set(['src/lib/observability/log.ts'])
const CONSOLE_BOUNDARIES = new Set([
  'src/app/error.tsx',
  'src/app/(store)/checkout/error.tsx',
  'src/components/errors/SegmentErrorBoundary.tsx',
])

const BUDGET = {
  untrackedMarkers: 0,
  undirectedAnyTypes: 0,
  strayConsole: 0,
  undocumentedEnv: 0,
  documentedButUnread: 0,
  missingScriptFiles: 0,
  malformedSubjects: 0,
}

/**
 * Where the commit-subject gate starts counting, and why it is a fixed SHA and
 * not "the whole history".
 *
 * 227 of the 1394 commits behind this point do not conform, and rewriting them
 * is off the table: `main` is protected, the history is shared with parallel
 * agents, and 60 of the offenders came from two loops that have been dead since
 * 2026-09-08. Rebasing 1394 commits to prettify 227 subjects is real risk for
 * zero behaviour change. Freezing them and refusing the next one is the only
 * disposition that changes anything.
 *
 * `16983ef6c` is the merge of PR #40, which is the same commit docs/FINAL-AUDIT.md
 * names as its measurement point, so the report and the gate agree on where the
 * line is. Override with FINAL_AUDIT_GIT_BASE to measure a different range.
 */
const GIT_BASELINE = process.env.FINAL_AUDIT_GIT_BASE || '16983ef6c'

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, exts, out)
    else if (exts.has(extname(path))) out.push(path)
  }
  return out
}

const isTest = (file) => /\.test\.(ts|tsx|mjs)$/.test(file)
const read = (file) => readFileSync(file, 'utf8')

function auditCode() {
  const markers = []
  const anyTypes = []
  const consoleCalls = []

  for (const file of walk('src', CODE_EXTS)) {
    const content = read(file)
    for (const hit of scanMarkers(content)) markers.push({ file, ...hit })
    if (isTest(file)) continue
    for (const hit of scanAnyTypes(content)) anyTypes.push({ file, ...hit })
    if (CONSOLE_LOGGING_LAYER.has(file)) continue
    const boundary = CONSOLE_BOUNDARIES.has(file)
    for (const hit of scanConsole(content)) {
      if (boundary && hit.method === 'error') continue
      consoleCalls.push({ file, ...hit })
    }
  }

  return { markers, anyTypes, consoleCalls }
}

/**
 * Both directions of the `.env.example` contract.
 *
 * Undocumented is the direction that costs a launch: an operator sets up
 * production from that file, so a var it never mentions is a feature that is
 * silently off. Documented-but-unread is the cheaper direction and still worth
 * a number -- it is how a renamed variable leaves a lie behind.
 *
 * The read side scans src/ and scripts/ and e2e/ and apps/, because apps/mobile
 * is a second consumer of this project's configuration and an audit that only
 * looks at src/ misses it.
 */
function auditEnv() {
  const documented = parseEnvExample(read('.env.example'))
  const read_ = new Map()
  const dynamic = new Set()

  for (const dir of ['src', 'scripts', 'e2e', 'apps']) {
    for (const file of walk(dir, ENV_EXTS)) {
      // Tests are skipped: a fixture that stubs `process.env.X` is describing a
      // case, not declaring configuration, and this audit's own test file was
      // the first thing to prove it by adding `X` to its own findings.
      if (isTest(file)) continue
      const content = read(file)
      for (const name of scanEnvReads(content)) {
        if (!read_.has(name)) read_.set(name, [])
        read_.get(name).push(file)
      }
      if (scanDynamicEnvAccess(content).length > 0) {
        for (const name of scanIndirectEnvNames(content)) {
          if (!read_.has(name)) read_.set(name, [])
          read_.get(name).push(file)
          dynamic.add(name)
        }
      }
    }
  }

  const appOnly = (name) => !PLATFORM_ENV.has(name)

  const undocumented = [...read_.keys()]
    .filter((n) => appOnly(n) && !documented.has(n))
    .sort()
    .map((name) => ({
      name,
      indirect: dynamic.has(name),
      files: [...new Set(read_.get(name))].sort().slice(0, 3),
    }))

  // The reverse direction is checked by literal search over the whole repo and
  // not against the scan above, because a documented var can legitimately be
  // consumed by docker-compose.yml or a workflow rather than by TypeScript.
  const everything = repoText()
  const documentedButUnread = [...documented]
    .filter((n) => !everything.includes(n))
    .sort()
    .map((name) => ({ name }))

  return {
    undocumented,
    documentedButUnread,
    indirectNames: [...dynamic].sort(),
    documentedCount: documented.size,
  }
}

let repoTextCache = null
function repoText() {
  if (repoTextCache !== null) return repoTextCache
  const exts = new Set([...ENV_EXTS, '.yml', '.yaml', '.json', '.sh', '.md'])
  const parts = []
  for (const dir of ['src', 'scripts', 'e2e', 'apps', '.github', 'docs', 'supabase']) {
    for (const file of walk(dir, exts)) parts.push(read(file))
  }
  for (const file of ['docker-compose.yml', 'package.json', 'next.config.ts']) {
    if (existsSync(file)) parts.push(read(file))
  }
  repoTextCache = parts.join('\n')
  return repoTextCache
}

/** Every local path a package.json script names has to exist. */
function auditScripts() {
  const { scripts } = JSON.parse(read('package.json'))
  const missing = []
  for (const [name, body] of Object.entries(scripts)) {
    for (const m of body.matchAll(/(?:scripts|src|e2e|supabase)\/[A-Za-z0-9_./-]+/g)) {
      if (!existsSync(m[0])) missing.push({ script: name, path: m[0] })
    }
  }
  return { missing, total: Object.keys(scripts).length }
}

/**
 * Commit subjects added since GIT_BASELINE.
 *
 * Degrades to `skipped` rather than to a failure when the baseline is not in the
 * object store, because a shallow CI checkout is a missing measurement and not a
 * dirty history, and a gate that cannot tell those apart teaches people to
 * ignore it. `skipped` carries a reason and is printed either way.
 */
function auditGitLog() {
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  try {
    git('cat-file', '-e', `${GIT_BASELINE}^{commit}`)
  } catch {
    return { skipped: `baseline ${GIT_BASELINE} is not in this checkout`, malformed: [], total: 0 }
  }

  let subjects = []
  try {
    subjects = git('log', '--format=%s', `${GIT_BASELINE}..HEAD`).split('\n').filter(Boolean)
  } catch (err) {
    return { skipped: `git log failed: ${err.message.trim()}`, malformed: [], total: 0 }
  }

  const malformed = []
  for (const subject of subjects) {
    const verdict = classifyCommitSubject(subject)
    if (!verdict.ok) malformed.push({ subject, reasons: verdict.reasons })
  }
  return { skipped: null, malformed, total: subjects.length }
}

function main() {
  const argv = process.argv.slice(2)
  const verbose = argv.includes('--verbose')
  const asJson = argv.includes('--json')

  const { markers, anyTypes, consoleCalls } = auditCode()
  const env = auditEnv()
  const scripts = auditScripts()
  const gitLog = auditGitLog()

  const untrackedMarkers = markers.filter((m) => !m.tracked)
  const undirectedAnyTypes = anyTypes.filter((h) => !h.accepted)

  const counts = {
    markersTotal: markers.length,
    untrackedMarkers: untrackedMarkers.length,
    anyTypesTotal: anyTypes.length,
    undirectedAnyTypes: undirectedAnyTypes.length,
    strayConsole: consoleCalls.length,
    envDocumented: env.documentedCount,
    undocumentedEnv: env.undocumented.length,
    documentedButUnread: env.documentedButUnread.length,
    indirectEnvNames: env.indirectNames.length,
    packageScripts: scripts.total,
    missingScriptFiles: scripts.missing.length,
    commitsSinceBaseline: gitLog.total,
    malformedSubjects: gitLog.malformed.length,
  }

  const failures = Object.entries(BUDGET).filter(([key, max]) => counts[key] > max)

  if (asJson) {
    console.log(
      JSON.stringify(
        { counts, untrackedMarkers, undirectedAnyTypes, consoleCalls, env, scripts, gitLog },
        null,
        2,
      ),
    )
    process.exit(failures.length === 0 ? 0 : 1)
  }

  const rows = [
    ['work markers (TODO/FIXME/HACK/XXX)', counts.untrackedMarkers, counts.markersTotal],
    ['`any` in type position', counts.undirectedAnyTypes, counts.anyTypesTotal],
    ['console.* outside the logging layer', counts.strayConsole, counts.strayConsole],
    ['env vars read but not in .env.example', counts.undocumentedEnv, counts.envDocumented],
    ['env vars documented but never read', counts.documentedButUnread, counts.envDocumented],
    [
      'package.json scripts naming a missing file',
      counts.missingScriptFiles,
      counts.packageScripts,
    ],
    [
      `commit subjects since ${GIT_BASELINE}`,
      counts.malformedSubjects,
      counts.commitsSinceBaseline,
    ],
  ]

  console.log('\nFINAL AUDIT (SECTIONS 23)\n')
  for (const [label, over, context] of rows) {
    console.log(
      `  ${over === 0 ? 'ok  ' : 'FAIL'}  ${String(over).padStart(3)}  ${label}  (of ${context})`,
    )
  }

  if (verbose) {
    show('untracked markers', untrackedMarkers, (h) => `${h.file}:${h.line}  ${h.text}`)
    show('undirected any', undirectedAnyTypes, (h) => `${h.file}:${h.line}  ${h.text}`)
    show('stray console', consoleCalls, (h) => `${h.file}:${h.line}  ${h.text}`)
    show(
      'undocumented env',
      env.undocumented,
      (h) => `${h.name}${h.indirect ? ' (via lookup)' : ''}  <- ${h.files.join(', ')}`,
    )
    show('documented but unread env', env.documentedButUnread, (h) => h.name)
    show('missing script files', scripts.missing, (h) => `${h.script}  -> ${h.path}`)
    show(
      'malformed commit subjects',
      gitLog.malformed,
      (h) => `${h.reasons.join('; ')}\n      ${h.subject.slice(0, 100)}`,
    )
  }

  if (gitLog.skipped) {
    console.log(`\n  note  commit subjects not measured: ${gitLog.skipped}`)
  }

  if (counts.indirectEnvNames > 0) {
    console.log(
      `\n  note  ${counts.indirectEnvNames} name(s) came from a lookup table rather than from a read site, and are counted above like any other. --verbose marks them.`,
    )
  }

  console.log('')
  process.exit(failures.length === 0 ? 0 : 1)
}

function show(title, hits, format) {
  if (hits.length === 0) return
  console.log(`\n  ${title}:`)
  for (const hit of hits) console.log(`    ${format(hit)}`)
}

main()
