/**
 * Read-replica assessment over the three documents as they were measured on
 * the production project on 2026-10-14: an empty `pg_stat_replication`, a
 * metrics scrape with only the primary's row (lag 0, connected 0, replay lag
 * NaN), and no SUPABASE_READ_REPLICA_URL anywhere. The replica fixtures below
 * follow the identifier shape in the management API's RemoveReadReplicaBody
 * example (`<ref>-rr-<region>-<suffix>`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPLICA_REGION,
  LAG_FAIL_SECONDS,
  LAG_WARN_SECONDS,
  REPLICA_REGIONS,
  assessReplicaLag,
  formatNtfyBody,
  formatStatus,
  isReplicaIdentifier,
  notifyPolicy,
  parsePgInterval,
  parsePrometheus,
  planReplicaSetup,
  regionFromIdentifier,
  replicasFromMetrics,
  replicasFromPgStat,
} from './read-replica-lib.mjs'
import {
  databaseQueryPath,
  metricsUrl,
  readReplicaRemovePath,
  readReplicaSetupPath,
} from './supabase-mgmt.mjs'

const REF = 'ixvwfbuvfxxsjiywhbbb'
const RR = `${REF}-rr-eu-north-1-abcde`
const LB = `https://${REF}-all.supabase.co`

const L = (id, extra = '') =>
  `{supabase_project_ref="${REF}",supabase_identifier="${id}",service_type="postgresql",server="localhost:5432"${extra}}`

/** The scrape as measured: primary only. */
const METRICS_PRIMARY_ONLY = [
  '# HELP pg_stat_replication_replay_lag Max replay lag',
  '# TYPE pg_stat_replication_replay_lag gauge',
  `pg_stat_replication_replay_lag${L(REF)} NaN`,
  `physical_replication_lag_physical_replication_lag_seconds${L(REF)} 0`,
  `physical_replication_lag_is_connected_to_primary${L(REF)} 0`,
  `physical_replication_lag_is_wal_replay_paused${L(REF)} 0`,
  `supabase_usage_metrics_user_queries_total${L(REF)} 2.867457e+06`,
].join('\n')

const metricsWithReplica = ({ lag = 0.4, connected = 1, paused = 0 } = {}) =>
  [
    METRICS_PRIMARY_ONLY,
    `physical_replication_lag_physical_replication_lag_seconds${L(RR)} ${lag}`,
    `physical_replication_lag_is_connected_to_primary${L(RR)} ${connected}`,
    `physical_replication_lag_is_wal_replay_paused${L(RR)} ${paused}`,
  ].join('\n')

const pgStatRow = (overrides = {}) => ({
  application_name: RR,
  state: 'streaming',
  sync_state: 'async',
  replay_lag: '00:00:00.412345',
  replay_bytes: 1024,
  ...overrides,
})

describe('parsePrometheus', () => {
  it('reads labelled gauges, keeps NaN as NaN and skips comments', () => {
    const samples = parsePrometheus(METRICS_PRIMARY_ONLY)
    expect(samples).toHaveLength(5)
    const replay = samples.find((s) => s.name === 'pg_stat_replication_replay_lag')
    expect(replay.labels.supabase_identifier).toBe(REF)
    expect(Number.isNaN(replay.value)).toBe(true)
    const queries = samples.find((s) => s.name === 'supabase_usage_metrics_user_queries_total')
    expect(queries.value).toBe(2_867_457)
  })

  it('unescapes quoted label values and tolerates a trailing timestamp', () => {
    const [s] = parsePrometheus('m{a="x\\"y",b="z"} 1 1700000000')
    expect(s.labels).toEqual({ a: 'x"y', b: 'z' })
    expect(s.value).toBe(1)
  })
})

describe('parsePgInterval', () => {
  it('converts replay_lag::text to milliseconds', () => {
    expect(parsePgInterval('00:00:00.412345')).toBe(412)
    expect(parsePgInterval('00:01:30')).toBe(90_000)
    expect(parsePgInterval('1 day 02:00:00')).toBe(93_600_000)
    expect(parsePgInterval('-00:00:01')).toBe(-1000)
  })

  it('is null when the standby has not replied yet', () => {
    expect(parsePgInterval(null)).toBeNull()
    expect(parsePgInterval('')).toBeNull()
    expect(parsePgInterval('garbage')).toBeNull()
  })
})

describe('identifiers', () => {
  it('tells the primary from a replica by the -rr- infix and reads the region out', () => {
    expect(isReplicaIdentifier(REF, REF)).toBe(false)
    expect(isReplicaIdentifier(RR, REF)).toBe(true)
    expect(regionFromIdentifier(RR, REF)).toBe('eu-north-1')
    expect(regionFromIdentifier(`${REF}-rr-ap-southeast-2-zzzzz`, REF)).toBe('ap-southeast-2')
    expect(regionFromIdentifier(REF, REF)).toBeNull()
  })

  it('exposes the setup region enum with eu-north-1, the primary region, as default', () => {
    expect(REPLICA_REGIONS).toContain(DEFAULT_REPLICA_REGION)
    expect(DEFAULT_REPLICA_REGION).toBe('eu-north-1')
    expect(REPLICA_REGIONS).toHaveLength(18)
  })
})

