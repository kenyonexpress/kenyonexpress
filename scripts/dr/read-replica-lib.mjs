/**
 * Read-replica status, lag assessment and setup planning. Pure functions over
 * the documents the CLI (read-replica.mjs) fetches, so every rule here is
 * unit-tested without a token.
 *
 * Three sources, measured on the production project on 2026-10-14:
 *
 *  1. `pg_stat_replication` on the PRIMARY, through the management API's
 *     `database/query`. One row per streaming replica; `application_name` is
 *     the replica's database identifier (`<ref>-rr-<region>-<suffix>`),
 *     `replay_lag` the primary-side lag as a Postgres interval. Empty today.
 *  2. The project's Prometheus endpoint
 *     (`/customer/v1/privileged/metrics`, service_role Basic auth). One row per
 *     database under the `supabase_identifier` label. The primary reports
 *     itself with its own ref; a replica reports under its identifier with
 *     `physical_replication_lag_physical_replication_lag_seconds` (replica-side
 *     seconds behind), `physical_replication_lag_is_connected_to_primary` and
 *     `physical_replication_lag_is_wal_replay_paused`. Today the only row is
 *     the primary's, with lag 0 and connected 0 (it has no primary).
 *  3. The app's `SUPABASE_READ_REPLICA_URL`, which decides whether the
 *     catalogue is actually reading from a replica. A URL with no replica
 *     behind it is the worst state: every catalogue read goes to an endpoint
 *     Supabase has removed.
 *
 * Thresholds: a replica is WARN above 5 s and FAIL above 30 s of lag. The
 * catalogue reads behind it are `use cache` / ISR with minute-scale TTLs, so
 * seconds are invisible; 30 s is where a stale deal price becomes a complaint.
 */

import { COMPUTE_ORDER, MIN_COMPUTE_FOR_PITR } from './pitr-lib.mjs'

export const DEFAULT_REPLICA_REGION = 'eu-north-1'

/** The API's own words on 2026-10-14, kept verbatim so the plan can quote them. */
export const REPLICA_COMPUTE_FLOOR_MESSAGE = 'Read replicas require a minimum size of small'
export const MIN_COMPUTE_FOR_REPLICA = MIN_COMPUTE_FOR_PITR

/** True when the primary's compute add-on is Small or larger; null (no add-on) is Nano. */
export function computeMeetsReplicaFloor(computeVariant) {
  const rank = (v) => COMPUTE_ORDER.indexOf(v ?? 'ci_nano')
  return rank(computeVariant) >= rank(MIN_COMPUTE_FOR_REPLICA)
}

/** `SetUpReadReplicaBody.read_replica_region` enum, api.supabase.com/api/v1-json 2026-10-14. */
export const REPLICA_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-east-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-central-1',
  'eu-central-2',
  'ca-central-1',
  'ap-south-1',
  'sa-east-1',
]

export const LAG_WARN_SECONDS = 5
export const LAG_FAIL_SECONDS = 30

const LAG_SECONDS_METRIC = 'physical_replication_lag_physical_replication_lag_seconds'
const CONNECTED_METRIC = 'physical_replication_lag_is_connected_to_primary'
const PAUSED_METRIC = 'physical_replication_lag_is_wal_replay_paused'
const PRIMARY_REPLAY_LAG_METRIC = 'pg_stat_replication_replay_lag'

/**
 * Parse Prometheus text exposition into `{ name, labels, value }` samples.
 * Comments and blank lines are skipped; NaN is kept as NaN so a caller can
 * tell "reported as unknown" from "absent".
 */
export function parsePrometheus(text) {
  const out = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)(?:\s+\S+)?$/.exec(line)
    if (!m) continue
    const labels = {}
    if (m[2]) {
      for (const pair of m[2].match(/[A-Za-z_][A-Za-z0-9_]*="(?:[^"\\]|\\.)*"/g) ?? []) {
        const eq = pair.indexOf('=')
        labels[pair.slice(0, eq)] = pair.slice(eq + 2, -1).replace(/\\(["\\])/g, '$1')
      }
    }
    out.push({ name: m[1], labels, value: Number(m[3]) })
  }
  return out
}

/**
 * A Postgres interval as `pg_stat_replication.replay_lag::text` prints it
 * (`00:00:01.234567`, `1 day 02:03:04`, or null when the standby has sent no
 * reply yet). Returns milliseconds, or null.
 */
