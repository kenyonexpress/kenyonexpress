/**
 * Pure decisions for the daily backup-health watchdog (STEP 38).
 *
 * The backup pipeline in this directory has one failure mode its own
 * notifications cannot see: not running. db-backup.yml notifies ntfy on a
 * failed step, but a workflow that is `skipped` on its `if:` (DB_BACKUP_ENABLED
 * unset), paused by GitHub after 60 idle days, or never merged to `main`
 * finishes green or does not finish at all, and nobody hears anything. Measured
 * on 2026-09-10 and again on 2026-10-08: every scheduled db-backup run to date
 * is `skipped`, and the drill has run zero times.
 *
 * So the watchdog reads three independent legs and reports on each:
 *
 *   1. GitHub Actions: the newest completed db-backup and db-restore-drill
 *      runs, their conclusions and their ages. Needs only the runner's own
 *      GITHUB_TOKEN, so this leg can never be unconfigured.
 *   2. Supabase platform: the newest COMPLETED physical backup and whether PITR
 *      is enabled (management API; optional, needs SUPABASE_ACCESS_TOKEN).
 *   3. R2: the newest dump under postgres/ (optional, needs BACKUP_R2_*).
 *
 * A leg without credentials is reported as "unverified", never as healthy.
 * Everything here is side-effect free; the fetches live in backup-health.mjs.
 */

import { latestDumpKey, parseBackupTimestamp } from './backup-lib.mjs'

/** No dump or platform backup newer than this is an incident (DR doc watchdog line). */
export const STALE_HOURS = 36

/** A quarter plus eight days of GitHub cron drift before the drill counts as overdue. */
export const DRILL_OVERDUE_DAYS = 100

/** Weekly heartbeat day (UTC): a monitor nobody hears from is indistinguishable from a dead one. */
export const HEARTBEAT_UTC_DAY = 1 // Monday

const HOUR = 3_600_000
const DAY = 24 * HOUR

const FAIL = 'fail'
const WARN = 'warn'
const INFO = 'info'

const hours = (ms) => Math.round(ms / HOUR)
const days = (ms) => Math.round(ms / DAY)

/** The newest run with `status === 'completed'`, or null. Runs may arrive in any order. */
export function newestCompletedRun(runs) {
  let best = null
  for (const run of runs ?? []) {
    if (run?.status !== 'completed') continue
    const t = Date.parse(run.created_at ?? '')
    if (Number.isNaN(t)) continue
    if (!best || t > Date.parse(best.created_at)) best = run
  }
  return best
}

/** The newest run with conclusion `success`, or null. */
export function newestSuccessfulRun(runs) {
  let best = null
  for (const run of runs ?? []) {
    if (run?.status !== 'completed' || run.conclusion !== 'success') continue
    const t = Date.parse(run.created_at ?? '')
    if (Number.isNaN(t)) continue
    if (!best || t > Date.parse(best.created_at)) best = run
  }
  return best
}

/** Instant of the newest COMPLETED platform backup in a management-API `backups` list, or null. */
export function newestCompletedPlatformBackup(backups) {
  let best = null
  for (const b of backups ?? []) {
    if (b?.status !== 'COMPLETED') continue
    const t = Date.parse(b.inserted_at ?? '')
    if (Number.isNaN(t)) continue
    if (best === null || t > best) best = t
  }
  return best === null ? null : new Date(best)
}

