/**
 * The watchdog's verdicts, held still. The case that matters most is the
 * measured one: a `skipped` db-backup run must be a FAIL, because that is the
 * state production has been in since the workflows were merged and it had
 * been reading as green for a month.
 */
import { describe, expect, it } from 'vitest'
import {
  DRILL_OVERDUE_DAYS,
  STALE_HOURS,
  assessBackupHealth,
  formatNtfyBody,
  formatSummary,
  newestCompletedPlatformBackup,
  newestCompletedRun,
  newestSuccessfulRun,
  notifyPolicy,
} from './health-lib.mjs'

const NOW = new Date('2026-10-08T06:30:00Z') // a Thursday
const MONDAY = new Date('2026-10-12T06:30:00Z')
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const daysAgo = (d) => hoursAgo(d * 24)

const run = (conclusion, created_at, status = 'completed') => ({
  status,
  conclusion,
  created_at,
  html_url: 'https://github.com/kenyonexpress/kenyonexpress/actions/runs/1',
})

const codes = (a) => a.findings.map((f) => f.code)
const levelOf = (a, code) => a.findings.find((f) => f.code === code)?.level

describe('newest run helpers', () => {
  it('ignores in-progress runs and picks the newest completed one regardless of order', () => {
    const runs = [
      run('success', hoursAgo(50)),
      run(null, hoursAgo(1), 'in_progress'),
      run('skipped', hoursAgo(2)),
    ]
    expect(newestCompletedRun(runs)?.conclusion).toBe('skipped')
    expect(newestSuccessfulRun(runs)?.created_at).toBe(hoursAgo(50))
  })

  it('returns null on empty or malformed input', () => {
    expect(newestCompletedRun([])).toBeNull()
    expect(
      newestCompletedRun([{ status: 'completed', conclusion: 'success', created_at: 'nope' }]),
    ).toBeNull()
    expect(newestSuccessfulRun(undefined)).toBeNull()
  })

  it('reads the newest COMPLETED platform backup and skips other statuses', () => {
    const backups = [
      { status: 'COMPLETED', inserted_at: '2026-10-05T22:04:20.189Z' },
      { status: 'PENDING', inserted_at: '2026-10-07T22:04:20.189Z' },
      { status: 'COMPLETED', inserted_at: '2026-10-06T22:03:47.418Z' },
    ]
    expect(newestCompletedPlatformBackup(backups)?.toISOString()).toBe('2026-10-06T22:03:47.418Z')
    expect(newestCompletedPlatformBackup([])).toBeNull()
  })
})

describe('assessBackupHealth: GitHub leg', () => {
  it('FAILs on the measured production state: newest db-backup run skipped', () => {
    const a = assessBackupHealth({
      now: NOW,
      backupRuns: [run('skipped', hoursAgo(20)), run('skipped', hoursAgo(44))],
      drillRuns: [run('skipped', daysAgo(6))],
    })
    expect(a.healthy).toBe(false)
    expect(levelOf(a, 'backup_skipped')).toBe('fail')
    expect(a.fails[0].text).toContain('DB_BACKUP_ENABLED')
    expect(levelOf(a, 'drill_never_passed')).toBe('warn')
  })

  it('FAILs when the backup has never run at all', () => {
    const a = assessBackupHealth({ now: NOW, backupRuns: [], drillRuns: [] })
    expect(levelOf(a, 'backup_never_ran')).toBe('fail')
  })

  it('FAILs on failure/cancelled/timed_out conclusions', () => {
    for (const c of ['failure', 'cancelled', 'timed_out']) {
      const a = assessBackupHealth({ now: NOW, backupRuns: [run(c, hoursAgo(3))], drillRuns: [] })
      expect(levelOf(a, 'backup_failed')).toBe('fail')
    }
  })

  it('FAILs a successful run older than the stale window and passes a fresh one', () => {
    const stale = assessBackupHealth({
      now: NOW,
      backupRuns: [run('success', hoursAgo(STALE_HOURS + 1))],
      drillRuns: [],
    })
    expect(levelOf(stale, 'backup_stale')).toBe('fail')
    const fresh = assessBackupHealth({
      now: NOW,
      backupRuns: [run('success', hoursAgo(STALE_HOURS - 1))],
      drillRuns: [],
    })
    expect(levelOf(fresh, 'backup_ok')).toBe('info')
    expect(fresh.healthy).toBe(true)
  })

  it('WARNs (never passes) when the Actions API is unreachable', () => {
    const a = assessBackupHealth({ now: NOW, backupRuns: null, drillRuns: null })
    expect(levelOf(a, 'github_unverified')).toBe('warn')
    expect(levelOf(a, 'drill_unverified')).toBe('warn')
    expect(codes(a)).not.toContain('backup_ok')
  })

  it('WARNs on an overdue drill and accepts a recent one', () => {
    const overdue = assessBackupHealth({
      now: NOW,
      backupRuns: [run('success', hoursAgo(1))],
      drillRuns: [run('success', daysAgo(DRILL_OVERDUE_DAYS + 1))],
    })
    expect(levelOf(overdue, 'drill_overdue')).toBe('warn')
    expect(overdue.healthy).toBe(true)
    const recent = assessBackupHealth({
      now: NOW,
      backupRuns: [run('success', hoursAgo(1))],
      drillRuns: [run('failure', daysAgo(1)), run('success', daysAgo(30))],
    })
    expect(levelOf(recent, 'drill_ok')).toBe('info')
  })
})

