/**
 * Pure scanners behind `scripts/final-audit.mjs` (SECTIONS 23, FINAL-AUDIT).
 *
 * Every function here takes text and returns hits. Nothing reads the disk, so
 * the tests can state a case in three lines instead of building a fixture tree.
 *
 * WHY THIS EXISTS AT ALL, given that a `grep -rn TODO src/` is one line: that
 * grep returns 20 hits in this repo and 18 of them are the string `XXXXX-XXXXX`
 * -- the voucher display format, an Israeli phone placeholder, a GA4 id shape.
 * A number that is 90% wrong is worse than no number, because it gets written
 * into a report and quoted later. The same trap sits under every other
 * dimension: `as any` inside a comment explaining why there is no `as any`,
 * `console.error` inside the doc comment of the logger that replaced it, and an
 * env var read as `source.CARDCOM_ACCOUNTS` off a passed-in ProcessEnv, which
 * no `process.env.` grep can see. Each scanner below encodes the distinction
 * the grep cannot make.
 */

/** Lines that are inside a `/* *\/` block or start with `//`. */
export function commentLineNumbers(content) {
  const lines = content.split('\n')
  const out = new Set()
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inBlock) {
      out.add(i + 1)
      if (trimmed.includes('*/')) inBlock = false
      continue
    }
    if (trimmed.startsWith('//')) {
      out.add(i + 1)
      continue
    }
    const open = trimmed.indexOf('/*')
    if (open !== -1 && !trimmed.includes('*/', open)) {
      out.add(i + 1)
      inBlock = true
      continue
    }
    if (open !== -1) out.add(i + 1)
  }
  return out
}

/**
 * A marker word standing on its own.
 *
 * The boundaries are spelled out rather than left to `\b` because `\b` is what
 * makes the naive count wrong: it happily matches the middle `XXX` of
 * `05X-XXX-XXXX`, an Israeli mobile placeholder. A marker is preceded by the
 * start of the line or whitespace, and followed by whitespace, a colon, or the
 * scope parenthesis of `TODO(cardcom)`.
 */
const MARKER = /(?:^|\s)(TODO|FIXME|HACK|XXX)(?=$|[\s:(])/

/**
 * Unresolved work markers.
 *
 * Two rules do all the work. A marker only counts inside a comment, which drops
 * `placeholder="XXXXX-XXXXX"` and the test that sets an env var to the literal
 * string `'TODO'`. And `\bXXX\b` never matches a run of X's, which is what
 * every placeholder in this codebase actually is.
 *
 * A marker is TRACKED when the comment it sits in names a GitHub issue. That is
 * the disposition SECTIONS 23 asks for -- "resolved or converted to an issue" --
 * so a tracked marker is not debt, it is a pointer. The window is the marker's
 * own comment run, because the issue reference is normally written on the line
 * after the marker rather than on it.
 */
export function scanMarkers(content) {
  const lines = content.split('\n')
  const comments = commentLineNumbers(content)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (!comments.has(i + 1)) continue
    const m = MARKER.exec(lines[i])
    if (!m) continue
    hits.push({
      line: i + 1,
      marker: m[1],
      text: lines[i].trim(),
      tracked: hasIssueRef(lines, i, comments),
    })
  }
  return hits
}

const ISSUE_REF = /(#\d+\b|github\.com\/[^\s)]+\/issues\/\d+)/

function hasIssueRef(lines, index, comments) {
  for (let i = index; i < lines.length && comments.has(i + 1); i++) {
    if (ISSUE_REF.test(lines[i])) return true
  }
  return false
}

const ANY_TYPE = /(:\s*any\b|<any>|\bas any\b|\bany\[\])/
const ANY_IGNORE = /biome-ignore\s+lint\/suspicious\/noExplicitAny/

/**
 * `any` in type position, outside comments.
 *
 * ACCEPTED means the hit carries a `biome-ignore lint/suspicious/noExplicitAny`
 * directive above it. That is not a loophole: biome already fails the build on
 * an undirected `any`, so an accepted hit is one a human wrote a reason for and
 * a rejected hit cannot exist in a passing tree. Counting them separately is
 * the only way the report can say "11 hits, 1 in shipping code, and it is
 * deliberate" instead of "11".
 */
export function scanAnyTypes(content) {
  const lines = content.split('\n')
  const comments = commentLineNumbers(content)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (comments.has(i + 1)) continue
    if (!ANY_TYPE.test(lines[i])) continue
    const previous = i > 0 ? lines[i - 1] : ''
    hits.push({ line: i + 1, text: lines[i].trim(), accepted: ANY_IGNORE.test(previous) })
  }
  return hits
}

