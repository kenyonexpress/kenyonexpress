/**
 * The pure half of the deploy pipeline: smoke verdicts, rollback target
 * selection and incident text. No network, no env reads, no process exit, so
 * `lib.test.mjs` can prove every branch before a deploy depends on one.
 *
 * The CLIs (`smoke.mjs`, `promote.mjs`, `rollback.mjs`) are thin wrappers that
 * fetch, call in here, and print. Anything that decides something lives here.
 */

import { classify as classifyCron } from '../deployed-cron-probe.mjs'

/** Paths every deployment must answer 200 before it is trusted with traffic. */
export const PAGE_PATHS = ['/', '/robots.txt', '/sitemap.xml']

/** The health route: 200 plus `{"ok":true}`; a 503 there is the database. */
export const HEALTH_PATH = '/api/health'

/**
 * One probe result. `kind` decides how `status` is read:
 *   page   -> 200 only
 *   health -> 200 and a JSON body with ok === true
 *   cron   -> deployed-cron-probe's classify: 401/403 healthy, 404 missing,
 *             200 is the WORSE failure (a mutating route with no bearer)
 */
export function judgeProbe(probe) {
  const { kind, path, status } = probe
  if (kind === 'cron') {
    const { ok, verdict } = classifyCron(status)
    return { path, kind, status, ok, reason: ok ? null : verdict }
  }
  if (kind === 'health') {
    if (status !== 200) return { path, kind, status, ok: false, reason: `status-${status}` }
    let body
    try {
      body = typeof probe.body === 'string' ? JSON.parse(probe.body) : probe.body
    } catch {
      return { path, kind, status, ok: false, reason: 'health-body-not-json' }
    }
    if (!body || body.ok !== true) {
      return { path, kind, status, ok: false, reason: `health-not-ok:${body?.database ?? '?'}` }
    }
    return { path, kind, status, ok: true, reason: null }
  }
  if (status === 200) return { path, kind, status, ok: true, reason: null }
  return {
    path,
    kind,
    status,
    ok: false,
    reason: status === 0 ? 'no-response' : `status-${status}`,
  }
}

/**
 * The verdict on a whole deployment. `ok` only when EVERY probe passed; a
 * deployment that serves its home page and 404s three cron routes is the exact
 * case production-smoke.yml already reported as healthy for three days.
 */
export function evaluateSmoke(probes) {
  const results = probes.map(judgeProbe)
  const failures = results.filter((r) => !r.ok)
  return { ok: failures.length === 0, results, failures }
}

/**
 * The deployment to roll back TO. Newest READY production deployment that is
 * not the one currently serving, and not one that itself was the subject of a
 * rollback in this run (passed in `exclude`), so two consecutive bad deploys
 * do not ping-pong between each other.
 *
 * `deployments` is the `deployments` array from Vercel's
 * `GET /v6/deployments?target=production`, newest first, but sorted here again
 * because the API's ordering is a documented default and not a contract.
 */
export function pickRollbackTarget(deployments, currentId, exclude = []) {
  const skip = new Set([currentId, ...exclude].filter(Boolean))
  const ready = deployments
    .filter((d) => (d.readyState ?? d.state) === 'READY')
    .filter((d) => (d.target ?? 'production') === 'production')
    .filter((d) => !skip.has(d.uid ?? d.id))
    .sort((a, b) => (b.createdAt ?? b.created ?? 0) - (a.createdAt ?? a.created ?? 0))
  return ready[0] ?? null
}

/**
 * The blue-green decision after the production smoke that follows a promote.
 *   - smoke passed                 -> keep
 *   - smoke failed, target exists  -> rollback to target
 *   - smoke failed, no target      -> alert-only (nothing older is READY)
 */
export function decideAfterPromote({ smoke, target }) {
  if (smoke.ok) return { action: 'keep', target: null }
  if (target) return { action: 'rollback', target }
  return { action: 'alert-only', target: null }
}