describe('assessBackupHealth: platform leg', () => {
  const okRuns = {
    backupRuns: [run('success', hoursAgo(1))],
    drillRuns: [run('success', daysAgo(1))],
  }

  it('reports unverified, not healthy, without a token', () => {
    const a = assessBackupHealth({ now: NOW, ...okRuns, platform: null })
    expect(levelOf(a, 'platform_unverified')).toBe('info')
    expect(codes(a)).not.toContain('platform_backup_ok')
  })

  it('reads the measured 2026-10-08 document: fresh backups, PITR off => healthy with a PITR warning', () => {
    const a = assessBackupHealth({
      now: new Date('2026-10-08T06:30:00Z'),
      ...okRuns,
      platform: {
        pitr_enabled: false,
        walg_enabled: true,
        backups: [
          { status: 'COMPLETED', inserted_at: '2026-10-06T22:03:47.418Z' },
          { status: 'COMPLETED', inserted_at: '2026-10-05T22:04:20.189Z' },
        ],
      },
    })
    expect(a.healthy).toBe(true)
    expect(levelOf(a, 'platform_backup_ok')).toBe('info')
    expect(levelOf(a, 'pitr_disabled')).toBe('warn')
    expect(a.warns.find((w) => w.code === 'pitr_disabled')?.text).toContain('pitr.mjs --enable')
    expect(codes(a)).not.toContain('walg_disabled')
  })

  it('FAILs on a stale or missing platform backup, WARNs on walg off', () => {
    const stale = assessBackupHealth({
      now: NOW,
      ...okRuns,
      platform: {
        pitr_enabled: true,
        walg_enabled: false,
        backups: [{ status: 'COMPLETED', inserted_at: hoursAgo(STALE_HOURS + 2) }],
      },
    })
    expect(levelOf(stale, 'platform_backup_stale')).toBe('fail')
    expect(levelOf(stale, 'pitr_enabled')).toBe('info')
    expect(levelOf(stale, 'walg_disabled')).toBe('warn')
    const missing = assessBackupHealth({
      now: NOW,
      ...okRuns,
      platform: { pitr_enabled: true, walg_enabled: true, backups: [{ status: 'PENDING' }] },
    })
    expect(levelOf(missing, 'platform_backup_missing')).toBe('fail')
  })

  it('WARNs on an API error instead of guessing', () => {
    const a = assessBackupHealth({ now: NOW, ...okRuns, platform: { error: '401 Unauthorized' } })
    expect(levelOf(a, 'platform_error')).toBe('warn')
    expect(a.healthy).toBe(true)
  })
})

