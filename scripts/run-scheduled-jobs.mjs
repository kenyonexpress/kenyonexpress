#!/usr/bin/env node
/**
 * Calls the scheduled routes that Vercel Hobby cannot register.
 *
 * WHY THIS FILE EXISTS. Ten GET handlers live under src/app/api/cron/. They
 * were removed from vercel.json in 21342fc4 because Hobby registers two daily
 * jobs and silently ignores the rest. Three of the ten are on the money path
 * and one is the only way a customer receives a voucher. Nothing in the build
 * reads a `crons` key; the handlers are ordinary routes. This script is the
 * scheduler. GitHub Actions runs it every five minutes from
 * .github/workflows/scheduled-jobs.yml.
 *
 * WHY NOT deploy.yml. Vercel already deploys this repository through its
 * GitHub integration. A second deploy workflow would race for the production
 * alias. See .github/workflows/README.md.
 *
 * Auth: Authorization: Bearer $CRON_SECRET, the same header Vercel Cron would
 * have sent. An unset secret fails closed (exit 1, no requests) rather than
 * opening the routes.
 *
 * GitHub's schedule is UTC, finest grain five minutes, and routinely late.
 * Cadence windows below are wide enough for that delay. Every handler is
 * idempotent, so a double fire inside a window is a wasted invocation, not a
 * correctness bug.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BASE_URL = 'https://kenyonexpress.vercel.app'

/**
 * The ten jobs, byte for byte the schedules vercel.json carried before
 * 21342fc4. `cadence` is what this runner uses; `schedule` is the original
 * expression, kept so a grep of docs/CRON-EXTERNAL.md and this file agrees.
 */
export const CRON_JOBS = [
  {
    name: 'notifications',
    path: '/api/cron/notifications',
    schedule: '*/5 * * * *',
    cadence: 'every-5',
    moneyPath: true,
  },
  {
    name: 'health',
    path: '/api/cron/health',
    schedule: '*/5 * * * *',
    cadence: 'every-5',
    moneyPath: false,
    // The health job pages ntfy itself when a dependency is down. 503 means
    // the check ran and found a problem; it is not a scheduler failure.
    accept: [200, 503],
  },
  {
    name: 'invoices',
    path: '/api/cron/invoices',
    schedule: '*/10 * * * *',
    cadence: 'every-10',
    moneyPath: true,
  },
  {
    name: 'stock',
    path: '/api/cron/stock',
    schedule: '*/10 * * * *',
    cadence: 'every-10',
    moneyPath: false,
  },
  {
    name: 'stranded-payments',
    path: '/api/cron/stranded-payments',
    schedule: '*/10 * * * *',
    cadence: 'every-10',
    moneyPath: true,
  },
  {
    name: 'abandoned-cart',
    path: '/api/cron/abandoned-cart',
    schedule: '0 * * * *',
    cadence: 'hourly',
    moneyPath: false,
  },
  {
    name: 'subscriptions',
    path: '/api/cron/subscriptions',
    schedule: '30 2 * * *',
    cadence: 'daily',
    hour: 2,
    minute: 30,
    moneyPath: true,
  },
  {
    name: 'reap-carts',
    path: '/api/cron/reap-carts',
    schedule: '40 3 * * *',
    cadence: 'daily',
    hour: 3,
    minute: 40,
    moneyPath: false,
  },
  {
    name: 'reconcile',
    path: '/api/cron/reconcile',
    schedule: '0 4 * * *',
    cadence: 'daily',
    hour: 4,
    minute: 0,
    moneyPath: true,
  },
  {
    name: 'expire-vouchers',
    path: '/api/cron/expire-vouchers',
    schedule: '15 23 * * *',
    cadence: 'daily',
    hour: 23,
    minute: 15,
    moneyPath: true,
  },
]

/**
 * Liveness only. GET, never POST. A POST to the Cardcom webhook inserts a row
 * into payment_webhook_events even when the secret is wrong, which is how a
 * "probe" becomes a write on the money path. 405 means the route is deployed
 * and refuses GET, which is the whole of the claim.
 */
export const WEBHOOK_PROBES = [
  {
    name: 'products-webhook',
    path: '/api/webhooks/products',
    method: 'GET',
    accept: [405],
  },
  {
    name: 'cardcom-webhook',
    path: '/api/payments/cardcom/webhook',
    method: 'GET',
    accept: [405],
  },
]

const HOURLY_WINDOW_MINUTES = 10
const DAILY_WINDOW_MINUTES = 15

export function resolveBaseUrl(configured) {
  const raw = (configured ?? '').trim()
  if (!raw) return DEFAULT_BASE_URL
  return raw.replace(/\/+$/, '')
}

/**
 * Which cron jobs this 5-minute tick should fire.
 *
 * every-5 and every-10 always fire: this runner IS the 5-minute tick, and
 * firing the 10-minute jobs twice as often is cheaper than missing a delayed
 * :10. hourly fires in minute 0-9. daily fires in [minute, minute+15) of its
 * hour, so a GitHub delay of a few minutes still lands inside the window.
 */
