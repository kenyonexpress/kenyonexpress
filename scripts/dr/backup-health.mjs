#!/usr/bin/env node
/**
 * Daily backup-health watchdog (STEP 38). Runs from
 * .github/workflows/backup-health.yml and from a laptop.
 *
 * Reads three legs, decides with scripts/dr/health-lib.mjs, writes the
 * step summary, pages ntfy per notifyPolicy (fails daily, heartbeat weekly),
 * and exits 1 on any fail so the run itself is red too.
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo            (Actions leg)
 *   SUPABASE_ACCESS_TOKEN=... [SUPABASE_PROJECT_REF=...]       (platform leg, optional)
 *   BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_ACCESS_KEY_ID=...       (R2 leg, optional)
 *   BACKUP_R2_SECRET_ACCESS_KEY=... BACKUP_R2_BUCKET=...
 *   NTFY_TOPIC=...                                             (paging, optional)
 *   node scripts/dr/backup-health.mjs [--no-notify] [--keychain] [--json]
 *
 * --keychain lets a laptop use the Supabase CLI's keychain token for the
 * platform leg (and `gh auth token` for GITHUB_TOKEN if it is unset). CI never
 * passes it. --no-notify evaluates without paging; --json prints the raw
 * assessment for other tools.
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { BACKUP_PREFIX } from './backup-lib.mjs'
import { assessBackupHealth, formatNtfyBody, formatSummary, notifyPolicy } from './health-lib.mjs'
import { r2ConfigFromEnv, r2List } from './r2.mjs'
import { backupsPath, managementToken, mgmtGet, projectRef } from './supabase-mgmt.mjs'

const args = new Set(process.argv.slice(2))
const noNotify = args.has('--no-notify')
const allowKeychain = args.has('--keychain')
const asJson = args.has('--json')
const env = process.env

const GH_API = 'https://api.github.com'

function githubToken() {
  if (env.GITHUB_TOKEN?.trim()) return env.GITHUB_TOKEN.trim()
  if (!allowKeychain) return null
  const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

function githubRepo() {
  if (env.GITHUB_REPOSITORY?.trim()) return env.GITHUB_REPOSITORY.trim()
  if (!allowKeychain) return null
  const r = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    encoding: 'utf8',
  })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Newest 10 runs of a workflow file, or null when the API cannot be read. */
async function fetchRuns(token, repo, workflowFile) {
  if (!token || !repo) return null
  try {
    const res = await fetch(
      `${GH_API}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=10`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'kenyonexpress-backup-health',
        },
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!res.ok) {
      console.error(`.. GitHub runs for ${workflowFile}: ${res.status}`)
      return null
    }
    const json = await res.json()
    return (json.workflow_runs ?? []).map((r) => ({
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.created_at,
      html_url: r.html_url,
    }))
  } catch (e) {
    console.error(`.. GitHub runs for ${workflowFile}: ${e.message}`)
    return null
  }
}

async function fetchPlatform() {
  const token = managementToken(env, { allowKeychain })
  if (!token) return null
  try {
    const json = await mgmtGet(token, backupsPath(projectRef(env)))
    return {
      pitr_enabled: json.pitr_enabled,
      walg_enabled: json.walg_enabled,
      backups: json.backups ?? [],
    }
  } catch (e) {
    return { error: e.message }
  }
}

async function fetchR2Keys() {
  let cfg
  try {
    cfg = r2ConfigFromEnv(env)
  } catch {
    return null
  }
  try {
    return await r2List(cfg, BACKUP_PREFIX)
  } catch (e) {
    const keys = []
    keys.error = e.message
    return keys
  }
}

async function sendNtfy({ topic, title, priority, body }) {
  try {
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { title, priority, tags: priority === 'high' ? 'rotating_light' : 'floppy_disk' },
      body,
      signal: AbortSignal.timeout(8_000),
    })
    return res.ok
  } catch {
    return false
  }
}

const token = githubToken()
const repo = githubRepo()
const [backupRuns, drillRuns, platform, r2Keys] = await Promise.all([
  fetchRuns(token, repo, 'db-backup.yml'),
  fetchRuns(token, repo, 'db-restore-drill.yml'),
  fetchPlatform(),
  fetchR2Keys(),
])

const now = new Date()
const assessment = assessBackupHealth({ now, backupRuns, drillRuns, platform, r2Keys })

if (asJson) {
  console.log(JSON.stringify(assessment, null, 2))
} else {
  for (const f of assessment.findings) console.log(`${f.level.padEnd(4)} ${f.code}: ${f.text}`)
  console.log(
    assessment.healthy
      ? 'ok backups healthy'
      : `error backups UNHEALTHY (${assessment.fails.length} fail)`,
  )
}

if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, formatSummary(assessment))

const policy = notifyPolicy(assessment, now)
if (policy.send && !noNotify) {
  const topic = env.NTFY_TOPIC?.trim()
  if (!topic) {
    console.error('.. notify requested but NTFY_TOPIC is unset; nobody was paged')
  } else {
    const delivered = await sendNtfy({
      topic,
      title: policy.title,
      priority: policy.priority,
      body: formatNtfyBody(assessment),
    })
    console.log(
      delivered
        ? `ok ntfy ${topic}: ${policy.title}`
        : `.. ntfy ${topic} did not accept the message`,
    )
  }
}

process.exit(assessment.healthy ? 0 : 1)