describe('assessBackupHealth: R2 leg', () => {
  const okRuns = {
    backupRuns: [run('success', hoursAgo(1))],
    drillRuns: [run('success', daysAgo(1))],
  }

  it('reports unverified without credentials', () => {
    const a = assessBackupHealth({ now: NOW, ...okRuns, r2Keys: null })
    expect(levelOf(a, 'r2_unverified')).toBe('info')
  })

  it('FAILs on an empty prefix and on a stale newest dump; counts retained dumps when fresh', () => {
    const empty = assessBackupHealth({ now: NOW, ...okRuns, r2Keys: ['postgres/README.txt'] })
    expect(levelOf(empty, 'r2_empty')).toBe('fail')
    const stale = assessBackupHealth({
      now: NOW,
      ...okRuns,
      r2Keys: [
        'postgres/kenyonexpress-2026-10-05T0310Z.dump',
        'postgres/kenyonexpress-2026-10-05T0310Z.dump.sha256',
      ],
    })
    expect(levelOf(stale, 'r2_stale')).toBe('fail')
    const fresh = assessBackupHealth({
      now: NOW,
      ...okRuns,
      r2Keys: [
        'postgres/kenyonexpress-2026-10-08T0310Z.dump',
        'postgres/kenyonexpress-2026-10-08T0310Z.dump.sha256',
        'postgres/kenyonexpress-2026-10-07T0310Z.dump',
        'postgres/kenyonexpress-2026-10-07T0310Z.dump.sha256',
      ],
    })
    expect(levelOf(fresh, 'r2_ok')).toBe('info')
    expect(fresh.findings.find((f) => f.code === 'r2_ok')?.text).toContain('2 dumps retained')
    expect(fresh.healthy).toBe(true)
  })

  it('WARNs on a list error', () => {
    const keys = []
    keys.error = 'SignatureDoesNotMatch'
    const a = assessBackupHealth({ now: NOW, ...okRuns, r2Keys: keys })
    expect(levelOf(a, 'r2_error')).toBe('warn')
  })
})

describe('notifyPolicy', () => {
  const unhealthy = assessBackupHealth({
    now: NOW,
    backupRuns: [run('skipped', hoursAgo(1))],
    drillRuns: [],
  })
  const healthyWithWarn = assessBackupHealth({
    now: NOW,
    backupRuns: [run('success', hoursAgo(1))],
    drillRuns: [],
  })
  const clean = assessBackupHealth({
    now: NOW,
    backupRuns: [run('success', hoursAgo(1))],
    drillRuns: [run('success', daysAgo(2))],
  })

  it('pages at high priority on any fail, every day', () => {
    expect(notifyPolicy(unhealthy, NOW)).toEqual({
      send: true,
      priority: 'high',
      title: 'KE backups UNHEALTHY (1)',
    })
  })

  it('stays silent on a healthy weekday, even with warnings', () => {
    expect(notifyPolicy(healthyWithWarn, NOW).send).toBe(false)
    expect(notifyPolicy(clean, NOW).send).toBe(false)
  })

  it('sends the Monday heartbeat and carries the warning count', () => {
    expect(notifyPolicy(clean, MONDAY)).toEqual({
      send: true,
      priority: 'default',
      title: 'KE backups healthy',
    })
    expect(notifyPolicy(healthyWithWarn, MONDAY).title).toBe('KE backups healthy, 1 warnings')
  })
})

describe('formatting', () => {
  it('ntfy body lists fails first, then warns, then ok lines, and is bounded', () => {
    const a = assessBackupHealth({
      now: NOW,
      backupRuns: [run('skipped', hoursAgo(1))],
      drillRuns: [],
      platform: {
        pitr_enabled: false,
        walg_enabled: true,
        backups: [{ status: 'COMPLETED', inserted_at: hoursAgo(2) }],
      },
    })
    const body = formatNtfyBody(a)
    const lines = body.split('\n')
    expect(lines[0]).toMatch(/^FAIL .*db-backup\.yml was skipped/)
    expect(lines[1]).toMatch(/^WARN /)
    expect(lines.at(-1)).toMatch(/^(ok|WARN) /)
    expect(formatNtfyBody(a, { maxChars: 40 }).length).toBe(40)
  })

  it('step summary is a markdown table headed by the verdict', () => {
    const a = assessBackupHealth({
      now: NOW,
      backupRuns: [run('success', hoursAgo(1))],
      drillRuns: [run('success', daysAgo(1))],
    })
    const md = formatSummary(a)
    expect(md.startsWith('## Backup health: healthy')).toBe(true)
    expect(md).toContain('| ok | `backup_ok` |')
  })
})