export function parsePgInterval(text) {
  if (text === null || text === undefined) return null
  const s = String(text).trim()
  if (!s) return null
  let ms = 0
  const days = /(-?\d+)\s+day/.exec(s)
  if (days) ms += Number(days[1]) * 86_400_000
  const hms = /(-?)(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(s)
  if (!hms) return days ? ms : null
  const sign = hms[1] === '-' ? -1 : 1
  const frac = hms[5] ? Number(`0.${hms[5]}`) : 0
  ms += sign * ((Number(hms[2]) * 3600 + Number(hms[3]) * 60 + Number(hms[4]) + frac) * 1000)
  return Math.round(ms)
}

/** The replicas the PRIMARY sees: one entry per `pg_stat_replication` row. */
export function replicasFromPgStat(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    identifier: String(r.application_name ?? ''),
    state: r.state ?? null,
    syncState: r.sync_state ?? null,
    replayLagMs: parsePgInterval(r.replay_lag),
    replayBytes:
      r.replay_bytes === null || r.replay_bytes === undefined ? null : Number(r.replay_bytes),
  }))
}

/** A replica identifier is `<ref>-rr-<region>-<suffix>`; the primary reports under the bare ref. */
export function isReplicaIdentifier(identifier, ref) {
  return typeof identifier === 'string' && identifier.startsWith(`${ref}-rr-`)
}

export function regionFromIdentifier(identifier, ref) {
  if (!isReplicaIdentifier(identifier, ref)) return null
  const rest = identifier.slice(`${ref}-rr-`.length)
  // region is `<aa>-<word>-<n>`; the suffix after it is Supabase's random tail
  const m = /^([a-z]{2}-[a-z]+-\d)(?:-|$)/.exec(rest)
  return m ? m[1] : null
}

/** What every database reports about itself through the metrics endpoint. */
export function replicasFromMetrics(text, ref) {
  const byId = new Map()
  for (const s of parsePrometheus(text)) {
    const id = s.labels.supabase_identifier
    if (!id) continue
    if (!byId.has(id)) {
      byId.set(id, {
        identifier: id,
        replica: isReplicaIdentifier(id, ref),
        lagSeconds: null,
        connectedToPrimary: null,
        replayPaused: null,
        primaryReplayLagSeconds: null,
      })
    }
    const row = byId.get(id)
    const v = Number.isNaN(s.value) ? null : s.value
    if (s.name === LAG_SECONDS_METRIC) row.lagSeconds = v
    else if (s.name === CONNECTED_METRIC) row.connectedToPrimary = v === null ? null : v === 1
    else if (s.name === PAUSED_METRIC) row.replayPaused = v === null ? null : v === 1
    else if (s.name === PRIMARY_REPLAY_LAG_METRIC) row.primaryReplayLagSeconds = v
  }
  return [...byId.values()]
}

/**
 * Join the primary's view and the replicas' own view, then decide.
 *
 *   status  none        no replica anywhere and the app does not expect one
 *           ok          every replica streaming, connected, under WARN
 *           warn        a replica between WARN and FAIL seconds behind
 *           fail        a replica over FAIL, not streaming, disconnected or
 *                       paused; or the app points at a replica URL and the
 *                       primary streams to nobody
 *           unverified  the primary leg could not be read at all
 */
export function assessReplicaLag({
  ref,
  pgStat,
  metricsText = null,
  replicaUrl = null,
  warnSeconds = LAG_WARN_SECONDS,
  failSeconds = LAG_FAIL_SECONDS,
}) {
  const findings = []
  if (pgStat === null || pgStat === undefined) {
    return {
      status: 'unverified',
      replicas: [],
      appExpectsReplica: Boolean(replicaUrl),
      findings: ['primary_unreadable'],
    }
  }
  const fromPrimary = replicasFromPgStat(pgStat)
  const fromMetrics = metricsText === null ? null : replicasFromMetrics(metricsText, ref)
  const ids = new Set(fromPrimary.map((r) => r.identifier))
  for (const m of fromMetrics ?? []) if (m.replica) ids.add(m.identifier)

  const replicas = [...ids].map((identifier) => {
    const p = fromPrimary.find((r) => r.identifier === identifier) ?? null
    const m = fromMetrics?.find((r) => r.identifier === identifier) ?? null
    const primaryLagSeconds = p?.replayLagMs === null || p === null ? null : p.replayLagMs / 1000
    const replicaLagSeconds = m?.lagSeconds ?? null
    const lagSeconds = Math.max(primaryLagSeconds ?? 0, replicaLagSeconds ?? 0)
    const lagKnown = primaryLagSeconds !== null || replicaLagSeconds !== null
    const problems = []
    if (!p) problems.push('not_streaming_to_primary')
    else if (p.state !== 'streaming') problems.push(`state_${p.state ?? 'unknown'}`)
    if (m?.connectedToPrimary === false) problems.push('disconnected_from_primary')
    if (m?.replayPaused === true) problems.push('wal_replay_paused')
    if (lagKnown && lagSeconds > failSeconds) problems.push('lag_over_fail')
    let status = 'ok'
    if (problems.length) status = 'fail'
    else if (lagKnown && lagSeconds > warnSeconds) status = 'warn'
    return {
      identifier,
      region: regionFromIdentifier(identifier, ref),
      state: p?.state ?? null,
      primaryLagSeconds,
      replicaLagSeconds,
      lagSeconds: lagKnown ? lagSeconds : null,
      status,
      problems,
    }
  })

  const appExpectsReplica = Boolean(replicaUrl)
  let status = 'none'
  if (replicas.length === 0) {
    if (appExpectsReplica) {
      status = 'fail'
      findings.push('app_points_at_replica_but_none_streams')
    }
  } else {
    status = 'ok'
    for (const r of replicas) {
      if (r.status === 'fail') status = 'fail'
      else if (r.status === 'warn' && status !== 'fail') status = 'warn'
      for (const p of r.problems) findings.push(`${r.identifier}: ${p}`)
      if (r.status === 'warn') findings.push(`${r.identifier}: lag_over_warn`)
    }
    if (!appExpectsReplica) findings.push('replica_streams_but_app_reads_primary')
  }
  return { status, replicas, appExpectsReplica, findings }
}