export function cronJobsDueAt(now) {
  const minute = now.getUTCMinutes()
  const hour = now.getUTCHours()
  return CRON_JOBS.filter((job) => {
    switch (job.cadence) {
      case 'every-5':
      case 'every-10':
        return true
      case 'hourly':
        return minute < HOURLY_WINDOW_MINUTES
      case 'daily':
        return (
          hour === job.hour && minute >= job.minute && minute < job.minute + DAILY_WINDOW_MINUTES
        )
      default:
        throw new Error(`unknown cadence: ${job.cadence}`)
    }
  })
}

export function parseArgs(argv) {
  const out = { dryRun: false, only: null, now: null, baseUrl: null }
  for (const arg of argv) {
    if (arg === '--dry-run') {
      out.dryRun = true
      continue
    }
    if (arg.startsWith('--only=')) {
      out.only = arg.slice('--only='.length)
      continue
    }
    if (arg.startsWith('--now=')) {
      out.now = arg.slice('--now='.length)
      continue
    }
    if (arg.startsWith('--base-url=')) {
      out.baseUrl = arg.slice('--base-url='.length)
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`)
    }
  }
  return out
}

function expectedStatuses(job) {
  return job.accept ?? [200]
}

function protectionBypassHeaders(value) {
  const token = (value ?? '').trim()
  if (!token) return {}
  return { 'x-vercel-protection-bypass': token }
}

export async function runScheduledJobs(options) {
  const now = options.now ?? new Date()
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const secret = options.secret ?? ''
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const dryRun = options.dryRun === true
  const only = options.only ?? null
  const extraHeaders = options.extraHeaders ?? {}

  const dueCron = only ? CRON_JOBS.filter((job) => job.name === only) : cronJobsDueAt(now)
  const dueWebhooks = only ? WEBHOOK_PROBES.filter((job) => job.name === only) : WEBHOOK_PROBES

  if (only && dueCron.length === 0 && dueWebhooks.length === 0) {
    const known = [...CRON_JOBS, ...WEBHOOK_PROBES].map((job) => job.name).join(', ')
    return {
      ok: false,
      reason: `unknown job ${only}. known: ${known}`,
      results: [],
      skipped: true,
    }
  }

  if (!secret) {
    return {
      ok: false,
      reason:
        'CRON_SECRET is empty. Set the repository secret to the same value as Vercel Production. No request was sent.',
      results: [],
      skipped: true,
    }
  }

  const planned = [
    ...dueCron.map((job) => ({
      ...job,
      method: 'GET',
      auth: true,
      accept: expectedStatuses(job),
    })),
    ...dueWebhooks.map((job) => ({
      ...job,
      auth: false,
      accept: job.accept,
    })),
  ]

  if (dryRun) {
    return {
      ok: true,
      reason: 'dry-run',
      results: planned.map((job) => ({
        name: job.name,
        path: job.path,
        method: job.method,
        status: 0,
        ok: true,
        dryRun: true,
      })),
      skipped: false,
    }
  }

  const results = []
  for (const job of planned) {
    const url = `${baseUrl}${job.path}`
    const headers = { 'cache-control': 'no-store', ...extraHeaders }
    if (job.auth) headers.authorization = `Bearer ${secret}`
    let status = 0
    let error = null
    try {
      const response = await fetchImpl(url, {
        method: job.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      })
      status = response.status
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'unknown'
    }
    const ok = error === null && job.accept.includes(status)
    results.push({
      name: job.name,
      path: job.path,
      method: job.method,
      status,
      ok,
      error,
      moneyPath: job.moneyPath === true,
    })
  }

  const failed = results.filter((row) => !row.ok)
  return {
    ok: failed.length === 0,
    reason: failed.length === 0 ? null : `${failed.length} job(s) failed`,
    results,
    skipped: false,
  }
}

function printReport(outcome) {
  for (const row of outcome.results) {
    const mark = row.ok ? 'ok' : 'FAIL'
    const extra = row.error ? ` error=${row.error}` : ''
    const dry = row.dryRun ? ' dry-run' : ''
    console.log(`${mark}  ${row.method} ${row.path} -> ${row.status}${extra}${dry}`)
  }
  if (outcome.reason && !outcome.ok) {
    console.error(outcome.reason)
  }
}

export async function main(argv, env, fetchImpl) {
  const args = parseArgs(argv)
  const now = args.now ? new Date(args.now) : new Date()
  if (args.now && Number.isNaN(now.getTime())) {
    console.error(`invalid --now value: ${args.now}`)
    return 2
  }
  const outcome = await runScheduledJobs({
    now,
    baseUrl: args.baseUrl ?? env.PRODUCTION_URL ?? env.BASE_URL,
    secret: env.CRON_SECRET ?? '',
    only: args.only,
    dryRun: args.dryRun,
    extraHeaders: protectionBypassHeaders(env.PRODUCTION_SMOKE_HEADER),
    fetchImpl,
  })
  printReport(outcome)
  return outcome.ok ? 0 : 1
}

export function thisFileWasInvokedDirectly(argv1) {
  if (!argv1) return false
  return fileURLToPath(import.meta.url) === resolve(argv1)
}

if (thisFileWasInvokedDirectly(process.argv[1])) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exit(code)
    },
    (error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