function assessGithubLeg(findings, { now, backupRuns, drillRuns }) {
  if (backupRuns === null || backupRuns === undefined) {
    findings.push({
      level: WARN,
      code: 'github_unverified',
      text: 'GitHub Actions API not reachable; db-backup run history unverified',
    })
  } else {
    const latest = newestCompletedRun(backupRuns)
    if (!latest) {
      findings.push({
        level: FAIL,
        code: 'backup_never_ran',
        text: 'db-backup.yml has no completed run; the daily dump has never happened',
      })
    } else if (latest.conclusion === 'skipped') {
      findings.push({
        level: FAIL,
        code: 'backup_skipped',
        text: `db-backup.yml was skipped on ${latest.created_at}: DB_BACKUP_ENABLED is not "true", so zero dumps are written (${latest.html_url ?? ''})`.trim(),
      })
    } else if (latest.conclusion !== 'success') {
      findings.push({
        level: FAIL,
        code: 'backup_failed',
        text: `db-backup.yml newest run concluded "${latest.conclusion}" on ${latest.created_at} (${latest.html_url ?? ''})`.trim(),
      })
    } else {
      const age = now.getTime() - Date.parse(latest.created_at)
      if (age > STALE_HOURS * HOUR) {
        findings.push({
          level: FAIL,
          code: 'backup_stale',
          text: `newest successful db-backup run is ${hours(age)}h old (limit ${STALE_HOURS}h); the schedule has stopped`,
        })
      } else {
        findings.push({
          level: INFO,
          code: 'backup_ok',
          text: `db-backup.yml succeeded ${hours(age)}h ago`,
        })
      }
    }
  }

  if (drillRuns === null || drillRuns === undefined) {
    findings.push({
      level: WARN,
      code: 'drill_unverified',
      text: 'GitHub Actions API not reachable; restore-drill history unverified',
    })
    return
  }
  const drill = newestSuccessfulRun(drillRuns)
  if (!drill) {
    findings.push({
      level: WARN,
      code: 'drill_never_passed',
      text: 'db-restore-drill.yml has never passed; no dump has ever been proven restorable',
    })
    return
  }
  const age = now.getTime() - Date.parse(drill.created_at)
  if (age > DRILL_OVERDUE_DAYS * DAY) {
    findings.push({
      level: WARN,
      code: 'drill_overdue',
      text: `last passing restore drill is ${days(age)} days old (quarterly, limit ${DRILL_OVERDUE_DAYS}d)`,
    })
  } else {
    findings.push({
      level: INFO,
      code: 'drill_ok',
      text: `restore drill passed ${days(age)} days ago`,
    })
  }
}

function assessPlatformLeg(findings, { now, platform }) {
  if (platform === null || platform === undefined) {
    findings.push({
      level: INFO,
      code: 'platform_unverified',
      text: 'Supabase platform backups unverified (no SUPABASE_ACCESS_TOKEN)',
    })
    return
  }
  if (platform.error) {
    findings.push({
      level: WARN,
      code: 'platform_error',
      text: `Supabase management API error: ${platform.error}`,
    })
    return
  }
  const newest = newestCompletedPlatformBackup(platform.backups)
  const completed = (platform.backups ?? []).filter((b) => b?.status === 'COMPLETED').length
  if (!newest) {
    findings.push({
      level: FAIL,
      code: 'platform_backup_missing',
      text: 'Supabase reports no COMPLETED platform backup',
    })
  } else {
    const age = now.getTime() - newest.getTime()
    if (age > STALE_HOURS * HOUR) {
      findings.push({
        level: FAIL,
        code: 'platform_backup_stale',
        text: `newest Supabase platform backup is ${hours(age)}h old (limit ${STALE_HOURS}h)`,
      })
    } else {
      findings.push({
        level: INFO,
        code: 'platform_backup_ok',
        text: `Supabase platform backup ${hours(age)}h old, ${completed} completed in the window`,
      })
    }
  }
  if (platform.pitr_enabled === true) {
    findings.push({ level: INFO, code: 'pitr_enabled', text: 'PITR is enabled' })
  } else {
    findings.push({
      level: WARN,
      code: 'pitr_disabled',
      text: 'PITR is NOT enabled: RPO is 24h; enable with `node scripts/dr/pitr.mjs --enable --yes` (paid add-on)',
    })
  }
  if (platform.walg_enabled === false) {
    findings.push({
      level: WARN,
      code: 'walg_disabled',
      text: 'WAL archiving (walg) is off on the platform',
    })
  }
}