const CONSOLE_CALL = /\bconsole\.(log|debug|info|warn|error|trace)\s*\(/

/** `console.*` calls outside comments. */
export function scanConsole(content) {
  const lines = content.split('\n')
  const comments = commentLineNumbers(content)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (comments.has(i + 1)) continue
    const m = CONSOLE_CALL.exec(lines[i])
    if (m) hits.push({ line: i + 1, method: m[1], text: lines[i].trim() })
  }
  return hits
}

/**
 * Identifiers that hold a ProcessEnv in this codebase, measured rather than
 * guessed: every `: NodeJS.ProcessEnv` annotation in src/ names one of these.
 * The list is an allowlist and not "any dotted CAPS word" on purpose, because
 * the loose version reports `Number.MAX_SAFE_INTEGER` and `PostgrestError
 * .PERMISSION_DENIED` as environment variables.
 */
export const ENV_CARRIERS = ['env', 'source', 'ENV', 'processEnv']

const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  new RegExp(`\\b(?:${ENV_CARRIERS.join('|')})(?:\\?)?\\.([A-Z][A-Z0-9_]{2,})\\b`, 'g'),
]

/**
 * Every environment variable name a file reads, by all three access shapes.
 *
 * Comment lines are dropped first. Without that, a comment explaining that
 * `process.env.X = undefined` stores the STRING "undefined" reports `X` as an
 * environment variable this project needs.
 */
export function scanEnvReads(content) {
  const comments = commentLineNumbers(content)
  const code = content
    .split('\n')
    .map((line, i) => (comments.has(i + 1) ? '' : line))
    .join('\n')
  const names = new Set()
  for (const pattern of ENV_PATTERNS) {
    for (const m of code.matchAll(pattern)) names.add(m[1])
  }
  return names
}

/**
 * Names `.env.example` documents. Commented-out entries count: an optional var
 * is documented by showing it commented with its default, which is how most of
 * that file is written.
 *
 * The optional `[tag]` prefix is not cosmetic tolerance. The R2 block writes its
 * five entries as `# [optional] R2_BUCKET=`, and a parser anchored hard at the
 * name reported all five R2 secrets as undocumented -- five findings that would
 * have been chased and were never real.
 */
export function parseEnvExample(content) {
  const names = new Set()
  for (const line of content.split('\n')) {
    const m = /^\s*#?\s*(?:\[[a-z ]+\]\s*)?([A-Z][A-Z0-9_]*)=/.exec(line)
    if (m) names.add(m[1])
  }
  return names
}

const DYNAMIC_ENV = new RegExp(
  `\\b(?:${ENV_CARRIERS.join('|')}|process\\.env)\\[(?!['"])[^\\]]+\\]`,
)

/**
 * Where the scanner above is blind, stated out loud instead of silently missed.
 *
 * `env[AGENT_FLAG[agent]]` in `src/server/ai/client.ts` reads one of four
 * variables whose names live in a lookup table. No pattern over the read site
 * can recover them, and the first version of this audit therefore reported the
 * AI feature flags as fully documented when `.env.example` did not mention a
 * single one of them. A count of zero that comes from not looking is the exact
 * failure this whole file exists to avoid, so dynamic sites are listed for a
 * human rather than folded into a clean number.
 */
export function scanDynamicEnvAccess(content) {
  const lines = content.split('\n')
  const comments = commentLineNumbers(content)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (comments.has(i + 1)) continue
    if (DYNAMIC_ENV.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() })
  }
  return hits
}

