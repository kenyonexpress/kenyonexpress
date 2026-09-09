#!/usr/bin/env node
/**
 * Create the ten scheduled jobs on cron-job.org, from `docs/CRON-EXTERNAL.md`.
 *
 *   CRONORG_API_KEY=... CRON_SECRET=... node scripts/setup-cron-jobs.mjs          # dry run
 *   CRONORG_API_KEY=... CRON_SECRET=... node scripts/setup-cron-jobs.mjs --apply  # creates
 *
 * DRY RUN IS THE DEFAULT, and that is not politeness. This script creates
 * things on a third-party account that will then call production every five
 * minutes. Running it twice without care is how you get twenty jobs and two
 * notification emails per event, so `--apply` has to be typed.
 *
 * IDEMPOTENT BY URL. It reads the existing jobs first and skips any URL that is
 * already scheduled, so a re-run after a partial failure completes the set
 * rather than duplicating it.
 *
 * WHY THE SCHEDULE IS ARRAYS AND NOT A CRON STRING. cron-job.org's API does not
 * take cron expressions. It takes explicit minute/hour/mday/month/wday lists
 * where `-1` means "every". The table below is the translation of the ten
 * expressions in `docs/CRON-EXTERNAL.md`, kept next to them so a change to one
 * is visibly a change to the other.
 */

const API = 'https://api.cron-job.org'
const BASE = 'https://kenyonexpress.vercel.app'

const apiKey = process.env.CRONORG_API_KEY
const cronSecret = process.env.CRON_SECRET
const apply = process.argv.includes('--apply')

if (!apiKey) {
  console.error('CRONORG_API_KEY is not set. Get it from console.cron-job.org/settings.')
  process.exit(2)
}
if (!cronSecret) {
  console.error(
    'CRON_SECRET is not set. It must be the SAME value the Vercel production environment holds,\n' +
      'or every job will get a 401 forever. Read it from the Vercel dashboard.',
  )
  process.exit(2)
}

/** every N minutes -> [0, N, 2N, ...] */
const everyMinutes = (n) => Array.from({ length: 60 / n }, (_, i) => i * n)
const EVERY = [-1]

// The ten, in the order docs/CRON-EXTERNAL.md lists them.
const JOBS = [
  { path: 'notifications', cron: '*/5 * * * *', minutes: everyMinutes(5), hours: EVERY },
  { path: 'health', cron: '*/5 * * * *', minutes: everyMinutes(5), hours: EVERY },
  { path: 'invoices', cron: '*/10 * * * *', minutes: everyMinutes(10), hours: EVERY },
  { path: 'stock', cron: '*/10 * * * *', minutes: everyMinutes(10), hours: EVERY },
  { path: 'stranded-payments', cron: '*/10 * * * *', minutes: everyMinutes(10), hours: EVERY },
  { path: 'abandoned-cart', cron: '0 * * * *', minutes: [0], hours: EVERY },
  { path: 'subscriptions', cron: '30 2 * * *', minutes: [30], hours: [2] },
  { path: 'reap-carts', cron: '40 3 * * *', minutes: [40], hours: [3] },
  { path: 'reconcile', cron: '0 4 * * *', minutes: [0], hours: [4] },
  { path: 'expire-vouchers', cron: '15 23 * * *', minutes: [15], hours: [23] },
]

const url = (path) => `${BASE}/api/cron/${path}`

async function api(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    /* a non-JSON body is reported raw below */
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`)
  }
  return parsed
}

const existing = await api('GET', '/jobs')
const byUrl = new Map((existing?.jobs ?? []).map((j) => [j.url, j]))
console.log(`cron-job.org currently holds ${byUrl.size} job(s).`)

const results = []
for (const job of JOBS) {
  const target = url(job.path)
  const already = byUrl.get(target)
  if (already) {
    results.push({ path: job.path, id: already.jobId, action: 'existed', enabled: already.enabled })
    continue
  }
  if (!apply) {
    results.push({ path: job.path, id: null, action: 'would create', enabled: true })
    continue
  }
  const created = await api('PUT', '/jobs', {
    job: {
      url: target,
      enabled: true,
      saveResponses: true,
      // 0 is GET. Every one of the ten is a GET; the handlers export only GET,
      // so a POST would get a 405.
      requestMethod: 0,
      title: `kenyonexpress ${job.path}`,
      schedule: {
        // UTC on purpose. The expressions in CRON-EXTERNAL.md are UTC, and
        // Israel shifts between UTC+2 and UTC+3, so a local-time schedule would
        // move the daily jobs by an hour twice a year.
        timezone: 'UTC',
        expiresAt: 0,
        minutes: job.minutes,
        hours: job.hours,
        mdays: EVERY,
        months: EVERY,
        wdays: EVERY,
      },
      extendedData: { headers: { Authorization: `Bearer ${cronSecret}` } },
    },
  })
  results.push({ path: job.path, id: created?.jobId ?? null, action: 'created', enabled: true })
}

console.table(results)

if (!apply) {
  console.log('\nDRY RUN. Nothing was created. Re-run with --apply to create the missing jobs.')
  process.exit(0)
}

// Verify against the server rather than against what we think we just did.
const after = await api('GET', '/jobs')
const live = new Map((after?.jobs ?? []).map((j) => [j.url, j]))
const missing = JOBS.filter((j) => !live.has(url(j.path))).map((j) => j.path)
const disabled = JOBS.filter((j) => live.get(url(j.path)) && !live.get(url(j.path)).enabled).map(
  (j) => j.path,
)

console.log('\n--- verification (GET /jobs) ---')
console.log(`present: ${JOBS.length - missing.length}/${JOBS.length}`)
if (missing.length) console.log(`MISSING: ${missing.join(', ')}`)
if (disabled.length) console.log(`PRESENT BUT DISABLED: ${disabled.join(', ')}`)

console.log('\n--- job ids, for docs/CRON-EXTERNAL.md ---')
for (const job of JOBS) {
  const row = live.get(url(job.path))
  console.log(`${String(row?.jobId ?? 'MISSING').padStart(10)}  ${job.cron.padEnd(13)} ${job.path}`)
}

process.exit(missing.length || disabled.length ? 1 : 0)