describe('replicasFromPgStat / replicasFromMetrics', () => {
  it('maps a streaming row with its lag', () => {
    expect(replicasFromPgStat([pgStatRow()])).toEqual([
      {
        identifier: RR,
        state: 'streaming',
        syncState: 'async',
        replayLagMs: 412,
        replayBytes: 1024,
      },
    ])
    expect(replicasFromPgStat([])).toEqual([])
    expect(replicasFromPgStat(null)).toEqual([])
  })

  it('reads one row per database from the scrape and flags which are replicas', () => {
    const rows = replicasFromMetrics(metricsWithReplica({ lag: 2.5 }), REF)
    expect(rows.map((r) => r.identifier).sort()).toEqual([REF, RR].sort())
    const primary = rows.find((r) => r.identifier === REF)
    expect(primary.replica).toBe(false)
    expect(primary.primaryReplayLagSeconds).toBeNull() // NaN reported, not a number
    const replica = rows.find((r) => r.identifier === RR)
    expect(replica).toMatchObject({
      replica: true,
      lagSeconds: 2.5,
      connectedToPrimary: true,
      replayPaused: false,
    })
  })
})

describe('assessReplicaLag', () => {
  it('is `none` on the project as measured: no replica, no URL, nothing to monitor', () => {
    const a = assessReplicaLag({ ref: REF, pgStat: [], metricsText: METRICS_PRIMARY_ONLY })
    expect(a.status).toBe('none')
    expect(a.replicas).toEqual([])
    expect(a.findings).toEqual([])
    expect(notifyPolicy(a)).toEqual({ exitCode: 0, notify: false, priority: 'default' })
  })

  it('is `fail` when the app points at a replica URL and the primary streams to nobody', () => {
    const a = assessReplicaLag({ ref: REF, pgStat: [], replicaUrl: LB })
    expect(a.status).toBe('fail')
    expect(a.findings).toEqual(['app_points_at_replica_but_none_streams'])
    expect(notifyPolicy(a)).toEqual({ exitCode: 1, notify: true, priority: 'high' })
  })

  it('is `ok` for a streaming, connected replica under the warn line, with both lags joined', () => {
    const a = assessReplicaLag({
      ref: REF,
      pgStat: [pgStatRow()],
      metricsText: metricsWithReplica({ lag: 0.9 }),
      replicaUrl: LB,
    })
    expect(a.status).toBe('ok')
    expect(a.replicas).toHaveLength(1)
    expect(a.replicas[0]).toMatchObject({
      identifier: RR,
      region: 'eu-north-1',
      state: 'streaming',
      primaryLagSeconds: 0.412,
      replicaLagSeconds: 0.9,
      lagSeconds: 0.9,
      status: 'ok',
      problems: [],
    })
    expect(a.findings).toEqual([])
  })

  it('notes a replica that streams while the app still reads the primary', () => {
    const a = assessReplicaLag({ ref: REF, pgStat: [pgStatRow()] })
    expect(a.status).toBe('ok')
    expect(a.findings).toEqual(['replica_streams_but_app_reads_primary'])
  })

  it('warns between the thresholds and fails above them, from either side', () => {
    const warn = assessReplicaLag({
      ref: REF,
      pgStat: [pgStatRow({ replay_lag: '00:00:07' })],
      replicaUrl: LB,
    })
    expect(warn.status).toBe('warn')
    expect(warn.findings).toEqual([`${RR}: lag_over_warn`])
    expect(notifyPolicy(warn)).toEqual({ exitCode: 0, notify: true, priority: 'default' })

    const failFromMetrics = assessReplicaLag({
      ref: REF,
      pgStat: [pgStatRow()],
      metricsText: metricsWithReplica({ lag: LAG_FAIL_SECONDS + 1 }),
      replicaUrl: LB,
    })
    expect(failFromMetrics.status).toBe('fail')
    expect(failFromMetrics.replicas[0].problems).toEqual(['lag_over_fail'])

    const custom = assessReplicaLag({
      ref: REF,
      pgStat: [pgStatRow({ replay_lag: '00:00:02' })],
      warnSeconds: 1,
      failSeconds: 1.5,
    })
    expect(custom.status).toBe('fail')
    expect(LAG_WARN_SECONDS).toBeLessThan(LAG_FAIL_SECONDS)
  })

  it('fails a replica the primary no longer streams to, one that is disconnected, and a paused one', () => {
    const gone = assessReplicaLag({
      ref: REF,
      pgStat: [],
      metricsText: metricsWithReplica({ connected: 0 }),
    })
    expect(gone.status).toBe('fail')
    expect(gone.replicas[0].problems).toEqual([
      'not_streaming_to_primary',
      'disconnected_from_primary',
    ])

    const paused = assessReplicaLag({
      ref: REF,
      pgStat: [pgStatRow({ state: 'catchup' })],
      metricsText: metricsWithReplica({ paused: 1 }),
    })
    expect(paused.status).toBe('fail')
    expect(paused.replicas[0].problems).toEqual(['state_catchup', 'wal_replay_paused'])
  })

  it('is `unverified`, never `ok`, when the primary could not be read', () => {
    const a = assessReplicaLag({ ref: REF, pgStat: null, replicaUrl: LB })
    expect(a.status).toBe('unverified')
    expect(a.findings).toEqual(['primary_unreadable'])
    expect(notifyPolicy(a).exitCode).toBe(0)
  })
})

