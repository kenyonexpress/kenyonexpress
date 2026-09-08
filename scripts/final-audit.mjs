#!/usr/bin/env node
/**
 * Repo-wide hygiene sweep for SECTIONS 23 (FINAL-AUDIT).
 *
 * Six dimensions, each one measured by `final-audit-lib.mjs` rather than by a
 * grep, for the reasons written at the top of that file. Reports counts and,
 * with --verbose, every hit.
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

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  PLATFORM_ENV,
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
 * The three files that are allowed to call `console.*`, and why each one is not
 * a stray debug line:
 *
 *   observability/log.ts  IS the structured logger. Its last hop has to reach
 *                         stdout, and on Vercel `console.error` is also what
 *                         marks a line as an error.
 *   app/error.tsx         the React error boundary. It runs in the browser,
 *                         where the server logger does not exist, and the digest
 *                         it prints is the only handle on the server-side stack.
 */
const CONSOLE_ALLOWED = new Set(['src/lib/observability/log.ts', 'src/app/error.tsx'])

const BUDGET = {
  untrackedMarkers: 0,
  undirectedAnyTypes: 0,
  strayConsole: 0,
  undocumentedEnv: 0,
  documentedButUnread: 0,
  missingScriptFiles: 0,
}

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
    if (CONSOLE_ALLOWED.has(file)) continue
    for (const hit of scanConsole(content)) consoleCalls.push({ file, ...hit })
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

function main() {
  const argv = process.argv.slice(2)
  const verbose = argv.includes('--verbose')
  const asJson = argv.includes('--json')

  const { markers, anyTypes, consoleCalls } = auditCode()
  const env = auditEnv()
  const scripts = auditScripts()

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
  }

  const failures = Object.entries(BUDGET).filter(([key, max]) => counts[key] > max)

  if (asJson) {
    console.log(
      JSON.stringify(
        { counts, untrackedMarkers, undirectedAnyTypes, consoleCalls, env, scripts },
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