const ENV_NAME_LITERAL = /['"]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"]/g

/**
 * Names recovered from a file that reads its environment through a lookup.
 *
 * Only files that actually index an env carrier with a computed key are
 * harvested, and only string literals shaped like an env var (upper snake, at
 * least one underscore) are taken. That pairing is what keeps it useful: an XML
 * parser walking `source[i]` has no such literals and contributes nothing, while
 * `AGENT_FLAG` in src/server/ai/client.ts gives up all four AI feature flags,
 * none of which `.env.example` had ever mentioned.
 *
 * It over-collects by construction -- a file can name a variable it does not
 * read -- so these names are folded in only as things to DOCUMENT, never as
 * evidence that something is unused.
 */
export function scanIndirectEnvNames(content) {
  if (scanDynamicEnvAccess(content).length === 0) return new Set()
  const comments = commentLineNumbers(content)
  const code = content
    .split('\n')
    .map((line, i) => (comments.has(i + 1) ? '' : line))
    .join('\n')
  const names = new Set()
  for (const m of code.matchAll(ENV_NAME_LITERAL)) names.add(m[1])
  return names
}

/**
 * Supplied by the platform, never by `.env.example`. Documenting these would be
 * telling an operator to set something Vercel and Node already own.
 */
export const PLATFORM_ENV = new Set([
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_OUTPUT',
  'GITHUB_STEP_SUMMARY',
  'NEXT_RUNTIME',
  'NODE_ENV',
  'PORT',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_URL',
])

/**
 * The one dimension of SECTIONS 23 that is not about a file: "git log clean and
 * readable".
 *
 * Measured over all 1394 commits reachable from `origin/main` on 2026-09-09,
 * not assumed. 1167 already conform. What the other 227 are, and why the rules
 * below are shaped the way they are:
 *
 *   `Merge ...`      7 commits. Git and the GitHub merge button write this
 *                    subject; a developer never types it. It is exempt because
 *                    failing it would only teach people to pass --no-verify.
 *   `Revert "..."`   same argument, `git revert` writes it.
 *   `merge...: `     57 commits, the largest single group and a house habit
 *                    rather than a bot: `merge(docs): the v1-final branch`. It
 *                    is a real type name that no conventional-commit tool knows,
 *                    so it reports as an unknown type; `chore(merge):` says the
 *                    same thing and groups.
 *   `[autopilot] `   39 commits, and `[auto-merger] ` another 21. Every
 *                    `[autopilot]` one is a valid conventional subject with a
 *                    bracket bolted on the front, so the useful report is "drop
 *                    the prefix", not "unrecognised". That is why the prefix
 *                    gets its own reason string. Both loops are dead as of
 *                    2026-09-08; nothing is still generating these.
 *   ad-hoc types     `wip`, `architecture`, `sec`, `security`, `state`, `refs`,
 *                    `db`, `supplier` and nine more, 40 commits between them.
 *                    Readable, but they defeat every tool that groups by type.
 *
 * SUBJECT_MAX is 120 and not the classic 72 because 72 is not this repo's
 * house style and never has been: the length distribution runs p50=70, p75=79,
 * p90=91, p95=104. A 72 ceiling would fail a quarter of the history's
 * deliberately descriptive subjects, which is a gate arguing with a convention
 * rather than enforcing one. 120 sits above p95 and still catches the 32
 * subjects that are a paragraph pasted into the subject line -- the longest is
 * 946 characters, which is the thing that actually makes `git log --oneline`
 * unreadable.
 */
export const COMMIT_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
])

export const SUBJECT_MAX = 120

const GENERATED_SUBJECT = /^(Merge |Revert ")/
const CONVENTIONAL = /^([a-z]+)(\(([^)]+)\))?(!)?: (.+)$/

/**
 * @param {string} subject  a commit subject line, without the trailing newline
 * @returns {{kind: 'generated'|'conventional'|'malformed', ok: boolean, type: string|null, reasons: string[]}}
 */
