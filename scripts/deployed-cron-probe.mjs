#!/usr/bin/env node
/**
 * Does the DEPLOYED build actually have the cron routes we schedule?
 *
 * WHY THIS EXISTS. `src/__tests__/cron-schedule-inventory.test.ts` already
 * checks `scripts/cron-jobs.json` against `.github/workflows/cron.yml`,
 * `docs/CRON-EXTERNAL.md` and `src/app/api/cron/`, in every direction. It is a
 * good gate and it compares the repository to itself. Nothing compared the
 * repository to what is SERVING, and `production-smoke.yml` probes only `/`
 * and `/api/health` -- two routes old enough to exist in any build -- so it
 * stayed green while other routes were absent.
 *
 * MEASURED 2026-09-09 against https://kenyonexpress.vercel.app: three of the
 * thirteen scheduled paths answered 404 -- `whatsapp`, `retention` and
 * `weekly-digest`. All three are present in the tree AND on `main`, so this is
 * not a missing route, it is a deployment older than the routes. The effect is
 * that the WhatsApp outbox is never drained, retention never runs and the
 * weekly digest is never sent, while every in-repo gate is green. The cron
 * workflow itself flapped on it: the five-minute schedule includes `whatsapp`, so
 * `run-cron-jobs.sh` failed every time that schedule fired.
 *
 * WHAT THE STATUS CODES MEAN. These routes are Bearer-guarded, so probing them
 * WITHOUT the secret is a complete test of presence and needs no credential:
 *
 *   401  present and protected            the healthy answer
 *   404  absent from the deployment       the failure this script is for
 *   200  present and NOT protected        a cron route anyone can trigger
 *   000  no response at all               the host is down or unreachable
 *
 * A 200 is reported as a failure of its own kind rather than folded into
 * "fine": a cron route that answers an unauthenticated request is a worse
 * finding than a missing one, and a probe that treated any non-404 as healthy
 * would be the thing that hid it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = join(HERE, 'cron-jobs.json')
const TIMEOUT_MS = 20_000

/** Classification, kept pure so `deployed-cron-probe.test.ts` can drive it. */
export function classify(status) {
  if (status === 401 || status === 403) return { ok: true, verdict: 'protected' }
  if (status === 404) return { ok: false, verdict: 'missing-from-deployment' }
  if (status === 0) return { ok: false, verdict: 'no-response' }
  if (status === 200) return { ok: false, verdict: 'reachable-without-the-secret' }
  return { ok: false, verdict: `unexpected-${status}` }
}

/** Exit code from a whole run, so the shape is testable without the network. */
export function summarize(results) {
  const failed = results.filter((r) => !r.ok)
  return { failed, exitCode: failed.length === 0 ? 0 : 1 }
}

function baseUrl(registry) {
  const configured = process.env.CRON_BASE_URL || process.env.PRODUCTION_URL
  return (configured || registry.defaultBaseUrl).replace(/\/+$/, '')
}

async function probe(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // GET and not HEAD: a framework may answer HEAD from a route it would not
    // serve, and the point here is what a scheduler actually gets.
    const response = await fetch(url, { method: 'GET', signal: controller.signal })
    return response.status
  } catch {
    return 0
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  const base = baseUrl(registry)
  console.log(`probing ${registry.jobs.length} scheduled cron paths on ${base}`)

  const results = []
  for (const job of registry.jobs) {
    const status = await probe(`${base}${job.path}`)
    const { ok, verdict } = classify(status)
    results.push({ name: job.name, path: job.path, status, ok, verdict })
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${job.name.padEnd(18)} ${status} ${verdict}`)
  }

  const { failed, exitCode } = summarize(results)
  if (exitCode === 0) {
    console.log(`\nall ${results.length} scheduled routes are present and protected`)
    return 0
  }

  console.log(`\n${failed.length} of ${results.length} scheduled routes are not serving:`)
  for (const f of failed) console.log(`  ${f.path} -> ${f.status} (${f.verdict})`)
  console.log(
    '\nA route that is in the tree and on main but 404s here means the deployment is older than the route.',
  )
  return exitCode
}

// Only run when invoked directly, so the test can import the pure halves.
if (process.argv[1]?.endsWith('deployed-cron-probe.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
