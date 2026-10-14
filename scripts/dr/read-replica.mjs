#!/usr/bin/env node
/**
 * Read replicas on the hosted Supabase project: see them, watch their lag,
 * add one, remove one.
 *
 *   node scripts/dr/read-replica.mjs [--status] [--keychain] [--json]
 *   node scripts/dr/read-replica.mjs --lag [--warn=5] [--fail=30] [--no-notify] [--keychain] [--json]
 *   node scripts/dr/read-replica.mjs --setup [--region=eu-north-1] --yes [--keychain]
 *   node scripts/dr/read-replica.mjs --remove --identifier=<ref>-rr-<region>-<suffix> --yes [--keychain]
 *
 * --status (default) reads `pg_stat_replication` on the primary through the
 * management API and, when a service key is present, the project's Prometheus
 * endpoint for each replica's own lag. Read-only. Prints the setup plan too.
 *
 * --lag is the watchdog form (.github/workflows/replica-lag.yml): the same
 * reads, then scripts/dr/read-replica-lib.mjs decides ok / warn / fail, ntfy
 * is paged per notifyPolicy, and the exit code is 1 on fail so the run is
 * red. With no replica and no SUPABASE_READ_REPLICA_URL it prints `none` and
 * exits 0: nothing to monitor is not a failure.
 *
 * --setup POSTs read-replicas/setup. A replica is a RECURRING CHARGE (it runs
 * on the primary's compute size, hourly, plus 1.25x the primary's disk;
 * compute credits and the spend cap do not cover it), so it refuses without
 * --yes and prints the plan first. --remove is the mirror; it refuses without
 * --yes because removing the last replica also removes the load balancer the
 * app's SUPABASE_READ_REPLICA_URL may point at.
 *
 * Tokens: SUPABASE_ACCESS_TOKEN (management), or the Supabase CLI keychain
 * entry with --keychain. SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * unlocks the metrics leg; without it the primary-side lag alone is used.
 */

import {
  DEFAULT_REPLICA_REGION,
  LAG_FAIL_SECONDS,
  LAG_WARN_SECONDS,
  assessReplicaLag,
  formatNtfyBody,
  formatStatus,
  notifyPolicy,
  planReplicaSetup,
} from './read-replica-lib.mjs'
import {
  addonsPath,
  backupsPath,
  databaseQueryPath,
  fetchMetricsText,
  managementToken,
  mgmtGet,
  mgmtPost,
  projectPath,
  projectRef,
  readReplicaRemovePath,
  readReplicaSetupPath,
} from './supabase-mgmt.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (name, fallback) =>
  argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback

const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

const env = process.env
const token = managementToken(env, { allowKeychain: has('--keychain') })
if (!token)
  fail(
    'no SUPABASE_ACCESS_TOKEN in env (or pass --keychain on a Mac with the Supabase CLI logged in)',
  )
const ref = projectRef(env)
const serviceKey = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '')
  .trim()
  .replace(/^"|"$/g, '')
const replicaUrl = env.SUPABASE_READ_REPLICA_URL?.trim() || null

const PG_STAT_SQL =
  'select application_name, state, sync_state, replay_lag::text as replay_lag, ' +
  'pg_wal_lsn_diff(sent_lsn, replay_lsn) as replay_bytes from pg_stat_replication;'

async function queryPrimary(sql) {
  try {
    return await mgmtPost(token, databaseQueryPath(ref), { query: sql })
  } catch (e) {
    console.error(`primary query failed: ${e.message}`)
    return null
  }
}

async function readMetrics() {
  if (!serviceKey) return null
  try {
    return await fetchMetricsText(ref, serviceKey)
  } catch (e) {
    console.error(`metrics leg skipped: ${e.message}`)
    return null
  }
}

async function notify(topic, { title, body, priority }) {
  if (!topic) return false
  try {
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        title,
        priority,
        tags: priority === 'high' ? 'rotating_light' : 'hourglass_flowing_sand',
      },
      body,
      signal: AbortSignal.timeout(8_000),
    })
    return res.ok
  } catch {
    return false
  }
}

