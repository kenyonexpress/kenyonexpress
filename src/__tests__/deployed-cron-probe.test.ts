import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// Stdlib-only .mjs, deliberately not TypeScript: a lockfile or a transpile
// problem must never be what stops the probe from running in CI.
import { classify, summarize } from '../../scripts/deployed-cron-probe.mjs'

/**
 * THE ONE GATE THAT COMPARES THE REPOSITORY TO WHAT IS SERVING.
 *
 * `cron-schedule-inventory.test.ts` checks `scripts/cron-jobs.json` against the
 * workflow, the docs and `src/app/api/cron/`, in every direction. It is
 * airtight and every side of it is this repository. Nothing asked the
 * deployment, and `production-smoke.yml` probes only `/` and `/api/health` --
 * two routes old enough to be in any build -- so it reported a healthy site
 * while three scheduled jobs were 404.
 *
 * MEASURED 2026-09-09 against https://kenyonexpress.vercel.app, thirteen paths
 * probed unauthenticated:
 *
 *   ten answered 401                     present and Bearer-guarded
 *   whatsapp, retention, weekly-digest   404
 *
 * All three exist in the tree AND on `main`. A route that is on the default
 * branch and 404s in production is not a missing route, it is a deployment
 * older than the route -- and the consequence is that the WhatsApp outbox is
 * never drained, retention never runs and the weekly digest is never sent,
 * with every in-repo gate green.
 *
 * WHAT THIS FILE ASSERTS is the classification, not the network. A test that
 * probed production would be red for reasons outside the commit and would be
 * deleted within a week; the probe belongs in `production-smoke.yml`, which is
 * allowed to be red about production. What has to stay correct here is that
 * 401 means healthy and 200 does NOT -- an unauthenticated 200 from a cron
 * route is a worse finding than a missing one, and folding it into "not 404"
 * is exactly how it would be missed.
 */

const REGISTRY = 'scripts/cron-jobs.json'

describe('what the deployed-cron probe calls healthy', () => {
  it('treats a Bearer refusal as the healthy answer, because the probe carries no secret', () => {
    expect(classify(401)).toEqual({ ok: true, verdict: 'protected' })
    expect(classify(403)).toEqual({ ok: true, verdict: 'protected' })
  })

  it('DEPLOYMENT_OLDER_THAN_ROUTE: 404 is the failure this exists for', () => {
    expect(classify(404)).toEqual({ ok: false, verdict: 'missing-from-deployment' })
  })

  it('CRON_ROUTE_UNPROTECTED: a 200 is a failure of its own kind, not a pass', () => {
    // The trap this test holds shut. "Anything but 404 is fine" would make a
    // cron route that lost its Bearer guard read as healthy, and every job in
    // the registry mutates something.
    const verdict = classify(200)
    expect(verdict.ok).toBe(false)
    expect(verdict.verdict).toBe('reachable-without-the-secret')
  })

  it('does not call an unreachable host healthy', () => {
    expect(classify(0).ok).toBe(false)
    expect(classify(500).ok).toBe(false)
    expect(classify(302).ok).toBe(false)
  })

  it('fails the run when any single path fails, and passes only when none do', () => {
    const healthy = [{ ok: true }, { ok: true }]
    const oneBad = [{ ok: true }, { ok: false, path: '/api/cron/whatsapp' }]
    expect(summarize(healthy).exitCode).toBe(0)
    expect(summarize(oneBad).exitCode).toBe(1)
    expect(summarize(oneBad).failed).toHaveLength(1)
  })
})

describe('the probe covers the whole registry', () => {
  it('reads every job from cron-jobs.json rather than a second hand-kept list', () => {
    // A hardcoded path list in the probe would drift from the registry, and the
    // drifted-away job is exactly the one nobody notices is not running.
    const source = readFileSync(resolve(process.cwd(), 'scripts/deployed-cron-probe.mjs'), 'utf8')
    expect(source).toContain('registry.jobs')
    expect(source).toContain("join(HERE, 'cron-jobs.json')")

    const registry = JSON.parse(readFileSync(resolve(process.cwd(), REGISTRY), 'utf8'))
    expect(registry.jobs.length).toBeGreaterThanOrEqual(13)
    for (const job of registry.jobs) {
      expect(job.path).toMatch(/^\/api\/cron\/[a-z-]+$/)
    }
  })
})
