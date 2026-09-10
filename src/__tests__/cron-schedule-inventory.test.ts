import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE SCHEDULED JOBS ARE DESCRIBED IN FOUR PLACES. THEY MUST AGREE.
 *
 * WHY THIS IS WORTH A TEST. These ten have already been silently unscheduled
 * once. They were declared in `vercel.json`, the plan registers two of them at
 * daily granularity, and the platform ignores the rest without failing the
 * build and without warning - so `invoices`, `reconcile`, `stranded-payments`
 * and `notifications` were believed to be running and were not. Nothing in the
 * repository could have caught it, because nothing in the repository read that
 * key.
 *
 * The schedule now lives in `scripts/cron-jobs.json`, and three other files
 * restate it: the workflow that fires it, the doc a human sets a scheduler up
 * from, and the route handlers themselves. Every one of them can drift, and
 * every drift has the same shape as the original failure - a job that looks
 * scheduled and is not, or is scheduled at a URL that answers 404.
 *
 * WHAT IT DOES NOT DO. It cannot prove a job ran. Only the scheduler's history
 * can, and the run is red when a call fails, which is the record. This checks
 * the cheap thing: that the four descriptions are the same description.
 */

type CronJob = { name: string; path: string; cron: string }

const MANIFEST_PATH = 'scripts/cron-jobs.json'
const WORKFLOW_PATH = '.github/workflows/cron.yml'
const DOC_PATH = 'docs/CRON-EXTERNAL.md'
const ROUTES_DIR = 'src/app/api/cron'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const manifest = JSON.parse(read(MANIFEST_PATH)) as {
  defaultBaseUrl: string
  jobs: CronJob[]
}
const jobs = manifest.jobs

describe('the scheduled job inventory', () => {
  it('names the eighteen jobs and nothing else', () => {
    // A new cron route is a deliberate diff here. An undeclared one would be a
    // handler that exists, is reachable, and is never called by anything.
    expect(jobs.map((job) => job.name)).toEqual([
      'notifications',
      'price-schedule',
      'health',
      'invoices',
      'stock',
      'stranded-payments',
      'webhook-dlq',
      'abandoned-cart',
      'subscriptions',
      'reap-carts',
      'reconcile',
      'price-snapshot',
      'wishlist-alerts',
      'expire-vouchers',
      'whatsapp',
      'retention',
      'weekly-digest',
      'settlement-reconcile',
    ])
  })

  it('covers every route under src/app/api/cron, both ways', () => {
    const onDisk = readdirSync(resolve(process.cwd(), ROUTES_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(jobs.map((job) => job.name).sort()).toEqual(onDisk)
  })

  it('points each job at the route that actually exists', () => {
    for (const job of jobs) {
      expect(job.path).toBe(`/api/cron/${job.name}`)
      expect(existsSync(resolve(process.cwd(), ROUTES_DIR, job.name, 'route.ts'))).toBe(true)
    }
  })

  it('calls only handlers that export GET and require the secret', () => {
    // The scheduler sends GET and one Authorization header, on all ten. A route
    // that stopped exporting GET would answer 405 to a scheduler that reports
    // it as a failure at best and as a non-2xx nobody reads at worst; a route
    // that stopped reading CRON_SECRET would be an unauthenticated money-path
    // sweep on a public URL.
    for (const job of jobs) {
      const source = read(`${ROUTES_DIR}/${job.name}/route.ts`)
      expect(source, job.name).toContain('export const GET')
      expect(source.match(/export const (POST|PUT|PATCH|DELETE)\b/), job.name).toBeNull()
      expect(source, job.name).toContain('CRON_SECRET')
    }
  })

  it('declares in the workflow exactly the schedules the manifest uses', () => {
    // The workflow fires on the distinct cron expressions and hands
    // `github.event.schedule` back to the script, which looks the due jobs up
    // in the manifest. A schedule in the manifest with no line in the workflow
    // is a job that never runs; a line with no manifest entry is a run that
    // finds nothing to call and fails.
    const workflow = read(WORKFLOW_PATH)
    const declared = [...workflow.matchAll(/^\s+- cron: '(.+)'$/gm)].map((match) => match[1])
    const used = [...new Set(jobs.map((job) => job.cron))]

    expect(declared.slice().sort()).toEqual(used.slice().sort())
    expect(declared).toHaveLength(used.length)
  })

  it('runs the manifest through the script, not a second copy of the list', () => {
    const workflow = read(WORKFLOW_PATH)
    expect(workflow).toContain('scripts/run-cron-jobs.sh')
    expect(read('scripts/run-cron-jobs.sh')).toContain(MANIFEST_PATH)
    // No job path may be spelled out in the workflow: that is the copy that
    // would go stale.
    for (const job of jobs) {
      expect(workflow, job.name).not.toContain(job.path)
    }
  })

  it('documents every job at its own schedule', () => {
    // docs/CRON-EXTERNAL.md is what a human sets a scheduler up from, by hand,
    // under time pressure. A stale cron expression there is a job scheduled
    // wrong by somebody who checked.
    const lines = read(DOC_PATH).split('\n')
    for (const job of jobs) {
      const pairing = lines.filter((line) => line.includes(job.path) && line.includes(job.cron))
      expect(pairing.length, `${job.name} at ${job.cron} in ${DOC_PATH}`).toBeGreaterThan(0)
    }
  })

  it('keeps the base URL on the alias and not the apex', () => {
    // The original reason (the apex still served WordPress) expired: measured
    // 2026-09-10, the apex 308s to www.kenyonexpress.co.il and both hosts serve
    // this application from the same Vercel deployment. The assertion stays for
    // a different reason. `kenyonexpress.vercel.app` is the project's own alias
    // and cannot be moved by a DNS or domain-assignment change, and a scheduler
    // that follows the customer-facing hostname would start calling whatever
    // that name is pointed at next.
    expect(manifest.defaultBaseUrl).toBe('https://kenyonexpress.vercel.app')
  })

  it("records every job run, under the job's own name", () => {
    // `withJobRun` is what writes `job_runs`. A route that stopped calling it
    // would keep working and quietly stop reporting, which is the exact state
    // this whole mechanism exists to end, and a route calling it under the
    // WRONG name is worse: the dashboard would then show one job failing and
    // another that has never been seen, both wrong, with nothing contradicting
    // either.
    for (const job of jobs) {
      const source = read(`${ROUTES_DIR}/${job.name}/route.ts`)
      expect(source, job.name).toContain(`withJobRun('${job.name}',`)
    }
  })

  it('declares no crons array in vercel.json, and that is deliberate', () => {
    // THE LINE THAT LOOKS LIKE AN OVERSIGHT AND IS THE FIX.
    //
    // These jobs were declared in `vercel.json` once. The Hobby plan registers
    // two of them, at daily granularity, and ignores the rest without failing
    // the build and without warning - so four jobs were believed to be running
    // and were not. Re-measured 2026-09-10 through the Vercel API: the team
    // `kenyonexpress-projects` is still on `hobby`. Putting eighteen entries
    // back would silently unschedule fifteen of them, and it would look like
    // progress in the diff.
    const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>
    expect(Object.hasOwn(vercel, 'crons')).toBe(false)
  })
})