export function classifyCommitSubject(subject) {
  const text = String(subject).trim()
  if (GENERATED_SUBJECT.test(text)) {
    return { kind: 'generated', ok: true, type: null, reasons: [] }
  }

  const reasons = []
  let body = text

  const prefix = body.match(/^(\[[a-z0-9-]+\]\s*)/)
  if (prefix) {
    reasons.push(`bot prefix ${prefix[1].trim()}`)
    body = body.slice(prefix[1].length)
  }

  const match = body.match(CONVENTIONAL)
  if (!match) {
    reasons.push('not type(scope): description')
    return { kind: 'malformed', ok: false, type: null, reasons }
  }

  const [, type, , scope, , description] = match
  if (!COMMIT_TYPES.has(type)) reasons.push(`unknown type "${type}"`)
  if (scope !== undefined && scope.trim() === '') reasons.push('empty scope')
  if (description.trim() === '') reasons.push('empty description')
  if (text.length > SUBJECT_MAX) reasons.push(`${text.length} chars, over ${SUBJECT_MAX}`)

  return {
    kind: reasons.length === 0 ? 'conventional' : 'malformed',
    ok: reasons.length === 0,
    type,
    reasons,
  }
}

/**
 * Grade a range of commits against the frozen-subject ledger.
 *
 * Pure, and separated from the `git log` that feeds it, because the interesting
 * behaviour is not "which subjects are malformed" (classifyCommitSubject already
 * answers that) but the two-directional bookkeeping around it, and that is what
 * an exemption file gets wrong. Both directions are failures:
 *
 *   malformed   - a non-conforming subject in range that the ledger does NOT
 *                 name. This is the new one, and it is the point of the gate.
 *   staleLedger - a SHA the ledger names that is NOT in range. The entry has
 *                 outlived its measurement, so the file is now carrying a name
 *                 nobody checks. Left unchecked, an exemption list drifts into
 *                 a list of assertions about commits that are no longer there.
 *
 * A ledger entry is matched by full SHA and nothing else. Matching on the
 * subject text would let a second commit reuse the exemption by copying the
 * message, which is exactly how the offending subjects got here: a loop
 * writing the same shape over and over.
 *
 * @param {Array<{sha: string, subject: string}>} commits oldest-or-newest first, order is not read
 * @param {Record<string, {subject?: string}>} frozen ledger `known` map, keyed by full SHA
 */
export function applySubjectLedger(commits, frozen = {}) {
  const inRange = new Set()
  const malformed = []

  for (const { sha, subject } of commits) {
    inRange.add(sha)
    const verdict = classifyCommitSubject(subject)
    if (verdict.ok || frozen[sha]) continue
    malformed.push({ sha: sha.slice(0, 9), subject, reasons: verdict.reasons })
  }

  const staleLedger = Object.keys(frozen)
    .filter((sha) => !inRange.has(sha))
    .map((sha) => ({ sha: sha.slice(0, 9), subject: frozen[sha]?.subject ?? '' }))

  return { malformed, staleLedger, frozenCount: Object.keys(frozen).length }
}

/**
 * Every npm script a person could run, and whether README.md accounts for it.
 *
 * WHY THIS IS A DIMENSION AND NOT A SENTENCE IN THE REPORT. The 2026-09-09 run
 * of this audit asserted that README's table "covers all 29 scripts". By
 * 2026-09-10 there were 44 and 26 of them were unmentioned -- the claim decayed
 * in one day, because nothing was measuring it. A README is the one document
 * whose accuracy nobody notices decaying, since the people who would notice are
 * the ones who have not arrived yet.
 *
 * COVERAGE IS NOT "THE NAME APPEARS". Three routes count, because a table with
 * 44 rows is not a README, it is package.json reformatted:
 *
 *   1. named    - README names the script.
 *   2. family   - README names its base, the part before the first `:`. A row
 *                 for `pnpm seed` accounts for `seed:sql` and `seed:clean-sql`,
 *                 which are the same command with a flag.
 *   3. same file - the script runs only local script files that documented
 *                 scripts already run. This is what makes the `lint:*` aliases
 *                 free: `pnpm lint` runs `node scripts/copy-gate.mjs` inline,
 *                 so `lint:copy` is a shortcut to something already described,
 *                 not a second thing to learn.
 *
 * `prepare` is exempt by name and it is the only one. The package manager runs
 * it on install; documenting it would tell a reader about a command they will
 * never type. Every other exemption should be a README row instead.
 */