/** `bot123:abc` in an error or URL must never reach a log. */
export function redactSecrets(text) {
  return String(text)
    .replace(/\/bot[^/\s]+/g, '/bot[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9_\-.]+/g, '$1[redacted]')
}

const SHORT_SHA = (sha) => (sha ? String(sha).slice(0, 7) : null)

/**
 * The Telegram/ntfy body for a deploy incident. English title on the first
 * line (Telegram has no title field; ntfy's Title header is ASCII only), Hebrew
 * body, identifiers only: a deployment id, a short sha and a run URL are handles
 * for looking the incident up, never the incident itself. No env names, no
 * response bodies, no error strings from the platform.
 */
export function formatDeployIncident(args) {
  const { kind, environment = 'production', url, sha, deploymentId, failures = [] } = args
  const { rollbackTo, runUrl } = args
  const titles = {
    'smoke-failed': 'KE deploy: smoke failed',
    'rolled-back': 'KE deploy: rolled back',
    'rollback-failed': 'KE deploy: ROLLBACK FAILED',
    'no-rollback-target': 'KE deploy: smoke failed, nothing to roll back to',
    promoted: 'KE deploy: promoted',
    'preview-rejected': 'KE deploy: preview rejected, not promoted',
  }
  const bodies = {
    'smoke-failed': 'בדיקת ה-smoke אחרי הפריסה נכשלה.',
    'rolled-back': 'הפריסה נכשלה בבדיקת ה-smoke והוחזרה לפריסה הקודמת.',
    'rollback-failed': 'הפריסה נכשלה וגם ההחזרה לפריסה הקודמת נכשלה. נדרשת התערבות ידנית עכשיו.',
    'no-rollback-target': 'הפריסה נכשלה ואין פריסה קודמת תקינה להחזיר אליה.',
    promoted: 'הפריסה עברה את בדיקת ה-preview וקודמה לפרודקשן.',
    'preview-rejected': 'ה-preview נכשל בבדיקת ה-smoke ולא קודם. הפרודקשן לא נגע.',
  }
  const title = titles[kind] ?? `KE deploy: ${kind}`
  const lines = [title, bodies[kind] ?? '', `סביבה: ${environment}`]
  if (url) lines.push(`כתובת: ${url}`)
  if (deploymentId) lines.push(`פריסה: ${deploymentId}`)
  if (SHORT_SHA(sha)) lines.push(`commit: ${SHORT_SHA(sha)}`)
  if (rollbackTo) {
    const id = rollbackTo.uid ?? rollbackTo.id ?? rollbackTo
    lines.push(`הוחזר אל: ${id}`)
  }
  if (failures.length > 0) {
    lines.push('נכשל:')
    for (const f of failures.slice(0, 8)) {
      lines.push(`  ${f.path} -> ${f.status}${f.reason ? ` (${f.reason})` : ''}`)
    }
    if (failures.length > 8) lines.push(`  ועוד ${failures.length - 8}`)
  }
  if (runUrl) lines.push(`ריצה: ${runUrl}`)
  return redactSecrets(lines.filter((l) => l !== '').join('\n'))
}

/** The priority the incident deserves: only a failed rollback is urgent. */
export function incidentPriority(kind) {
  if (kind === 'rollback-failed' || kind === 'no-rollback-target') return 'urgent'
  if (kind === 'promoted') return 'default'
  return 'high'
}

/**
 * The probe list for a base URL. Cron paths come from the registry so a job
 * added to scripts/cron-jobs.json is probed on the next deploy without anyone
 * touching this file.
 */
export function probePlan(registryJobs) {
  return [
    ...PAGE_PATHS.map((path) => ({ kind: 'page', path })),
    { kind: 'health', path: HEALTH_PATH },
    ...registryJobs.map((job) => ({ kind: 'cron', path: job.path })),
  ]
}

/** `https://x.vercel.app/` and `x.vercel.app` both become `https://x.vercel.app`. */
export function normalizeBase(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}