function assessR2Leg(findings, { now, r2Keys }) {
  if (r2Keys === null || r2Keys === undefined) {
    findings.push({
      level: INFO,
      code: 'r2_unverified',
      text: 'R2 backup bucket unverified (no BACKUP_R2_* credentials)',
    })
    return
  }
  if (r2Keys.error) {
    findings.push({ level: WARN, code: 'r2_error', text: `R2 list error: ${r2Keys.error}` })
    return
  }
  const key = latestDumpKey(r2Keys)
  if (!key) {
    findings.push({
      level: FAIL,
      code: 'r2_empty',
      text: 'R2 backup bucket holds no dump under postgres/',
    })
    return
  }
  const age = now.getTime() - parseBackupTimestamp(key).getTime()
  const count = r2Keys.filter((k) => k.endsWith('.dump') && parseBackupTimestamp(k)).length
  if (age > STALE_HOURS * HOUR) {
    findings.push({
      level: FAIL,
      code: 'r2_stale',
      text: `newest R2 dump ${key} is ${hours(age)}h old (limit ${STALE_HOURS}h)`,
    })
  } else {
    findings.push({
      level: INFO,
      code: 'r2_ok',
      text: `newest R2 dump ${key} is ${hours(age)}h old, ${count} dumps retained`,
    })
  }
}

/**
 * The verdict. `healthy` is false on any `fail`; warns never flip it, they
 * ride on the weekly heartbeat (see notifyPolicy). Finding order is the leg
 * order above so the ntfy body reads top-down from "is the dump running".
 */
export function assessBackupHealth({
  now = new Date(),
  backupRuns = null,
  drillRuns = null,
  platform = null,
  r2Keys = null,
} = {}) {
  const findings = []
  assessGithubLeg(findings, { now, backupRuns, drillRuns })
  assessPlatformLeg(findings, { now, platform })
  assessR2Leg(findings, { now, r2Keys })
  const fails = findings.filter((f) => f.level === FAIL)
  const warns = findings.filter((f) => f.level === WARN)
  return { healthy: fails.length === 0, fails, warns, findings, checkedAt: now.toISOString() }
}

/**
 * When to page. Fails: every run (daily). Otherwise only on the heartbeat
 * day, carrying any warns, so a silent week means the monitor itself died.
 */
export function notifyPolicy(assessment, now = new Date()) {
  if (!assessment.healthy) {
    return {
      send: true,
      priority: 'high',
      title: `KE backups UNHEALTHY (${assessment.fails.length})`,
    }
  }
  if (now.getUTCDay() === HEARTBEAT_UTC_DAY) {
    const warnNote = assessment.warns.length ? `, ${assessment.warns.length} warnings` : ''
    return { send: true, priority: 'default', title: `KE backups healthy${warnNote}` }
  }
  return { send: false, priority: 'default', title: '' }
}

const MARK = { fail: 'FAIL', warn: 'WARN', info: 'ok' }

/** Plain-text body for ntfy: one finding per line, fails first, bounded. */
export function formatNtfyBody(assessment, { maxChars = 1500 } = {}) {
  const ordered = [
    ...assessment.fails,
    ...assessment.warns,
    ...assessment.findings.filter((f) => f.level === INFO),
  ]
  const lines = ordered.map((f) => `${MARK[f.level]} ${f.text}`)
  let body = lines.join('\n')
  if (body.length > maxChars) body = `${body.slice(0, maxChars - 1)}…`
  return body
}

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function formatSummary(assessment) {
  const rows = assessment.findings.map(
    (f) => `| ${MARK[f.level]} | \`${f.code}\` | ${f.text.replace(/\|/g, '\\|')} |`,
  )
  return [
    `## Backup health: ${assessment.healthy ? 'healthy' : 'UNHEALTHY'}`,
    `checked ${assessment.checkedAt}; ${assessment.fails.length} fail, ${assessment.warns.length} warn`,
    '',
    '| level | code | finding |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}