/**
 * What `--setup` would do, and what stands in its way. Nothing here is a
 * guess about Supabase's gating: the blockers are only the facts we measure
 * (region enum, compute, PITR) and the setup endpoint's own answer is the
 * final word. Compute and PITR are listed because the replica runs on the
 * same compute as the primary and is built from the primary's WAL archive,
 * so both are visible costs before the first byte replicates.
 */
export function planReplicaSetup({ project, addons, backups, region = DEFAULT_REPLICA_REGION }) {
  const blockers = []
  if (!REPLICA_REGIONS.includes(region)) blockers.push(`region_not_in_enum:${region}`)
  const primaryRegion = project?.region ?? backups?.region ?? null
  const compute = (addons?.selected_addons ?? []).find((a) => a.type === 'compute_instance')
  const computeVariant = compute?.variant?.identifier ?? null
  const pitrEnabled = backups?.pitr_enabled ?? null
  const notes = []
  // Measured 2026-10-14: POST read-replicas/setup on this Nano project answered
  // `400: Read replicas require a minimum size of small`. The floor is the same
  // one PITR has, so the compute order in pitr-lib.mjs is the one source.
  if (!computeMeetsReplicaFloor(computeVariant)) {
    blockers.push(`compute_below_small:${computeVariant ?? 'ci_nano'}`)
  }
  if (pitrEnabled === false) notes.push('pitr_disabled')
  return {
    region,
    primaryRegion,
    sameRegionAsPrimary: primaryRegion === region,
    computeVariant,
    pitrEnabled,
    blockers,
    notes,
    request: { path: 'read-replicas/setup', body: { read_replica_region: region } },
  }
}

export function formatStatus(assessment, { ref, replicaUrl }) {
  const lines = []
  lines.push(`project ${ref}`)
  lines.push(`app replica url: ${replicaUrl ? replicaUrl : '(unset; catalogue reads the primary)'}`)
  lines.push(`replicas streaming: ${assessment.replicas.length}`)
  for (const r of assessment.replicas) {
    const lag = r.lagSeconds === null ? 'lag unknown' : `lag ${r.lagSeconds.toFixed(1)}s`
    lines.push(
      `  ${r.identifier} (${r.region ?? 'region ?'}) ${r.state ?? 'state ?'} ${lag} -> ${r.status}`,
    )
  }
  lines.push(`status: ${assessment.status}`)
  for (const f of assessment.findings) lines.push(`  ${f}`)
  return lines.join('\n')
}

export function formatNtfyBody(assessment) {
  const head = `read replica: ${assessment.status}`
  const detail = assessment.findings.slice(0, 6).map((f) => `- ${f}`)
  return [head, ...detail].join('\n')
}

/** Exit code and whether to page: fail pages and exits 1, warn exits 0 but pages at low priority. */
export function notifyPolicy(assessment) {
  if (assessment.status === 'fail') return { exitCode: 1, notify: true, priority: 'high' }
  if (assessment.status === 'warn') return { exitCode: 0, notify: true, priority: 'default' }
  return { exitCode: 0, notify: false, priority: 'default' }
}