const README_EXEMPT_SCRIPTS = new Set(['prepare'])
const SCRIPT_FILE = /(?:scripts|src|e2e|supabase)\/[A-Za-z0-9_./-]+/g

export function scanReadmeScriptCoverage(scripts, readme) {
  const names = Object.keys(scripts)
  const isNamed = (name) =>
    new RegExp(`(^|[^a-z0-9:_-])${name.replace(/:/g, '[:]')}($|[^a-z0-9:_-])`, 'm').test(readme)
  const filesOf = (body) => [...String(body).matchAll(SCRIPT_FILE)].map((m) => m[0])

  const documented = new Set(names.filter(isNamed))
  const documentedFiles = new Set()
  for (const name of documented)
    for (const file of filesOf(scripts[name])) documentedFiles.add(file)

  const uncovered = []
  for (const name of names) {
    if (README_EXEMPT_SCRIPTS.has(name) || documented.has(name)) continue
    if (isNamed(name.split(':')[0])) continue
    const files = filesOf(scripts[name])
    if (files.length > 0 && files.every((f) => documentedFiles.has(f))) continue
    uncovered.push({ script: name, body: String(scripts[name]) })
  }

  return { uncovered, documentedCount: documented.size, total: names.length }
}

/**
 * Components under src/components that nothing imports.
 *
 * WHY THIS IS A RATCHET AND NOT A BUDGET OF ZERO. There are 21 of them today,
 * out of 192. Demanding zero would make the gate red the day it is written, and
 * this repo's own doctrine on that is written at the top of
 * supabase/catalogue-known-issues.json: a gate that is red on arrival gets
 * deleted rather than fixed. Worse, the fix for a dead component is deletion,
 * and deleting a file is not this gate's decision to force -- six of the 21 are
 * an earlier generation of the homepage that `store/` still documents, and two
 * are cited by name in scripts/rtl-logical-scan.mjs's island list and in three
 * other files' comments.
 *
 * So the number is frozen and the NEXT one is refused. That is worth more than
 * it sounds: a component with no importer is the single most common defect
 * shape in this project's history -- a finished feature nobody wired up -- and
 * until now nothing counted them at all. A ratchet at 21 means the twenty-second
 * cannot arrive quietly.
 *
 * WHAT COUNTS AS AN IMPORT, and the two ways a naive version gets this wrong:
 *
 *   - A file must not match itself. `ui/dropdown-menu.tsx` imports
 *     `@radix-ui/react-dropdown-menu`, and a pattern of "some path ending in
 *     dropdown-menu" reads that as its own importer. It did, and the file
 *     dropped out of the findings.
 *   - The path segment must be whole. Matching a bare basename makes
 *     `Footer` a substring of `SiteFooter`, so a live component vouches for a
 *     dead one with a longer name.
 *
 * Test files are excluded from the population, not exempted from it: a `.test.tsx`
 * is imported by the runner and by nothing else by design.
 */
export function findUnimportedComponents(componentFiles, sources, readFile) {
  const basename = (file) => file.replace(/^.*\//, '').replace(/\.tsx$/, '')
  const quoteRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const dead = []
  for (const file of componentFiles) {
    // The leading `/` is what keeps `Footer` from matching `SiteFooter`.
    const pattern = new RegExp(
      `(?:from|import)\\s*\\(?\\s*['"][^'"]*/${quoteRegex(basename(file))}['"]`,
    )
    const imported = sources.some((source) => source !== file && pattern.test(readFile(source)))
    if (!imported) dead.push(file)
  }
  return dead
}
