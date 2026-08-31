import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CRON_JOBS,
  WEBHOOK_PROBES,
  cronJobsDueAt,
  parseArgs,
  resolveBaseUrl,
  runScheduledJobs,
  thisFileWasInvokedDirectly,
} from './run-scheduled-jobs.mjs'

function utc(iso) {
  const date = new Date(iso)
  expect(Number.isNaN(date.getTime())).toBe(false)
  return date
}

function cronDirsOnDisk() {
  const root = join(process.cwd(), 'src/app/api/cron')
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort()
}

describe('the catalogue matches the tree', () => {
  it('names every cron route on disk, and no extras', () => {
    const fromDisk = cronDirsOnDisk()
    const fromCatalogue = CRON_JOBS.map((job) => job.path.replace('/api/cron/', '')).sort()
    expect(fromCatalogue).toEqual(fromDisk)
    expect(fromCatalogue).toHaveLength(10)
  })

  it('keeps the original vercel.json expressions next to the cadence', () => {
    expect(CRON_JOBS.map((job) => `${job.name} ${job.schedule}`)).toEqual([
      'notifications */5 * * * *',
      'health */5 * * * *',
      'invoices */10 * * * *',
      'stock */10 * * * *',
      'stranded-payments */10 * * * *',
      'abandoned-cart 0 * * * *',
      'subscriptions 30 2 * * *',
      'reap-carts 40 3 * * *',
      'reconcile 0 4 * * *',
      'expire-vouchers 15 23 * * *',
    ])
  })

  it('never POSTs a webhook probe', () => {
    for (const probe of WEBHOOK_PROBES) {
      expect(probe.method).toBe('GET')
      expect(probe.accept).toEqual([405])
    }
  })

  it('schedules from GitHub Actions and does not add a second Vercel deploy', () => {
    expect(existsSync(join(process.cwd(), '.github/workflows/scheduled-jobs.yml'))).toBe(true)
    expect(existsSync(join(process.cwd(), '.github/workflows/deploy.yml'))).toBe(false)
  })
})

describe('cronJobsDueAt', () => {
  it('always fires the five- and ten-minute jobs', () => {
    const due = cronJobsDueAt(utc('2026-08-31T12:17:00Z')).map((job) => job.name)
    expect(due).toEqual(
      expect.arrayContaining(['notifications', 'health', 'invoices', 'stock', 'stranded-payments']),
    )
    expect(due).not.toContain('abandoned-cart')
    expect(due).not.toContain('expire-vouchers')
  })

  it('fires abandoned-cart in minute 0-9, not later', () => {
    expect(cronJobsDueAt(utc('2026-08-31T12:00:00Z')).map((j) => j.name)).toContain(
      'abandoned-cart',
    )
    expect(cronJobsDueAt(utc('2026-08-31T12:09:00Z')).map((j) => j.name)).toContain(
      'abandoned-cart',
    )
    expect(cronJobsDueAt(utc('2026-08-31T12:10:00Z')).map((j) => j.name)).not.toContain(
      'abandoned-cart',
    )
  })

  it('fires expire-vouchers inside the 23:15 window and not outside it', () => {
    expect(cronJobsDueAt(utc('2026-08-31T23:15:00Z')).map((j) => j.name)).toContain(
      'expire-vouchers',
    )
    expect(cronJobsDueAt(utc('2026-08-31T23:29:00Z')).map((j) => j.name)).toContain(
      'expire-vouchers',
    )
    expect(cronJobsDueAt(utc('2026-08-31T23:30:00Z')).map((j) => j.name)).not.toContain(
      'expire-vouchers',
    )
    expect(cronJobsDueAt(utc('2026-08-31T22:15:00Z')).map((j) => j.name)).not.toContain(
      'expire-vouchers',
    )
  })

  it('fires the other daily jobs on their hour, inside the delay window', () => {
    expect(cronJobsDueAt(utc('2026-08-31T02:30:00Z')).map((j) => j.name)).toContain('subscriptions')
    expect(cronJobsDueAt(utc('2026-08-31T02:44:00Z')).map((j) => j.name)).toContain('subscriptions')
    expect(cronJobsDueAt(utc('2026-08-31T02:45:00Z')).map((j) => j.name)).not.toContain(
      'subscriptions',
    )
    expect(cronJobsDueAt(utc('2026-08-31T03:40:00Z')).map((j) => j.name)).toContain('reap-carts')
    expect(cronJobsDueAt(utc('2026-08-31T04:00:00Z')).map((j) => j.name)).toContain('reconcile')
    expect(cronJobsDueAt(utc('2026-08-31T04:14:00Z')).map((j) => j.name)).toContain('reconcile')
    expect(cronJobsDueAt(utc('2026-08-31T04:15:00Z')).map((j) => j.name)).not.toContain('reconcile')
  })
})

describe('resolveBaseUrl', () => {
  it('falls back to the known production host, and strips a trailing slash', () => {
    expect(resolveBaseUrl(undefined)).toBe('https://kenyonexpress.vercel.app')
    expect(resolveBaseUrl('')).toBe('https://kenyonexpress.vercel.app')
    expect(resolveBaseUrl('https://kenyonexpress.co.il/')).toBe('https://kenyonexpress.co.il')
  })
})