if (has('--setup')) {
  const region = opt('--region', DEFAULT_REPLICA_REGION)
  const [project, addons, backups] = await Promise.all([
    mgmtGet(token, projectPath(ref)),
    mgmtGet(token, addonsPath(ref)),
    mgmtGet(token, backupsPath(ref)),
  ])
  const plan = planReplicaSetup({ project, addons, backups, region })
  console.log(JSON.stringify(plan, null, 2))
  if (plan.blockers.length) fail(`refusing: ${plan.blockers.join(', ')}`)
  if (!has('--yes')) {
    console.log(
      '\nThis provisions a read replica billed hourly at the primary compute size plus 1.25x disk,',
    )
    console.log('outside compute credits and the spend cap. Re-run with --yes to proceed.')
    process.exit(2)
  }
  await mgmtPost(token, readReplicaSetupPath(ref), plan.request.body)
  console.log(`setup requested in ${region}; watch --status until it streams, then set`)
  console.log(`SUPABASE_READ_REPLICA_URL=https://${ref}-all.supabase.co in Vercel (Production).`)
  process.exit(0)
}

if (has('--remove')) {
  const identifier = opt('--identifier', '')
  if (!identifier.startsWith(`${ref}-rr-`))
    fail(`--identifier must be a replica id (${ref}-rr-<region>-<suffix>)`)
  if (replicaUrl) {
    console.log(`SUPABASE_READ_REPLICA_URL is set here (${replicaUrl}).`)
    console.log('Removing the last replica removes the load balancer behind it; unset the')
    console.log('variable in Vercel first or the catalogue reads a dead endpoint.')
  }
  if (!has('--yes')) {
    console.log(`would POST read-replicas/remove { database_identifier: ${identifier} }`)
    console.log('Re-run with --yes to proceed.')
    process.exit(2)
  }
  await mgmtPost(token, readReplicaRemovePath(ref), { database_identifier: identifier })
  console.log(`removal requested for ${identifier}`)
  process.exit(0)
}

// --status (default) and --lag share the reads.
const [pgStat, metricsText] = await Promise.all([queryPrimary(PG_STAT_SQL), readMetrics()])
const warnSeconds = Number(opt('--warn', LAG_WARN_SECONDS))
const failSeconds = Number(opt('--fail', LAG_FAIL_SECONDS))
const assessment = assessReplicaLag({
  ref,
  pgStat,
  metricsText,
  replicaUrl,
  warnSeconds,
  failSeconds,
})

if (has('--lag')) {
  const policy = notifyPolicy(assessment)
  if (has('--json')) console.log(JSON.stringify({ assessment, policy }, null, 2))
  else console.log(formatStatus(assessment, { ref, replicaUrl }))
  if (env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Read replica lag\n\n\`\`\`\n${formatStatus(assessment, { ref, replicaUrl })}\n\`\`\`\n`,
    )
  }
  if (policy.notify && !has('--no-notify')) {
    const ok = await notify(env.NTFY_TOPIC, {
      title: `KenyonExpress read replica ${assessment.status}`,
      body: formatNtfyBody(assessment),
      priority: policy.priority,
    })
    if (!ok) console.error('ntfy page not delivered')
  }
  process.exit(policy.exitCode)
}

const [project, addons, backups] = await Promise.all([
  mgmtGet(token, projectPath(ref)).catch(() => null),
  mgmtGet(token, addonsPath(ref)).catch(() => null),
  mgmtGet(token, backupsPath(ref)).catch(() => null),
])
const plan = planReplicaSetup({ project, addons, backups, region: opt('--region', undefined) })
if (has('--json')) {
  console.log(JSON.stringify({ assessment, plan, metricsLeg: metricsText !== null }, null, 2))
} else {
  console.log(formatStatus(assessment, { ref, replicaUrl }))
  console.log(`metrics leg: ${metricsText !== null ? 'read' : 'skipped (no service key)'}`)
  console.log(
    `setup plan: region ${plan.region} (primary ${plan.primaryRegion ?? '?'}, ${
      plan.sameRegionAsPrimary ? 'same region' : 'cross-region'
    }), compute ${plan.computeVariant ?? 'nano (no add-on)'}, pitr ${plan.pitrEnabled}`,
  )
  if (plan.notes.length) console.log(`  notes: ${plan.notes.join(', ')}`)
}