describe('planReplicaSetup', () => {
  const project = { region: 'eu-north-1' }
  const addonsNano = { selected_addons: [] }
  const backupsNoPitr = { region: 'eu-north-1', pitr_enabled: false, walg_enabled: true }

  it('plans eu-north-1 next to the primary and names the measured cost facts, not guesses', () => {
    const plan = planReplicaSetup({ project, addons: addonsNano, backups: backupsNoPitr })
    expect(plan).toMatchObject({
      region: 'eu-north-1',
      primaryRegion: 'eu-north-1',
      sameRegionAsPrimary: true,
      computeVariant: null,
      pitrEnabled: false,
      blockers: [],
      notes: ['primary_on_nano_compute', 'pitr_disabled'],
      request: { path: 'read-replicas/setup', body: { read_replica_region: 'eu-north-1' } },
    })
  })

  it('refuses a region outside the API enum before any request', () => {
    const plan = planReplicaSetup({
      project,
      addons: addonsNano,
      backups: backupsNoPitr,
      region: 'il-central-1',
    })
    expect(plan.blockers).toEqual(['region_not_in_enum:il-central-1'])
  })

  it('reads the compute variant when one is selected', () => {
    const plan = planReplicaSetup({
      project,
      addons: {
        selected_addons: [{ type: 'compute_instance', variant: { identifier: 'ci_small' } }],
      },
      backups: { ...backupsNoPitr, pitr_enabled: true },
      region: 'eu-central-1',
    })
    expect(plan.computeVariant).toBe('ci_small')
    expect(plan.sameRegionAsPrimary).toBe(false)
    expect(plan.notes).toEqual([])
  })
})

describe('formatting and paths', () => {
  it('prints the status with each replica on its own line and the URL state first', () => {
    const a = assessReplicaLag({ ref: REF, pgStat: [pgStatRow()], replicaUrl: LB })
    const text = formatStatus(a, { ref: REF, replicaUrl: LB })
    expect(text).toContain(`app replica url: ${LB}`)
    expect(text).toContain(`${RR} (eu-north-1) streaming lag 0.4s -> ok`)
    expect(text).toContain('status: ok')
    expect(formatNtfyBody(a)).toBe('read replica: ok')
    expect(formatNtfyBody(assessReplicaLag({ ref: REF, pgStat: [], replicaUrl: LB }))).toBe(
      'read replica: fail\n- app_points_at_replica_but_none_streams',
    )
  })

  it('is wired: the workflow runs the script, vitest runs this file, the env example names it', () => {
    const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
    const wf = read('.github/workflows/replica-lag.yml')
    expect(wf).toContain('node scripts/dr/read-replica.mjs --lag')
    expect(wf).toContain('SUPABASE_METRICS_KEY')
    expect(wf).not.toContain('CI_SUPABASE_')
    expect(wf).toContain('SUPABASE_READ_REPLICA_URL')
    expect(read('vitest.config.ts')).toContain("'scripts/dr/**/*.test.mjs'")
    expect(read('.env.example')).toContain('scripts/dr/read-replica.mjs')
    expect(read('docs/ARCHITECTURE-SCALABILITY.md')).toContain('replica-lag.yml')
    expect(read('docs/runbooks/database-supabase.md')).toContain('scripts/dr/read-replica.mjs')
    // The CLI must never reach the setup endpoint without --yes.
    const cli = read('scripts/dr/read-replica.mjs')
    const setupBlock = cli.slice(
      cli.indexOf("if (has('--setup'))"),
      cli.indexOf("if (has('--remove'))"),
    )
    expect(setupBlock.indexOf("has('--yes')")).toBeLessThan(
      setupBlock.indexOf('readReplicaSetupPath(ref)'),
    )
  })

  it('uses the endpoints the OpenAPI document lists', () => {
    expect(readReplicaSetupPath(REF)).toBe(`/v1/projects/${REF}/read-replicas/setup`)
    expect(readReplicaRemovePath(REF)).toBe(`/v1/projects/${REF}/read-replicas/remove`)
    expect(databaseQueryPath(REF)).toBe(`/v1/projects/${REF}/database/query`)
    expect(metricsUrl(REF)).toBe(`https://${REF}.supabase.co/customer/v1/privileged/metrics`)
  })
})