describe('parseArgs', () => {
  it('reads the flags the workflow actually passes', () => {
    expect(parseArgs(['--dry-run', '--only=notifications', '--now=2026-08-31T23:15:00Z'])).toEqual({
      dryRun: true,
      only: 'notifications',
      now: '2026-08-31T23:15:00Z',
      baseUrl: null,
    })
  })

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--force'])).toThrow(/unknown flag/)
  })
})

describe('runScheduledJobs', () => {
  it('sends nothing and fails when CRON_SECRET is empty', async () => {
    let called = 0
    const outcome = await runScheduledJobs({
      secret: '',
      now: utc('2026-08-31T12:00:00Z'),
      fetchImpl: async () => {
        called += 1
        return { status: 200 }
      },
    })
    expect(called).toBe(0)
    expect(outcome.ok).toBe(false)
    expect(outcome.skipped).toBe(true)
    expect(outcome.reason).toMatch(/CRON_SECRET/)
  })

  it('does not call fetch on a dry run, even with a secret', async () => {
    let called = 0
    const outcome = await runScheduledJobs({
      secret: 's3cret',
      dryRun: true,
      now: utc('2026-08-31T12:00:00Z'),
      fetchImpl: async () => {
        called += 1
        return { status: 200 }
      },
    })
    expect(called).toBe(0)
    expect(outcome.ok).toBe(true)
    expect(outcome.results.some((row) => row.name === 'notifications' && row.dryRun)).toBe(true)
  })

  it('fails the run when a money-path job answers 401', async () => {
    const outcome = await runScheduledJobs({
      secret: 's3cret',
      only: 'notifications',
      fetchImpl: async () => ({ status: 401 }),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.results).toEqual([
      expect.objectContaining({ name: 'notifications', status: 401, ok: false, moneyPath: true }),
    ])
  })

  it('treats health 503 as success (the check ran)', async () => {
    const outcome = await runScheduledJobs({
      secret: 's3cret',
      only: 'health',
      fetchImpl: async () => ({ status: 503 }),
    })
    expect(outcome.ok).toBe(true)
  })

  it('treats webhook GET 405 as success, and 200 as a failure', async () => {
    const closed = await runScheduledJobs({
      secret: 's3cret',
      only: 'products-webhook',
      fetchImpl: async () => ({ status: 405 }),
    })
    expect(closed.ok).toBe(true)

    const open = await runScheduledJobs({
      secret: 's3cret',
      only: 'products-webhook',
      fetchImpl: async () => ({ status: 200 }),
    })
    expect(open.ok).toBe(false)
  })

  it('does not follow a redirect, because 3xx here means the URL is wrong', async () => {
    const outcome = await runScheduledJobs({
      secret: 's3cret',
      only: 'notifications',
      fetchImpl: async (_url, init) => {
        expect(init.redirect).toBe('manual')
        return { status: 302 }
      },
    })
    expect(outcome.ok).toBe(false)
  })

  it('sends the bearer header on cron jobs and not on webhook probes', async () => {
    const seen = []
    await runScheduledJobs({
      secret: 's3cret',
      only: 'notifications',
      fetchImpl: async (url, init) => {
        seen.push({ url, authorization: init.headers.authorization })
        return { status: 200 }
      },
    })
    await runScheduledJobs({
      secret: 's3cret',
      only: 'cardcom-webhook',
      fetchImpl: async (url, init) => {
        seen.push({ url, authorization: init.headers.authorization })
        return { status: 405 }
      },
    })
    expect(seen[0].authorization).toBe('Bearer s3cret')
    expect(seen[0].url).toMatch(/\/api\/cron\/notifications$/)
    expect(seen[1].authorization).toBeUndefined()
    expect(seen[1].url).toMatch(/\/api\/payments\/cardcom\/webhook$/)
  })

  it('forwards the Deployment Protection bypass when one is supplied', async () => {
    const seen = []
    await runScheduledJobs({
      secret: 's3cret',
      only: 'health',
      extraHeaders: { 'x-vercel-protection-bypass': 'bypass-token' },
      fetchImpl: async (_url, init) => {
        seen.push(init.headers)
        return { status: 200 }
      },
    })
    expect(seen[0]['x-vercel-protection-bypass']).toBe('bypass-token')
    expect(seen[0].authorization).toBe('Bearer s3cret')
  })

  it('rejects an unknown --only name without fetching', async () => {
    let called = 0
    const outcome = await runScheduledJobs({
      secret: 's3cret',
      only: 'not-a-job',
      fetchImpl: async () => {
        called += 1
        return { status: 200 }
      },
    })
    expect(called).toBe(0)
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toMatch(/unknown job/)
  })

  it('treats a relative argv[1] as a direct invocation of this file', () => {
    // GitHub Actions runs `node scripts/run-scheduled-jobs.mjs`. argv[1] is
    // relative; import.meta.url is a file:// absolute URL. Comparing the two
    // strings is how this runner would silently do nothing on every tick.
    expect(thisFileWasInvokedDirectly('scripts/run-scheduled-jobs.mjs')).toBe(true)
    expect(thisFileWasInvokedDirectly('/usr/bin/vitest')).toBe(false)
  })
})
